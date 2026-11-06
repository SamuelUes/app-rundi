package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/config"
	"github.com/rundi/functions-v2/internal/fs"
)

func TestPremiumDispatchIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_DISPATCH_INTEGRATION") != "1" {
		t.Skip("requires disposable local PostgreSQL and Firestore emulator")
	}
	cfgDB, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil || (cfgDB.ConnConfig.Host != "127.0.0.1" && cfgDB.ConnConfig.Host != "localhost") ||
		cfgDB.ConnConfig.Database != "rundi_test" || !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Fatal("requires localhost rundi_test and Firestore emulator")
	}
	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfgDB)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	db, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	suffix := uuid.NewString()
	clientID, normalID, premiumID := "client-"+suffix, "normal-"+suffix, "premium-"+suffix
	area := "area-" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id,role) VALUES ($1,'client'),($2,'driver'),($3,'driver')`, clientID, normalID, premiumID); err != nil {
		t.Fatal(err)
	}
	for i, uid := range []string{normalID, premiumID} {
		var driverID string
		if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id,account_status) VALUES ($1,'active') RETURNING id::text`, uid).Scan(&driverID); err != nil {
			t.Fatal(err)
		}
		year := time.Now().UTC().Year()
		if i == 0 {
			year -= 10
		}
		plate := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
		if _, err := pool.Exec(ctx, `INSERT INTO public.vehicles(driver_id,plate,type,is_active,registration_ocr_year)
			VALUES ($1::uuid,$2,'sedan',true,$3)`, driverID, plate, year); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Collection(fs.ColDriversLive).Doc(uid).Set(ctx, map[string]any{
			"status": "online", "serviceAreaId": area, "vehicleType": "auto",
			"location": map[string]any{"latitude": 12.1 + float64(i)*0.001, "longitude": -86.2},
		}); err != nil {
			t.Fatal(err)
		}
	}
	var rideID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id,firebase_ride_id,service_area_id,pricing_snapshot)
		VALUES ($1,$2,$3,'{"featureCodes":["premium"]}') RETURNING id::text`, clientID, "ride-"+suffix, area).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{"clientId": clientID, "originLat": 12.1, "originLng": -86.2, "serviceAreaId": area, "vehicleType": "auto"}
	cfg := &config.Config{OfferTTL: time.Minute, MatchRadiusKm: 15, MatchMaxOffers: 1}
	if err := dispatchOffers(ctx, pool, db, nil, cfg, pendingEvent{EventID: "event", AggregateID: rideID}, payload); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection(fs.ColDriverOffers).Doc(rideID + "_" + premiumID).Get(ctx); err != nil {
		t.Fatalf("premium driver must receive offer: %v", err)
	}
	if _, err := db.Collection(fs.ColDriverOffers).Doc(rideID + "_" + normalID).Get(ctx); status.Code(err) != codes.NotFound {
		t.Fatalf("non-premium driver must not receive offer: %v", err)
	}
}
