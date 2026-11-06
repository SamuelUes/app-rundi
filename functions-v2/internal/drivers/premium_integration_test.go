package drivers

import (
	"context"
	"fmt"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPremiumUsesOnlyActiveVehicle(t *testing.T) {
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
	uid := fmt.Sprintf("premium-test-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'driver')`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, uid); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.vehicles WHERE driver_id = (SELECT id FROM public.drivers WHERE user_id = $1)`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.users WHERE id = $1`, uid)
	})

	svc := NewService(pool, nil)
	plate := fmt.Sprintf("P%09d", time.Now().UnixNano()%1_000_000_000)
	currentYear := time.Now().In(time.FixedZone("Managua", -6*60*60)).Year()
	oldYear := currentYear - 10
	kind := "sedan"
	first, err := svc.RegisterVehicle(ctx, uid, VehicleInput{Plate: plate + "-1", Type: &kind, Year: &currentYear, RegistrationOcrYear: &oldYear}, t.Name())
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.RegisterVehicle(ctx, uid, VehicleInput{Plate: plate + "-2", Type: &kind, Year: &oldYear, RegistrationOcrYear: &currentYear}, t.Name())
	if err != nil {
		t.Fatal(err)
	}
	check := func(want bool) {
		t.Helper()
		codes, err := svc.MyFeatureCapabilities(ctx, uid)
		if err != nil {
			t.Fatal(err)
		}
		if got := slices.Contains(codes, "premium"); got != want {
			t.Fatalf("premium = %v, want %v (codes %v)", got, want, codes)
		}
	}
	check(false)
	if err := svc.SwitchVehicle(ctx, uid, second); err != nil {
		t.Fatal(err)
	}
	check(true)
	if err := svc.SwitchVehicle(ctx, uid, first); err != nil {
		t.Fatal(err)
	}
	check(false)
}
