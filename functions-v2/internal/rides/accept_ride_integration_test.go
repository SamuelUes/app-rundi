package rides

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestAcceptRide_BindingOffer — el conductor que "acepta" NO se auto-asigna:
// queda una contraoferta vinculante 'sent' al precio acordado y el viaje en
// 'driver_offered' hasta que el cliente confirme (ConfirmDriver). Antes el
// accept asignaba directo y trips_live/oferta 'accepted' aparecían sin
// confirmación del cliente. Requiere Postgres real:
// TEST_DATABASE_URL=postgres://user:pass@host:port/dbname go test -run AcceptRide
func TestAcceptRide_BindingOffer(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL no definido — test de integración omitido")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()

	var clientUID, driverUID, rivalUID, rideID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'client')
		RETURNING id`).Scan(&clientUID); err != nil {
		t.Fatalf("client fixture: %v", err)
	}
	for _, uid := range []*string{&driverUID, &rivalUID} {
		if err := pool.QueryRow(ctx, `
			INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'driver')
			RETURNING id`).Scan(uid); err != nil {
			t.Fatalf("driver user fixture: %v", err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO public.drivers (user_id, account_status)
			VALUES ($1, 'active')`, *uid); err != nil {
			t.Fatalf("driver fixture: %v", err)
		}
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.rides (client_id, status, client_suggested_price, estimated_price)
		VALUES ($1, 'requested', 100, 110) RETURNING id`, clientUID).Scan(&rideID); err != nil {
		t.Fatalf("ride fixture: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=ANY($1)`, []string{driverUID, rivalUID})
		pool.Exec(ctx, `DELETE FROM public.users WHERE id=ANY($1)`, []string{driverUID, rivalUID, clientUID})
	})

	svc := NewService(pool, nil)

	// Driver contraoferta 140 → status driver_offered + counter_offer 'sent'.
	if _, err := svc.NegotiatePrice(ctx, rideID, driverUID, 140, t.Name()); err != nil {
		t.Fatalf("driver negotiate: %v", err)
	}

	// Driver acepta el precio del cliente (100): queda oferta vinculante
	// 'sent'@100 y el viaje sigue 'driver_offered' sin driver asignado.
	r, err := svc.AcceptRide(ctx, rideID, driverUID, t.Name(), nil)
	if err != nil {
		t.Fatalf("accept tras negociación: %v", err)
	}
	if r.Status != StatusDriverOffered {
		t.Fatalf("status=%s (esperado driver_offered, no accepted)", r.Status)
	}
	if r.DriverID != nil {
		t.Fatalf("driver_id=%v (esperado NULL — cliente no ha confirmado)", *r.DriverID)
	}

	var offered float64
	var status string
	if err := pool.QueryRow(ctx, `
		SELECT offered_price, status::text FROM public.ride_offers
		WHERE ride_id=$1 AND driver_id=$2 AND kind='counter_offer'
		ORDER BY created_at DESC LIMIT 1`, rideID, driverUID,
	).Scan(&offered, &status); err != nil {
		t.Fatalf("counter_offer: %v", err)
	}
	if offered != 100 {
		t.Fatalf("counter_offer offered_price=%v (esperado 100)", offered)
	}
	if status != "sent" {
		t.Fatalf("counter_offer status=%s (esperado sent, pendiente de cliente)", status)
	}
	var driverOfferedPrice float64
	var assignedDriver *string
	if err := pool.QueryRow(ctx, `
		SELECT driver_offered_price, driver_id FROM public.rides WHERE id=$1`,
		rideID).Scan(&driverOfferedPrice, &assignedDriver); err != nil {
		t.Fatal(err)
	}
	if driverOfferedPrice != 100 {
		t.Fatalf("driver_offered_price=%v (esperado 100 = precio del cliente)", driverOfferedPrice)
	}
	if assignedDriver != nil {
		t.Fatalf("ride.driver_id=%v (esperado NULL)", *assignedDriver)
	}

	// Un rival también puede aceptar: su oferta coexiste pendiente —
	// el cliente elige. La exclusividad vive en ConfirmDriver.
	if _, err := svc.AcceptRide(ctx, rideID, rivalUID, t.Name(), nil); err != nil {
		t.Fatalf("accept de rival debió producir oferta pendiente: %v", err)
	}
	var offerCount int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM public.ride_offers
		WHERE ride_id=$1 AND kind='counter_offer' AND status='sent'`,
		rideID).Scan(&offerCount); err != nil {
		t.Fatal(err)
	}
	if offerCount < 2 {
		t.Fatalf("esperaba ≥2 counter_offers 'sent' (driver+rival), got %d", offerCount)
	}

	// Outbox: se emite ride.price_offered (nunca ride.accepted sin cliente).
	var eventType string
	if err := pool.QueryRow(ctx, `
		SELECT event_type FROM public.outbox_events
		WHERE aggregate_id=$1 AND event_type='ride.price_offered'
		ORDER BY created_at DESC LIMIT 1`, rideID).Scan(&eventType); err != nil {
		t.Fatalf("outbox ride.price_offered: %v", err)
	}
	var acceptedCount int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM public.outbox_events
		WHERE aggregate_id=$1 AND event_type='ride.accepted'`, rideID,
	).Scan(&acceptedCount); err != nil {
		t.Fatal(err)
	}
	if acceptedCount != 0 {
		t.Fatal("ride.accepted no debe emitirse sin confirmación del cliente")
	}
}
