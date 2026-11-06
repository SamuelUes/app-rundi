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

func TestPublicDriverProjection(t *testing.T) {
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
	suffix := fmt.Sprint(time.Now().UnixNano())
	driver, passenger := "profile-driver-"+suffix, "profile-client-"+suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role, name)
		VALUES ($1, 'driver', 'Conductor'), ($2, 'client', 'Nombre privado')`, driver, passenger); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.ratings WHERE to_user_id = $1`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE client_id = $1`, passenger)
		_, _ = pool.Exec(ctx, `DELETE FROM public.vehicles WHERE driver_id = (SELECT id FROM public.drivers WHERE user_id = $1)`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id IN ($1, $2)`, driver, passenger)
	})
	var driverID, vehicleID, rideID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1) RETURNING id::text`, driver).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.vehicles(driver_id, plate, type, brand, is_active)
		VALUES ($1::uuid, $2, 'sedan', 'Toyota', TRUE) RETURNING id::text`, driverID, "P"+suffix).Scan(&vehicleID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, status)
		VALUES ($1, $2, 'completed') RETURNING id::text`, passenger, driver).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ratings(ride_id, from_user_id, to_user_id, rating, comment, rated_role, safety)
		VALUES ($1::uuid, $2, $3, 5, 'Buen viaje', 'driver', 5)`, rideID, passenger, driver); err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(fs.ColDriverPublic).Doc(driver)
	t.Cleanup(func() { _, _ = ref.Delete(ctx) })
	if err := projectPublicDriver(ctx, pool, client, driver); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	data := snap.Data()
	vehicle, ok := data["vehicle"].(map[string]any)
	if !ok || vehicle["plate"] != "P"+suffix || vehicle["vehicleId"] != nil ||
		data["totalRides"] != int64(1) || data["averageRating"] != float64(5) {
		t.Fatalf("unexpected profile: %#v", data)
	}
	reviews, ok := data["reviews"].([]any)
	if !ok || len(reviews) != 1 {
		t.Fatalf("unexpected reviews: %#v", data["reviews"])
	}
	review, ok := reviews[0].(map[string]any)
	if !ok || review["comment"] != "Buen viaje" || review["fromUserId"] != nil || review["author"] != nil {
		t.Fatalf("review must not include author identity: %#v", reviews[0])
	}
	if _, err := pool.Exec(ctx, `UPDATE public.vehicles SET is_active = FALSE WHERE id = $1::uuid`, vehicleID); err != nil {
		t.Fatal(err)
	}
	if err := projectPublicDriver(ctx, pool, client, driver); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["vehicle"] != nil {
		t.Fatalf("inactive vehicle remains visible: %v, %v", snap, err)
	}
}
