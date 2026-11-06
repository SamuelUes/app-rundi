package compliance

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestLockComplianceSignalsIntegration(t *testing.T) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	migration, err := os.ReadFile("../../../database-v2/cloudsql/0016_compliance_signals.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}
	driver := signalKey{kind: "driver", key: "test-" + uuid.NewString()}
	license := signalKey{kind: "license", key: "test-" + uuid.NewString()}
	if _, err := pool.Exec(ctx, `INSERT INTO public.compliance_signals(kind,signal_key,generation)
		VALUES ($1,$2,3),($3,$4,5)`, driver.kind, driver.key, license.kind, license.key); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	got, err := lockComplianceSignals(ctx, tx, []signalKey{license, driver})
	if err != nil || got[driver] != 3 || got[license] != 5 {
		t.Fatalf("signals=%v err=%v", got, err)
	}
	reader, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Rollback(ctx)
	if _, err := lockComplianceSignals(ctx, reader, []signalKey{driver, license}); err != nil {
		t.Fatalf("concurrent validation should share locks: %v", err)
	}
	if err := reader.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	writer, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Rollback(ctx)
	if _, err := writer.Exec(ctx, `SET LOCAL lock_timeout='100ms'`); err != nil {
		t.Fatal(err)
	}
	_, err = writer.Exec(ctx, `UPDATE public.compliance_signals SET generation=generation+1
		WHERE kind=$1 AND signal_key=$2`, license.kind, license.key)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "55P03" {
		t.Fatalf("expected update to wait for shared signal lock, got %v", err)
	}
	if err := writer.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := lockComplianceSignals(ctx, tx, []signalKey{driver, driver}); err == nil {
		t.Fatal("duplicate key accepted")
	}
	if _, err := lockComplianceSignals(ctx, tx, []signalKey{{kind: "invalid", key: "x"}}); err == nil {
		t.Fatal("invalid signal kind accepted")
	}
	if _, err := lockComplianceSignals(ctx, tx, []signalKey{{kind: "driver", key: "missing-" + uuid.NewString()}}); !errors.Is(err, errMissingComplianceSignal) {
		t.Fatalf("missing signal err=%v", err)
	}
	if _, err := lockComplianceSignals(ctx, tx, nil); err == nil {
		t.Fatal("empty signal set accepted")
	}
}
