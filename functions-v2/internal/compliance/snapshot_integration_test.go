package compliance

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type scopedFactsTx struct {
	pgx.Tx
	schema string
}

func (q scopedFactsTx) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return q.Tx.Query(ctx, strings.ReplaceAll(sql, "public.", q.schema+"."), args...)
}

func (q scopedFactsTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return q.Tx.QueryRow(ctx, strings.ReplaceAll(sql, "public.", q.schema+"."), args...)
}

func (q scopedFactsTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return q.Tx.Exec(ctx, strings.ReplaceAll(sql, "public.", q.schema+"."), args...)
}

func TestComplianceFactsSnapshotIntegration(t *testing.T) {
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
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	schema := pgx.Identifier{"compliance_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")}.Sanitize()
	for _, sql := range []string{
		"CREATE SCHEMA " + schema,
		"CREATE TABLE " + schema + `.drivers (id uuid PRIMARY KEY, user_id text, deleted_at timestamptz, account_status text, documents_status text)`,
		"CREATE TABLE " + schema + `.driver_licenses (id uuid, driver_id uuid, status text, license_number text, license_type text,
			categories text[], issue_date date, expiry_date date, reported_status text,
			is_current boolean, deleted_at timestamptz, created_at timestamptz)`,
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	id, uid := uuid.NewString(), "test-"+uuid.NewString()
	if _, err := pool.Exec(ctx, "INSERT INTO "+schema+`.drivers (id,user_id,account_status) VALUES ($1,$2,'active')`, id, uid); err != nil {
		t.Fatal(err)
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	reader := scopedFactsTx{Tx: tx, schema: schema}
	read := func() string {
		facts, err := loadFactsWithQuerier(ctx, reader, uid, "", "", "2026-11-05")
		if err != nil || facts.Driver == nil || facts.Driver.AccountStatus == nil {
			t.Fatalf("facts=%v err=%v", facts, err)
		}
		return *facts.Driver.AccountStatus
	}
	if got := read(); got != "active" {
		t.Fatalf("first status=%s", got)
	}
	if _, err := pool.Exec(ctx, "UPDATE "+schema+`.drivers SET account_status='suspended' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if got := read(); got != "active" {
		t.Fatalf("snapshot changed to %s", got)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}
