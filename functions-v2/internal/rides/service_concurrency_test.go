package rides

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestAcceptRide_Concurrency — dos conductores aceptan el mismo viaje a la
// vez. Ya NO hay un solo ganador en accept: ambos dejan oferta vinculante
// pendiente y el viaje queda 'driver_offered' — la exclusividad de asignación
// vive en ConfirmDriver (UPDATE ... status IN (requested, driver_offered)),
// que requiere Firestore y se cubre en la app desplegada. Aquí se verifica
// que accepts concurrentes no se serializan mal ni rompen el estado.
// Requiere Postgres real:
// TEST_DATABASE_URL=postgres://user:pass@host:port/dbname go test -run Concurrency
func TestAcceptRide_Concurrency(t *testing.T) {
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

	// Fixture: cliente + 2 drivers + viaje 'requested' sin driver.
	var clientUUID, d1, d2, rideID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'client')
		RETURNING id`).Scan(&clientUUID); err != nil {
		t.Fatalf("client fixture: %v", err)
	}
	for i, d := range []*string{&d1, &d2} {
		if err := pool.QueryRow(ctx, `
			INSERT INTO public.users (id, role) VALUES (gen_random_uuid()::text, 'driver')
			RETURNING id`).Scan(d); err != nil {
			t.Fatalf("driver%d user fixture: %v", i, err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO public.drivers (user_id, account_status)
			VALUES ($1, 'active')`, *d); err != nil {
			t.Fatalf("driver%d fixture: %v", i, err)
		}
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.rides (client_id, status, estimated_price)
		VALUES ($1, 'requested', 100) RETURNING id`, clientUUID).Scan(&rideID); err != nil {
		t.Fatalf("ride fixture: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM public.outbox_events WHERE aggregate_id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=ANY($1)`, []string{d1, d2})
		pool.Exec(ctx, `DELETE FROM public.users WHERE id=ANY($1)`, []string{d1, d2, clientUUID})
	})

	svc := NewService(pool, nil)
	var wg sync.WaitGroup
	type result struct {
		uid string
		err error
	}
	results := make(chan result, 2)
	for _, d := range []string{d1, d2} {
		wg.Add(1)
		go func(uid string) {
			defer wg.Done()
			_, err := svc.AcceptRide(ctx, rideID, uid, t.Name(), nil)
			results <- result{uid, err}
		}(d)
	}
	wg.Wait()
	close(results)

	// Bajo SERIALIZABLE el perdedor aborta con 40001 (retryable): la app
	// reintenta y su oferta queda pendiente igual. Retry del perdedor aquí.
	for res := range results {
		if res.err == nil {
			continue
		}
		t.Logf("accept concurrente abortó (40001 esperado): %v", res.err)
		if _, err := svc.AcceptRide(ctx, rideID, res.uid, t.Name(), nil); err != nil {
			t.Fatalf("retry accept %s: %v", res.uid, err)
		}
	}

	// Ambas ofertas vinculantes coexisten 'sent'; el viaje NO se asignó.
	var pending int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM public.ride_offers
		WHERE ride_id=$1 AND kind='counter_offer' AND status='sent'`,
		rideID).Scan(&pending); err != nil {
		t.Fatal(err)
	}
	if pending != 2 {
		t.Fatalf("counter_offers 'sent'=%d (esperado 2)", pending)
	}
	var status, driverID *string
	if err := pool.QueryRow(ctx,
		`SELECT status::text, driver_id FROM public.rides WHERE id=$1`, rideID,
	).Scan(&status, &driverID); err != nil {
		t.Fatal(err)
	}
	if *status != "driver_offered" || driverID != nil {
		t.Fatalf("ride status=%v driver=%v (esperado driver_offered sin asignar)",
			*status, driverID)
	}
}
