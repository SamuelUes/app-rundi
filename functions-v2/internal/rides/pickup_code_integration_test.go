package rides

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPickupCodeTransition(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires TEST_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var client, captain, follower, rideID string
	for _, entry := range []struct {
		dest *string
		role string
	}{{&client, "client"}, {&captain, "driver"}, {&follower, "driver"}} {
		if err := pool.QueryRow(ctx, `INSERT INTO public.users(id, role)
			VALUES (gen_random_uuid()::text, $1::public.app_role) RETURNING id`, entry.role).Scan(entry.dest); err != nil {
			t.Fatal(err)
		}
	}
	for _, uid := range []string{captain, follower} {
		if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, uid); err != nil {
			t.Fatal(err)
		}
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, follower_driver_id, status)
		VALUES ($1, $2, $3, 'driver_arrived') RETURNING id::text`, client, captain, follower).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_pickup_codes(ride_id, code) VALUES ($1, '0042')`, rideID); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, nil)
	start := func(uid, code string) error {
		_, err := svc.TransitionRide(ctx, rideID, uid, StatusDriverArrived, StatusInProgress, code, t.Name())
		return err
	}
	for _, uid := range []string{client, follower, "stranger"} {
		if err := start(uid, "0042"); err == nil {
			t.Fatalf("non-captain %q started ride", uid)
		}
	}
	for i := 0; i < 5; i++ {
		if err := start(captain, "1111"); err == nil {
			t.Fatal("incorrect code accepted")
		}
	}
	if err := start(captain, "0042"); err == nil {
		t.Fatal("rate limit did not block correct code")
	}
	if _, err := pool.Exec(ctx, `UPDATE public.ride_pickup_codes SET locked_until=now()-interval '1 second' WHERE ride_id=$1`, rideID); err != nil {
		t.Fatal(err)
	}
	if err := start(captain, "0042"); err != nil {
		t.Fatalf("valid code failed: %v", err)
	}
	var status string
	var started bool
	if err := pool.QueryRow(ctx, `SELECT status::text, started_at IS NOT NULL FROM public.rides WHERE id=$1`, rideID).Scan(&status, &started); err != nil || status != "in_progress" || !started {
		t.Fatalf("ride not started: %s %v %v", status, started, err)
	}

	var secondClient, designatedID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.users(id, role) VALUES (gen_random_uuid()::text, 'client') RETURNING id`).Scan(&secondClient); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, follower_driver_id, status, ride_type)
		VALUES ($1, $2, $3, 'driver_arrived', 'designated_driver') RETURNING id::text`, secondClient, captain, follower).Scan(&designatedID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.ride_pickup_codes(ride_id, code) VALUES ($1, '0042')`, designatedID); err != nil {
		t.Fatal(err)
	}
	designatedStart := func(uid string) error {
		_, err := svc.TransitionRide(ctx, designatedID, uid, StatusDriverArrived, StatusInProgress, "0042", t.Name())
		return err
	}
	if err := designatedStart(captain); err == nil {
		t.Fatal("designated ride started without evidence")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.designated_driver_inspections
		(ride_id, driver_id, vehicle_front_photo, vehicle_rear_photo, interior_front_photo, interior_rear_photo)
		VALUES ($1, $2, 'front', 'rear', 'inside-front', 'inside-rear')`, designatedID, captain); err != nil {
		t.Fatal(err)
	}
	if err := designatedStart(follower); err == nil {
		t.Fatal("follower started designated ride")
	}
	if err := designatedStart(captain); err != nil {
		t.Fatalf("designated ride with evidence: %v", err)
	}
}
