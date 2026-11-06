package rides

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestNegotiatePrice_ClientBranch — el cliente contraoferta al mismo
// /negotiate del driver. Sin la rama por rol, driver_id del cliente violaba
// la FK de ride_offers y devolvía 500. Requiere Postgres real:
// TEST_DATABASE_URL=postgres://user:pass@host:port/dbname go test -run ClientBranch
func TestNegotiatePrice_ClientBranch(t *testing.T) {
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

	var clientUID, driverUID, strangerUID, rideID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'client')
		RETURNING id`).Scan(&clientUID); err != nil {
		t.Fatalf("client fixture: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'driver')
		RETURNING id`).Scan(&driverUID); err != nil {
		t.Fatalf("driver user fixture: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO public.drivers (user_id, account_status)
		VALUES ($1, 'active')`, driverUID); err != nil {
		t.Fatalf("driver fixture: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'client')
		RETURNING id`).Scan(&strangerUID); err != nil {
		t.Fatalf("stranger fixture: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.rides (client_id, status, client_suggested_price)
		VALUES ($1, 'requested', 100) RETURNING id`, clientUID).Scan(&rideID); err != nil {
		t.Fatalf("ride fixture: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=ANY($1)`, []string{driverUID})
		pool.Exec(ctx, `DELETE FROM public.users WHERE id=ANY($1)`, []string{driverUID, clientUID, strangerUID})
	})

	svc := NewService(pool, nil)

	// Un uid ajeno (ni cliente ni driver) no puede negociar.
	if _, err := svc.NegotiatePrice(ctx, rideID, strangerUID, 120, t.Name()); err == nil {
		t.Fatal("stranger uid debió ser rechazado")
	}

	// Driver contraoferta primero → status driver_offered + row counter_offer.
	if _, err := svc.NegotiatePrice(ctx, rideID, driverUID, 140, t.Name()); err != nil {
		t.Fatalf("driver negotiate: %v", err)
	}

	// Cliente contraoferta — antes devolvía 500 por FK de ride_offers.
	r, err := svc.NegotiatePrice(ctx, rideID, clientUID, 130, t.Name())
	if err != nil {
		t.Fatalf("client negotiate: %v", err)
	}
	if r.Status != StatusDriverOffered {
		t.Fatalf("status tras contraoferta cliente: %s (esperado driver_offered)", r.Status)
	}
	var suggested float64
	var offers int
	if err := pool.QueryRow(ctx, `
		SELECT client_suggested_price,
		       (SELECT count(*) FROM public.ride_offers
		        WHERE ride_id=$1 AND driver_id=$2)
		FROM public.rides WHERE id=$1`, rideID, clientUID,
	).Scan(&suggested, &offers); err != nil {
		t.Fatal(err)
	}
	if suggested != 130 {
		t.Fatalf("client_suggested_price=%v (esperado 130)", suggested)
	}
	if offers != 0 {
		t.Fatalf("el cliente no debe insertar ride_offers (FK) — got %d", offers)
	}

	// Outbox: evento ride.price_suggested para re-proyección.
	var eventType string
	if err := pool.QueryRow(ctx, `
		SELECT event_type FROM public.outbox_events
		WHERE aggregate_id=$1 AND event_type='ride.price_suggested'
		ORDER BY created_at DESC LIMIT 1`, rideID).Scan(&eventType); err != nil {
		t.Fatalf("outbox ride.price_suggested: %v", err)
	}
}
