package rides

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestAcceptRide_Concurrency — doc FASE 5: dos conductores intentan aceptar el
// mismo viaje; exactamente uno debe ganar. Requiere Postgres real:
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
			INSERT INTO public.drivers (user_id, account_status)
			VALUES (gen_random_uuid()::text, 'active') RETURNING user_id`).Scan(d); err != nil {
			t.Fatalf("driver%d fixture: %v", i, err)
		}
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO public.rides (client_id, status)
		VALUES ($1, 'requested') RETURNING id`, clientUUID).Scan(&rideID); err != nil {
		t.Fatalf("ride fixture: %v", err)
	}
	t.Cleanup(func() {
		pool.Exec(ctx, `DELETE FROM public.rides WHERE id=$1`, rideID)
		pool.Exec(ctx, `DELETE FROM public.drivers WHERE user_id=ANY($1)`, []string{d1, d2})
		pool.Exec(ctx, `DELETE FROM public.users WHERE id=$1`, clientUUID)
	})

	svc := NewService(pool, nil)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, d := range []string{d1, d2} {
		wg.Add(1)
		go func(uid string) {
			defer wg.Done()
			_, err := svc.AcceptRide(ctx, rideID, uid, t.Name(), nil)
			results <- err
		}(d)
	}
	wg.Wait()
	close(results)

	wins, conflicts := 0, 0
	for err := range results {
		if err == nil {
			wins++
		} else {
			conflicts++
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("aceptación atómica rota: wins=%d conflicts=%d (esperado 1/1)", wins, conflicts)
	}
}
