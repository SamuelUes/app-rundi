package compliance

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestComplianceSignalsIntegration(t *testing.T) {
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
	migration, err := os.ReadFile("../../../database-v2/cloudsql/0016_compliance_signals.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}
	key := "test-" + uuid.NewString()
	var version int64
	if err := pool.QueryRow(ctx, `INSERT INTO public.compliance_signals(kind, signal_key)
		VALUES ('driver', $1) RETURNING generation`, key).Scan(&version); err != nil || version != 1 {
		t.Fatalf("initial version=%d err=%v", version, err)
	}
	if err := pool.QueryRow(ctx, `SELECT generation FROM public.compliance_signals
		WHERE kind='driver' AND signal_key=$1`, key+"-missing").Scan(&version); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("missing signal err=%v", err)
	}
	reader, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Rollback(ctx)
	if err := reader.QueryRow(ctx, `SELECT generation FROM public.compliance_signals
		WHERE kind='driver' AND signal_key=$1 FOR SHARE`, key).Scan(&version); err != nil {
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
		WHERE kind='driver' AND signal_key=$1`, key)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "55P03" {
		t.Fatalf("expected lock timeout, got %v", err)
	}
	if err := writer.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err := reader.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `UPDATE public.compliance_signals SET generation=generation+1
		WHERE kind='driver' AND signal_key=$1 RETURNING generation`, key).Scan(&version); err != nil || version != 2 {
		t.Fatalf("committed version=%d err=%v", version, err)
	}
	rolledBack, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := rolledBack.Exec(ctx, `UPDATE public.compliance_signals SET generation=generation+1
		WHERE kind='driver' AND signal_key=$1`, key); err != nil {
		rolledBack.Rollback(ctx)
		t.Fatal(err)
	}
	if err := rolledBack.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT generation FROM public.compliance_signals
		WHERE kind='driver' AND signal_key=$1`, key).Scan(&version); err != nil || version != 2 {
		t.Fatalf("rollback changed version=%d err=%v", version, err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.compliance_signals(kind,signal_key,generation)
		VALUES ('driver',$1,0)`, key+"-invalid"); err == nil {
		t.Fatal("zero generation accepted")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.compliance_signals(kind,signal_key)
		VALUES ('rules',$1)`, key); err == nil {
		t.Fatal("non-global rules signal accepted")
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatalf("migration is not idempotent: %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT generation FROM public.compliance_signals
		WHERE kind='driver' AND signal_key=$1`, key).Scan(&version); err != nil || version != 2 {
		t.Fatalf("reapplying migration changed version=%d err=%v", version, err)
	}
}
