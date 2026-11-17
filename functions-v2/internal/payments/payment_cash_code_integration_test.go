package payments

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestConfirmCashCode(t *testing.T) {
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

	var clientID, driverUID, rideID string
	for _, entry := range []struct {
		dest *string
		role string
	}{{&clientID, "client"}, {&driverUID, "driver"}} {
		if err := pool.QueryRow(ctx, `INSERT INTO public.users(id, role)
			VALUES (gen_random_uuid()::text, $1::public.app_role) RETURNING id`, entry.role).Scan(entry.dest); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, driverUID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, status)
		VALUES ($1, $2, 'completed') RETURNING id::text`, clientID, driverUID).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payments
		(ride_id, amount, commission, payment_method, payment_provider)
		VALUES ($1, 80, 9.6, 'cash', 'cash')`, rideID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payment_cash_codes(ride_id, code) VALUES ($1, '0042')`, rideID); err != nil {
		t.Fatal(err)
	}

	svc := NewService(pool, nil)
	confirm := func(uid, code string) error {
		_, err := svc.ConfirmCash(ctx, rideID, uid, code, t.Name())
		return err
	}

	if err := confirm(clientID, "0042"); err == nil {
		t.Fatal("client confirmed cash payment")
	}
	if err := confirm(clientID, "1111"); err == nil {
		t.Fatal("client attempted cash code")
	}
	var unauthorizedAttempts int
	if err := pool.QueryRow(ctx, `SELECT failed_attempts FROM public.payment_cash_codes WHERE ride_id=$1`, rideID).Scan(&unauthorizedAttempts); err != nil {
		t.Fatal(err)
	}
	if unauthorizedAttempts != 0 {
		t.Fatalf("unauthorized attempt incremented counter: %d", unauthorizedAttempts)
	}
	// El código es opcional (paridad v1): confirmar sin código liquida el
	// pago aunque exista una fila en payment_cash_codes. Sobre otro ride
	// para no consumir el flujo de intentos del principal.
	var rideNoCodeID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, status)
		VALUES ($1, $2, 'completed') RETURNING id::text`, clientID, driverUID).Scan(&rideNoCodeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payments
		(ride_id, amount, commission, payment_method, payment_provider)
		VALUES ($1, 40, 4.8, 'cash', 'cash')`, rideNoCodeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payment_cash_codes(ride_id, code) VALUES ($1, '0042')`, rideNoCodeID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ConfirmCash(ctx, rideNoCodeID, driverUID, "", t.Name()); err != nil {
		t.Fatalf("confirm without optional code: %v", err)
	}
	for i := 0; i < 5; i++ {
		if err := confirm(driverUID, "1111"); err == nil {
			t.Fatal("incorrect code accepted")
		}
	}
	if err := confirm(driverUID, "0042"); err == nil {
		t.Fatal("rate limit did not block correct code")
	}
	if _, err := pool.Exec(ctx, `UPDATE public.payment_cash_codes SET locked_until=now()-interval '1 second' WHERE ride_id=$1`, rideID); err != nil {
		t.Fatal(err)
	}
	if err := confirm(driverUID, "0042"); err != nil {
		t.Fatalf("valid code failed: %v", err)
	}

	var status string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM public.payments WHERE ride_id=$1`, rideID).Scan(&status); err != nil || status != "confirmed" {
		t.Fatalf("payment not confirmed: %s %v", status, err)
	}

	// Regenerar sobre un pago pendiente: código nuevo, intentos en cero,
	// authentication_method='code' y evento outbox payment.cash_code.
	var ride2ID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, status)
		VALUES ($1, $2, 'completed') RETURNING id::text`, clientID, driverUID).Scan(&ride2ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payments
		(ride_id, amount, commission, payment_method, payment_provider)
		VALUES ($1, 50, 6, 'cash', 'cash')`, ride2ID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.payment_cash_codes(ride_id, code, failed_attempts)
		VALUES ($1, '1111', 3)`, ride2ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.GenerateCashCode(ctx, ride2ID, driverUID, t.Name()); err != nil {
		t.Fatalf("regenerate: %v", err)
	}
	if err := svc.GenerateCashCode(ctx, ride2ID, clientID, t.Name()); err == nil {
		t.Fatal("non-driver regenerated cash code")
	}
	var code, authMethod string
	var attempts int
	if err := pool.QueryRow(ctx, `SELECT c.code, p.authentication_method::text, c.failed_attempts
		FROM public.payment_cash_codes c JOIN public.payments p ON p.ride_id=c.ride_id
		WHERE c.ride_id=$1`, ride2ID).Scan(&code, &authMethod, &attempts); err != nil {
		t.Fatal(err)
	}
	if len(code) != 4 || attempts != 0 || authMethod != "code" {
		t.Fatalf("regenerate state: code=%q attempts=%d auth=%s", code, attempts, authMethod)
	}
	var events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.outbox_events WHERE event_type='payment.cash_code'`).Scan(&events); err != nil || events == 0 {
		t.Fatalf("missing payment.cash_code outbox: %d %v", events, err)
	}
}
