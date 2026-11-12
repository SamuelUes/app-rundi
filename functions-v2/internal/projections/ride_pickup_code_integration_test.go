package projections

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/fs"
)

func TestPickupCodeProjection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires TEST_DATABASE_URL and FIRESTORE_EMULATOR_HOST")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	client, err := firestore.NewClient(ctx, "demo-rundi-pickup")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	suffix := fmt.Sprint(time.Now().UnixNano())
	uid, liveID := "pickup-client-"+suffix, "pickup-live-"+suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'client')`, uid); err != nil {
		t.Fatal(err)
	}
	var id string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, firebase_ride_id, status)
		VALUES ($1, $2, 'accepted') RETURNING id::text`, uid, liveID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_pickup_codes(ride_id, code) VALUES ($1, '0042')`, id); err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(fs.ColTripsLive).Doc(liveID).Collection("private").Doc("pickup")
	if err := projectPickupCode(ctx, pool, client, id); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["code"] != "0042" || snap.Data()["clientId"] != uid {
		t.Fatalf("unexpected private projection: %v", snap.Data())
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET status='in_progress', version=version+1 WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if err := projectPickupCode(ctx, pool, client, id); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["code"] != nil {
		t.Fatalf("code remained available after start: %v", snap.Data())
	}
}
