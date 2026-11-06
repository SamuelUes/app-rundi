package reconcile

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestRowRevisionIntegration — el trigger de 0018 asigna revisiones
// estrictamente crecientes en orden de COMMIT por fila: una tx que inicio
// antes pero gana el candado despues escribe la revision mayor (a diferencia
// de updated_at, que refleja el inicio de la tx).
func TestRowRevisionIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_COMPLIANCE_INTEGRATION") != "1" {
		t.Skip("requires local PostgreSQL")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.drivers(
			id uuid PRIMARY KEY, user_id text, updated_at timestamptz,
			compliance_status text, average_rating double precision,
			expo_push_token text, total_rides int,
			balance numeric, debt numeric, last_recharge_at timestamptz
		)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.vehicles(
			id uuid PRIMARY KEY, driver_id uuid, updated_at timestamptz
		)`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.payments(
			id uuid PRIMARY KEY, updated_at timestamptz
		)`); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("../../../database-v2/cloudsql/0018_row_revisions.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}

	driverID := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(id, user_id) VALUES($1, $2)`,
		driverID, "rev-"+uuid.NewString()); err != nil {
		t.Fatal(err)
	}
	var rev int64
	if err := pool.QueryRow(ctx,
		`SELECT revision FROM public.drivers WHERE id=$1`, driverID).Scan(&rev); err != nil || rev != 0 {
		t.Fatalf("insert revision=%d err=%v, want 0", rev, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.drivers SET account_status='x' WHERE id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.drivers SET account_status='x' WHERE id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT revision FROM public.drivers WHERE id=$1`, driverID).Scan(&rev); err != nil || rev != 2 {
		t.Fatalf("after 2 updates revision=%d err=%v, want 2", rev, err)
	}

	// Orden de commit: tx lenta abre el candado, tx rapida espera; la lenta
	// revoca el candado al commit y la rapida escribe la revision siguiente —
	// aunque su UPDATE llego primero al servidor.
	slow, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := slow.Exec(ctx, `UPDATE public.drivers SET account_status='a' WHERE id=$1`, driverID); err != nil {
		t.Fatal(err)
	}
	fastDone := make(chan error, 1)
	go func() {
		tx, err := pool.Begin(ctx)
		if err != nil {
			fastDone <- err
			return
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `UPDATE public.drivers SET account_status='b' WHERE id=$1`, driverID); err != nil {
			fastDone <- err
			return
		}
		fastDone <- tx.Commit(ctx)
	}()
	time.Sleep(200 * time.Millisecond) // la rapida queda bloqueada en el row lock
	if err := slow.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-fastDone; err != nil {
		t.Fatal(err)
	}
	var acct string
	if err := pool.QueryRow(ctx,
		`SELECT account_status, revision FROM public.drivers WHERE id=$1`, driverID).Scan(&acct, &rev); err != nil {
		t.Fatal(err)
	}
	if rev != 4 || acct != "b" {
		t.Fatalf("commit order: account_status=%v revision=%d, want b/4", acct, rev)
	}
}
