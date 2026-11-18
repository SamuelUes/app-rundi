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

func TestCounterOfferProjection(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requiere TEST_DATABASE_URL y FIRESTORE_EMULATOR_HOST")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	client, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	driverID, clientID := "offer-driver-"+suffix, "offer-client-"+suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'driver'), ($2, 'client')`, driverID, clientID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE client_id = $1`, clientID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, driverID)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id IN ($1, $2)`, driverID, clientID)
	})
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, driverID); err != nil {
		t.Fatal(err)
	}
	var rideID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, firebase_ride_id, status)
		VALUES ($1, $2, 'driver_offered') RETURNING id::text`, clientID, "offer-ride-"+suffix).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverID)
	t.Cleanup(func() { _, _ = ref.Delete(ctx) })
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_offers(ride_id, driver_id, kind, status)
		VALUES ($1::uuid, $2, 'offer', 'sent')`, rideID, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := ref.Set(ctx, map[string]any{"status": "pending", "clientSuggestedPrice": 100}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET client_suggested_price = 120, version = version + 1 WHERE id = $1::uuid`, rideID); err != nil {
		t.Fatal(err)
	}
	if err := projectDispatchOfferPrices(ctx, pool, client, rideID, "ride.price_suggested"); err != nil {
		t.Fatal(err)
	}
	dispatch, err := ref.Get(ctx)
	if err != nil || dispatch.Data()["clientSuggestedPrice"] != float64(120) || dispatch.Data()["status"] != "pending" {
		t.Fatalf("dispatch price not updated: %v, %v", dispatch, err)
	}
	if dispatch.Data()["lastOfferBy"] != "client" {
		t.Fatalf("lastOfferBy=%v want client", dispatch.Data()["lastOfferBy"])
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_offers(ride_id, driver_id, kind, status, offered_price)
		VALUES ($1::uuid, $2, 'counter_offer', 'sent', 143)`, rideID, driverID); err != nil {
		t.Fatal(err)
	}
	photoRef := client.Collection(fs.ColArrivalPhotos).Doc(driverID)
	t.Cleanup(func() { _, _ = photoRef.Delete(ctx) })
	crewRef := client.Collection(fs.ColDriverCrews).Doc(driverID)
	t.Cleanup(func() { _, _ = crewRef.Delete(ctx) })
	if _, err := crewRef.Set(ctx, map[string]any{
		"status": "active", "captainId": driverID, "followerId": "colleague-" + suffix,
		"follower": map[string]any{
			"driverId": "colleague-" + suffix, "name": "Colleague", "photoURL": "profile.jpg",
			"licenseNumber": "private",
		},
	}); err != nil {
		t.Fatal(err)
	}
	photoPath := "rides-documents/rides-inspection/designated-arrival/" + driverID + "/photo.jpg"
	if _, err := photoRef.Set(ctx, map[string]any{"path": photoPath, "takenAt": time.Now()}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET ride_type = 'designated_driver', version = version + 1 WHERE id = $1::uuid`, rideID); err != nil {
		t.Fatal(err)
	}
	if err := projectCounterOffers(ctx, pool, client, rideID, "ride.price_offered"); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	data := snap.Data()
	if data["rideId"] != rideID || data["clientId"] != clientID || data["driverId"] != driverID ||
		data["status"] != "pending" || data["offeredPrice"] != float64(143) {
		t.Fatalf("unexpected offer: %#v", data)
	}
	if data["lastOfferBy"] != "driver" {
		t.Fatalf("lastOfferBy=%v want driver", data["lastOfferBy"])
	}
	if data["arrivalVehiclePhoto"] != photoPath {
		t.Fatalf("arrivalVehiclePhoto=%v want %s", data["arrivalVehiclePhoto"], photoPath)
	}
	follower, ok := data["crewFollower"].(map[string]any)
	if !ok || follower["name"] != "Colleague" || follower["licenseNumber"] != nil {
		t.Fatalf("unexpected follower: %#v", data["crewFollower"])
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_offers(ride_id, driver_id, kind, status, offered_price, created_at)
		VALUES ($1::uuid, $2, 'counter_offer', 'sent', 150, NOW() + interval '1 second')`, rideID, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET version = version + 1 WHERE id = $1::uuid`, rideID); err != nil {
		t.Fatal(err)
	}
	if err := projectCounterOffers(ctx, pool, client, rideID, "ride.price_offered"); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["offeredPrice"] != float64(150) {
		t.Fatalf("latest counteroffer missing: %v, %v", snap, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.rides SET status = 'canceled', version = version + 1 WHERE id = $1::uuid`, rideID); err != nil {
		t.Fatal(err)
	}
	if err := projectCounterOffers(ctx, pool, client, rideID, "ride.canceled"); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "canceled" {
		t.Fatalf("offer not canceled: %v, %v", snap, err)
	}
	if snap.Data()["lastOfferBy"] != "driver" {
		t.Fatalf("lastOfferBy=%v want preserved driver", snap.Data()["lastOfferBy"])
	}
}
