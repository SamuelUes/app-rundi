package payments

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfirmCashWalletCommission(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires isolated TEST_DATABASE_URL with migration 0027")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	var client, driver string
	for _, user := range []struct {
		id   *string
		role string
	}{{&client, "client"}, {&driver, "driver"}} {
		if err := pool.QueryRow(ctx, `INSERT INTO public.users(id, role)
			VALUES (gen_random_uuid()::text, $1::public.app_role) RETURNING id`, user.role).Scan(user.id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id, current_recharge_balance) VALUES ($1, 10)`, driver); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, nil)
	for _, tc := range []struct {
		name       string
		eligible   bool
		commission float64
		balance    float64
		movements  int
		status     string
	}{
		{"old ride", false, 3, 10, 0, "pending"},
		{"new ride", true, 12.25, -2.25, 1, "paid"},
		{"zero commission", true, 0, -2.25, 0, "paid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var rideID, paymentID string
			if err := pool.QueryRow(ctx, `INSERT INTO public.rides(firebase_ride_id, client_id, driver_id, status, wallet_commission_enabled)
				VALUES (gen_random_uuid()::text, $1, $2, 'completed', $3) RETURNING id::text`, client, driver, tc.eligible).Scan(&rideID); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `INSERT INTO public.payments
				(ride_id, amount, commission, payment_method, payment_provider)
				VALUES ($1, 100, $2, 'cash', 'cash') RETURNING id::text`, rideID, tc.commission).Scan(&paymentID); err != nil {
				t.Fatal(err)
			}
			if _, err := svc.ConfirmCash(ctx, rideID, driver, "", t.Name()); err != nil {
				t.Fatal(err)
			}
			if _, err := svc.ConfirmCash(ctx, rideID, driver, "", t.Name()); err == nil {
				t.Fatal("duplicate confirmation succeeded")
			}
			var balance float64
			var status string
			var movements, events int
			if err := pool.QueryRow(ctx, `SELECT current_recharge_balance FROM public.drivers WHERE user_id=$1`, driver).Scan(&balance); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT commission_status::text FROM public.payments WHERE id=$1`, paymentID).Scan(&status); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.driver_wallet_movements
				WHERE ride_id=$1 AND movement_type='commission_deduction' AND amount=-$2::numeric
				  AND balance_after=balance_before+amount`, rideID, tc.commission).Scan(&movements); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.outbox_events
				WHERE event_type='driver.wallet_debited' AND aggregate_id=$1 AND payload->>'rideId'=$2`, driver, rideID).Scan(&events); err != nil {
				t.Fatal(err)
			}
			if balance != tc.balance || status != tc.status || movements != tc.movements || events != tc.movements {
				t.Fatalf("balance=%v status=%s movements=%d events=%d", balance, status, movements, events)
			}
		})
	}
}
