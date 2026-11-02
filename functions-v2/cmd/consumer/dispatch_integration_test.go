package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/config"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/matching"
	"github.com/rundi/functions-v2/internal/notifications"
	"github.com/rundi/functions-v2/internal/rides"
)

// This test only runs against an explicitly enabled, disposable local database
// and a local Firestore emulator. It never deletes data.
func TestDispatchRecoveryIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_DISPATCH_INTEGRATION") != "1" {
		t.Skip("requires a disposable local PostgreSQL database and Firestore emulator")
	}
	dsn := os.Getenv("TEST_DATABASE_URL")
	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if (poolConfig.ConnConfig.Host != "127.0.0.1" && poolConfig.ConnConfig.Host != "localhost") ||
		poolConfig.ConnConfig.Database != "rundi_test" ||
		!strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Fatal("integration test requires localhost rundi_test and a localhost Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
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
	clientID, driverID := "client-"+suffix, "driver-"+suffix
	liveID, areaID := "live-"+suffix, "area-"+suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client'), ($2, 'driver')`, clientID, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1, 'active')`, driverID); err != nil {
		t.Fatal(err)
	}
	var rideID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.rides (client_id, firebase_ride_id, service_area_id, status)
		VALUES ($1, $2, $3, 'requested') RETURNING id::text`, clientID, liveID, areaID).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{
		"rideId": rideID, "firebaseRideId": liveID, "clientId": clientID,
		"status": "requested", "version": 1, "originLat": 0, "originLng": 0,
		"serviceAreaId": areaID, "vehicleType": "auto",
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var eventID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload, created_at)
		VALUES ('ride.requested', 'ride', $1, $2, '2000-01-01') RETURNING event_id::text`,
		rideID, raw).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{OfferTTL: time.Minute, MatchRadiusKm: 15, MatchMaxOffers: 10}
	notify := notifications.NewCenter(db, nil)
	if _, err := sweep(ctx, pool, db, nil, notify, cfg); err != nil {
		t.Fatal(err)
	}
	var eventStatus string
	var attempts int
	if err := pool.QueryRow(ctx, `SELECT status::text, attempts FROM public.outbox_events WHERE event_id=$1`, eventID).
		Scan(&eventStatus, &attempts); err != nil || eventStatus != "pending" || attempts != 1 {
		t.Fatalf("failed dispatch must remain pending: status=%q attempts=%d err=%v", eventStatus, attempts, err)
	}

	// Simulate a crash after reserving a candidate, then the driver going
	// offline before recovery. The original expiration must survive the retry.
	expires := time.Now().UTC().Add(time.Minute).Truncate(time.Microsecond)
	if _, err := pool.Exec(ctx, `
		INSERT INTO public.ride_offers (ride_id, driver_id, kind, status, distance_km, expires_at)
		VALUES ($1, $2, 'offer', 'sent', 1.5, $3)`, rideID, driverID, expires); err != nil {
		t.Fatal(err)
	}
	payload["originLat"], payload["originLng"] = 12.1, -86.2
	raw, _ = json.Marshal(payload)
	if _, err := pool.Exec(ctx, `UPDATE public.outbox_events SET payload=$2, next_attempt_at=NOW() WHERE event_id=$1`, eventID, raw); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := sweep(ctx, pool, db, nil, notify, cfg)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	offerRef := db.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverID)
	snap, err := offerRef.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["status"] != "pending" || !snap.Data()["expiresAt"].(time.Time).Equal(expires) {
		t.Fatalf("unexpected recovered offer: %v", snap.Data())
	}
	// attempts cuenta claims (lease): 1ª corrida fallida + recuperación.
	if err := pool.QueryRow(ctx, `SELECT status::text, attempts FROM public.outbox_events WHERE event_id=$1`, eventID).
		Scan(&eventStatus, &attempts); err != nil || eventStatus != "published" || attempts != 2 {
		t.Fatalf("recovery status=%q attempts=%d err=%v", eventStatus, attempts, err)
	}

	if _, err := offerRef.Update(ctx, []firestore.Update{{Path: "status", Value: "rejected"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.ride_offers SET status='rejected' WHERE ride_id=$1 AND driver_id=$2`, rideID, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection(fs.ColDriversLive).Doc(driverID).Set(ctx, map[string]any{
		"status": "online", "serviceAreaId": areaID, "vehicleType": "auto",
		"location": map[string]any{"latitude": 12.1, "longitude": -86.2},
	}); err != nil {
		t.Fatal(err)
	}
	if err := dispatchOffers(ctx, pool, db, nil, cfg, pendingEvent{EventID: eventID, AggregateID: rideID}, payload); err != nil {
		t.Fatal(err)
	}
	snap, err = offerRef.Get(ctx)
	if err != nil || snap.Data()["status"] != "rejected" {
		t.Fatalf("retry reopened a rejected offer: snapshot=%v err=%v", snap, err)
	}

	// A newly matched driver gets one SQL reservation and one Firestore offer.
	otherID := "driver2-" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'driver')`, otherID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1, 'active')`, otherID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection(fs.ColDriversLive).Doc(otherID).Set(ctx, map[string]any{
		"status": "online", "serviceAreaId": areaID, "vehicleType": "auto",
		"location": map[string]any{"latitude": 12.1, "longitude": -86.2},
	}); err != nil {
		t.Fatal(err)
	}
	event := pendingEvent{EventID: eventID, AggregateID: rideID}
	if err := dispatchOffers(ctx, pool, db, nil, cfg, event, payload); err != nil {
		t.Fatal(err)
	}
	var originalExpiry time.Time
	var offerStatus string
	if err := pool.QueryRow(ctx, `
		SELECT status::text, expires_at FROM public.ride_offers
		WHERE ride_id=$1 AND driver_id=$2 AND kind='offer'`, rideID, otherID).
		Scan(&offerStatus, &originalExpiry); err != nil || offerStatus != "sent" {
		t.Fatalf("new reservation status=%q err=%v", offerStatus, err)
	}
	otherRef := db.Collection(fs.ColDriverOffers).Doc(rideID + "_" + otherID)
	other, err := otherRef.Get(ctx)
	if err != nil || !other.Data()["expiresAt"].(time.Time).Equal(originalExpiry) {
		t.Fatalf("new offer expiration differs from SQL: snapshot=%v err=%v", other, err)
	}
	if err := dispatchOffers(ctx, pool, db, nil, cfg, event, payload); err != nil {
		t.Fatal(err)
	}
	var retryExpiry time.Time
	if err := pool.QueryRow(ctx, `
		SELECT expires_at FROM public.ride_offers
		WHERE ride_id=$1 AND driver_id=$2 AND kind='offer'`, rideID, otherID).Scan(&retryExpiry); err != nil || !retryExpiry.Equal(originalExpiry) {
		t.Fatalf("retry extended expiry: first=%v retry=%v err=%v", originalExpiry, retryExpiry, err)
	}
	// Acceptance closes other SQL offers and the consumer closes their live
	// projections, but does not overwrite a prior rejection.
	thirdID := "driver3-" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'driver')`, thirdID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1, 'active')`, thirdID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Collection(fs.ColDriversLive).Doc(thirdID).Set(ctx, map[string]any{
		"status": "online", "serviceAreaId": areaID, "vehicleType": "auto",
		"location": map[string]any{"latitude": 12.1, "longitude": -86.2},
	}); err != nil {
		t.Fatal(err)
	}
	if err := dispatchOffers(ctx, pool, db, nil, cfg, event, payload); err != nil {
		t.Fatal(err)
	}
	if _, err := rides.NewService(pool, db).AcceptRide(ctx, rideID, otherID, "test", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := sweep(ctx, pool, db, nil, notify, cfg); err != nil {
		t.Fatal(err)
	}
	for driver, want := range map[string]string{driverID: "rejected", otherID: "accepted", thirdID: "canceled"} {
		doc, err := db.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driver).Get(ctx)
		if err != nil || doc.Data()["status"] != want {
			t.Fatalf("driver %s: expected %q, got %v (%v)", driver, want, doc, err)
		}
	}
	if err := pool.QueryRow(ctx, `
		SELECT status::text FROM public.ride_offers WHERE ride_id=$1 AND driver_id=$2 AND kind='offer'`,
		rideID, thirdID).Scan(&offerStatus); err != nil || offerStatus != "canceled" {
		t.Fatalf("losing SQL offer status=%q err=%v", offerStatus, err)
	}
	if err := dispatchOffers(ctx, pool, db, nil, cfg, event, payload); err != nil {
		t.Fatal(err)
	}
	if _, err := rides.NewService(pool, db).CancelRide(ctx, rideID, clientID, "client", "test", "test"); err != nil {
		t.Fatal(err)
	}
	if _, err := sweep(ctx, pool, db, nil, notify, cfg); err != nil {
		t.Fatal(err)
	}
	for driver, want := range map[string]string{driverID: "rejected", otherID: "canceled", thirdID: "canceled"} {
		doc, err := db.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driver).Get(ctx)
		if err != nil || doc.Data()["status"] != want {
			t.Fatalf("canceled ride, driver %s: expected %q, got %v (%v)", driver, want, doc, err)
		}
	}

	// A cancellation holding the ride lock wins over a concurrent reservation.
	secondClient := "client2-" + suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client')`, secondClient); err != nil {
		t.Fatal(err)
	}
	var canceledRide string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, status) VALUES ($1, 'requested') RETURNING id::text`, secondClient).
		Scan(&canceledRide); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT id FROM public.rides WHERE id=$1::uuid FOR NO KEY UPDATE`, canceledRide); err != nil {
		t.Fatal(err)
	}
	reservationDone := make(chan error, 1)
	go func() {
		reservationDone <- reserveOffers(ctx, pool, canceledRide,
			[]matching.Candidate{{DriverUID: driverID, DistanceKm: 1}}, time.Minute)
	}()
	select {
	case err := <-reservationDone:
		t.Fatalf("reservation did not wait for ride lock: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if _, err := tx.Exec(ctx, `UPDATE public.rides SET status='canceled' WHERE id=$1::uuid`, canceledRide); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-reservationDone; err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.ride_offers WHERE ride_id=$1`, canceledRide).Scan(&count); err != nil || count != 0 {
		t.Fatalf("reservation after cancellation: count=%d err=%v", count, err)
	}
	// Even an old reservation cannot create a new live offer after cancellation.
	if _, err := pool.Exec(ctx, `
		INSERT INTO public.ride_offers (ride_id, driver_id, kind, status, expires_at)
		VALUES ($1, $2, 'offer', 'sent', NOW() + interval '1 minute')`, canceledRide, driverID); err != nil {
		t.Fatal(err)
	}
	created, err := publishReservedOffer(ctx, pool, db, canceledRide, driverID, map[string]any{"status": "pending"})
	if err != nil || created {
		t.Fatalf("published after cancellation: created=%v err=%v", created, err)
	}
	if _, err := db.Collection(fs.ColDriverOffers).Doc(canceledRide+"_"+driverID).Set(ctx, map[string]any{
		"rideId": canceledRide, "driverId": driverID, "status": "pending",
	}); err != nil {
		t.Fatal(err)
	}
	if err := closePendingRideOffers(ctx, pool, db, canceledRide); err != nil {
		t.Fatal(err)
	}
	closed, err := db.Collection(fs.ColDriverOffers).Doc(canceledRide + "_" + driverID).Get(ctx)
	if err != nil || closed.Data()["status"] != "canceled" {
		t.Fatalf("canceled offer not closed: %v err=%v", closed, err)
	}
}
