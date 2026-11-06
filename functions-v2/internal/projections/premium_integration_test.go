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

func TestActiveVehicleProjection(t *testing.T) {
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
	uid := fmt.Sprintf("premium-projection-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'driver')`, uid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.vehicles WHERE driver_id = (SELECT id FROM public.drivers WHERE user_id = $1)`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
	})
	var driverID, vehicleID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1) RETURNING id::text`, uid).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	plate := fmt.Sprintf("R%09d", time.Now().UnixNano()%1_000_000_000)
	if err := pool.QueryRow(ctx, `INSERT INTO public.vehicles(driver_id, plate, type, is_active, registration_ocr_year)
		VALUES ($1::uuid, $2, 'sedan', TRUE, 2022) RETURNING id::text`, driverID, plate).Scan(&vehicleID); err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(fs.ColDriversLive).Doc(uid).Collection("vehicles").Doc("active")
	t.Cleanup(func() { _, _ = ref.Delete(ctx) })
	if err := projectActiveVehicle(ctx, pool, client, uid, map[string]any{"version": float64(10)}); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	data := snap.Data()
	if data["vehicleId"] != vehicleID || data["ocrYear"] != int64(2022) || data["premiumBadge"] != "premium" {
		t.Fatalf("proyección inesperada: %#v", data)
	}
	until, ok := data["premiumUntil"].(time.Time)
	if !ok || !until.Equal(time.Date(2027, 7, 1, 6, 0, 0, 0, time.UTC)) {
		t.Fatalf("fin de prórroga inesperado: %v", data["premiumUntil"])
	}
	if _, err := pool.Exec(ctx, `UPDATE public.vehicles SET is_active = FALSE WHERE id = $1::uuid`, vehicleID); err != nil {
		t.Fatal(err)
	}
	if err := projectActiveVehicle(ctx, pool, client, uid, map[string]any{"version": float64(11)}); err != nil {
		t.Fatal(err)
	}
	// Un evento viejo no debe restaurar datos anteriores.
	if err := projectActiveVehicle(ctx, pool, client, uid, map[string]any{"version": float64(10)}); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["vehicleId"] != nil {
		t.Fatalf("vehículo no limpiado: %v, %v", snap.Data(), err)
	}
}
