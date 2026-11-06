package rides

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPremiumEligibilityBoundaries(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	tests := []struct {
		name string
		year *int
		kind string
		at   string
		want bool
	}{
		{"before model year", intPtr(2022), "sedan", "2021-12-31 23:59:59-06", false},
		{"first year", intPtr(2022), "sedan", "2022-01-01 00:00:00-06", true},
		{"last normal year", intPtr(2022), "sedan", "2026-12-31 23:59:59-06", true},
		{"grace starts", intPtr(2022), "sedan", "2027-01-01 00:00:00-06", true},
		{"grace ends", intPtr(2022), "sedan", "2027-06-30 23:59:59-06", true},
		{"expired", intPtr(2022), "sedan", "2027-07-01 00:00:00-06", false},
		{"motorcycle", intPtr(2022), "moto", "2026-01-01 00:00:00-06", false},
		{"no OCR year", nil, "sedan", "2026-01-01 00:00:00-06", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got bool
			err := pool.QueryRow(ctx, `SELECT public.vehicle_premium_eligible($1, $2, $3::timestamptz)`,
				tt.year, tt.kind, tt.at).Scan(&got)
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func intPtr(v int) *int { return &v }

func TestSeniorRideRequiresOptIn(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	driver, client := "senior-driver-"+suffix, "senior-client-"+suffix
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'driver'), ($2, 'client')`, driver, client); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE client_id = $1`, client)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id IN ($1, $2)`, driver, client)
	})
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, driver); err != nil {
		t.Fatal(err)
	}
	var rideID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, firebase_ride_id, pricing_snapshot, estimated_price)
		VALUES ($1, $2, '{"featureCodes":["senior"]}', 100) RETURNING id::text`, client, "senior-ride-"+suffix).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, nil)
	if _, err := svc.NegotiatePrice(ctx, rideID, driver, 100, t.Name()); err == nil {
		t.Fatal("senior negotiation must require opt-in")
	}
	if _, err := svc.AcceptRide(ctx, rideID, driver, t.Name(), nil); err == nil {
		t.Fatal("senior acceptance must require opt-in")
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO public.driver_feature_assignments(driver_id, feature_id, granted_by)
		SELECT d.id, f.id, 'test' FROM public.drivers d CROSS JOIN public.features f
		WHERE d.user_id = $1 AND f.code = 'senior'`, driver); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AcceptRide(ctx, rideID, driver, t.Name(), nil); err != nil {
		t.Fatalf("opted-in driver should be eligible: %v", err)
	}
}

func TestPremiumAcceptRequiresActiveVehicle(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	driver, client := "premium-driver-"+suffix, "premium-client-"+suffix
	_, err = pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'driver'), ($2, 'client')`, driver, client)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.rides WHERE client_id = $1`, client)
		_, _ = pool.Exec(ctx, `DELETE FROM public.vehicles WHERE driver_id = (SELECT id FROM public.drivers WHERE user_id = $1)`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, driver)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id IN ($1, $2)`, driver, client)
	})
	var driverID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1) RETURNING id::text`, driver).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	year := time.Now().In(time.FixedZone("Managua", -6*60*60)).Year()
	var active, inactive string
	plate := fmt.Sprintf("Q%09d", time.Now().UnixNano()%1_000_000_000)
	if err := pool.QueryRow(ctx, `INSERT INTO public.vehicles(driver_id, plate, type, is_active, year, registration_ocr_year)
		VALUES ($1::uuid, $2, 'sedan', TRUE, $3, $4) RETURNING id::text`, driverID, plate+"1", year, year-10).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.vehicles(driver_id, plate, type, is_active, year, registration_ocr_year)
		VALUES ($1::uuid, $2, 'sedan', FALSE, $3, $3) RETURNING id::text`, driverID, plate+"2", year).Scan(&inactive); err != nil {
		t.Fatal(err)
	}
	var rideID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, firebase_ride_id, pricing_snapshot, estimated_price)
		VALUES ($1, $2, '{"featureCodes":["premium"]}', 100) RETURNING id::text`, client, "premium-ride-"+suffix).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, nil)
	if _, err := svc.AcceptRide(ctx, rideID, driver, t.Name(), nil); err == nil {
		t.Fatal("un vehículo inactivo no debe habilitar un viaje premium")
	}
	if _, err := pool.Exec(ctx, `UPDATE public.vehicles SET is_active = (id = $1::uuid) WHERE driver_id = $2::uuid`, inactive, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AcceptRide(ctx, rideID, driver, t.Name(), nil); err != nil {
		t.Fatalf("vehículo activo premium: %v", err)
	}
}
