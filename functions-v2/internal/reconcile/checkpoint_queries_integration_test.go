package reconcile

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCheckpointQueriesIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_RECONCILE_INTEGRATION") != "1" {
		t.Skip("requires a disposable local PostgreSQL database")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("integration test requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	schema := "reconcile_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	schemaName := pgx.Identifier{schema}.Sanitize()
	uuidTable := pgx.Identifier{schema, "uuid_rows"}.Sanitize()
	textTable := pgx.Identifier{schema, "text_rows"}.Sanitize()
	for _, sql := range []string{
		"CREATE SCHEMA " + schemaName,
		"CREATE TABLE " + uuidTable + " (id uuid PRIMARY KEY, updated_at timestamptz, version integer NOT NULL)",
		"CREATE TABLE " + textTable + " (user_id text PRIMARY KEY, updated_at timestamptz, version integer NOT NULL)",
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}

	start := time.Now().UTC().Add(-24 * time.Hour).Truncate(time.Microsecond)
	old := start.Add(time.Hour)
	ids := []string{
		"00000000-0000-0000-0000-000000000001",
		"00000000-0000-0000-0000-000000000002",
		"00000000-0000-0000-0000-000000000003",
	}
	if _, err := pool.Exec(ctx, "INSERT INTO "+uuidTable+" VALUES ($1, $2, 1), ($3, $2, 2)", ids[0], old, ids[1]); err != nil {
		t.Fatal(err)
	}
	// The row is invisible until after the incremental window completes, even
	// though its transaction timestamp belongs to that older window.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "INSERT INTO "+uuidTable+" VALUES ($1, $2, 3)", ids[2], old); err != nil {
		t.Fatal(err)
	}
	q := checkpointQuerySpec{uuidTable, "id", "version::double precision", "uuid", ""}
	key := "changes-test-" + uuid.NewString()
	first, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || first == nil {
		t.Fatalf("claim: checkpoint=%v err=%v", first, err)
	}
	items, err := loadCheckpointItems(ctx, pool, first, 1, q, false)
	if err != nil || len(items) != 1 || items[0].id != ids[0] {
		t.Fatalf("first changes page: items=%v err=%v", items, err)
	}
	if err := saveCheckpoint(ctx, pool, first, items[0].sortTime, items[0].id); err != nil {
		t.Fatal(err)
	}
	if err := releaseCheckpoint(ctx, pool, first); err != nil {
		t.Fatal(err)
	}
	second, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || second == nil {
		t.Fatalf("resume: checkpoint=%v err=%v", second, err)
	}
	items, err = loadCheckpointItems(ctx, pool, second, 10, q, false)
	if err != nil || len(items) != 1 || items[0].id != ids[1] {
		t.Fatalf("resumed changes page: items=%v err=%v", items, err)
	}
	if err := finishCheckpoint(ctx, pool, second); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	next, err := claimCheckpoint(ctx, pool, key, start, 5*time.Second)
	if err != nil || next == nil {
		t.Fatalf("next changes window: checkpoint=%v err=%v", next, err)
	}
	items, err = loadCheckpointItems(ctx, pool, next, 10, q, false)
	if err != nil || len(items) != 0 {
		t.Fatalf("late commit unexpectedly in incremental window: items=%v err=%v", items, err)
	}
	audit, err := claimCheckpoint(ctx, pool, "audit-test-"+uuid.NewString(), start, 5*time.Second)
	if err != nil || audit == nil {
		t.Fatalf("audit claim: checkpoint=%v err=%v", audit, err)
	}
	items, err = loadCheckpointItems(ctx, pool, audit, 10, q, true)
	if err != nil || len(items) != 3 || items[2].id != ids[2] {
		t.Fatalf("audit failed to recover late commit: items=%v err=%v", items, err)
	}

	vehicleQuery := checkpointQuerySpecs["vehicle"]
	vehicleQuery.table = uuidTable
	items, err = loadCheckpointItems(ctx, pool, audit, 10, vehicleQuery, true)
	if err != nil || len(items) != 3 || items[0].version != float64(old.UnixMicro()) {
		t.Fatalf("vehicle versions must use microseconds: items=%v err=%v", items, err)
	}
	legacyQuery := strings.Replace(vehiclesSpec.query, "public.vehicles", uuidTable, 1)
	var id string
	var version float64
	if err := pool.QueryRow(ctx, legacyQuery+" ORDER BY id LIMIT 1", "48 hours").Scan(&id, &version); err != nil {
		t.Fatal(err)
	}
	if version != float64(old.UnixMicro()) {
		t.Fatalf("legacy vehicle version=%v, want microseconds %v", version, old.UnixMicro())
	}

	if _, err := pool.Exec(ctx, "INSERT INTO "+textTable+" VALUES ('a', $1, 1), ('Z', $1, 1), ('_', $1, 1)", old); err != nil {
		t.Fatal(err)
	}
	textQuery := checkpointQuerySpec{textTable, "user_id", "version::double precision", "text", ` COLLATE "C"`}
	textCheckpoint, err := claimCheckpoint(ctx, pool, "text-test-"+uuid.NewString(), start, 5*time.Second)
	if err != nil || textCheckpoint == nil {
		t.Fatalf("text claim: checkpoint=%v err=%v", textCheckpoint, err)
	}
	items, err = loadCheckpointItems(ctx, pool, textCheckpoint, 10, textQuery, false)
	if err != nil || len(items) != 3 || items[0].id != "Z" || items[1].id != "_" || items[2].id != "a" {
		t.Fatalf("C collation ordering: items=%v err=%v", items, err)
	}
}

// A later commit can carry an earlier transaction timestamp. This regression
// documents why audit scans must not trust timestamp-based projection versions.
func TestTransactionTimestampIsNotARevisionIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_RECONCILE_INTEGRATION") != "1" {
		t.Skip("requires a disposable local PostgreSQL database")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("integration test requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	schema := "reconcile_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	schemaName := pgx.Identifier{schema}.Sanitize()
	table := pgx.Identifier{schema, "timestamps"}.Sanitize()
	for _, sql := range []string{
		"CREATE SCHEMA " + schemaName,
		"CREATE TABLE " + table + " (id text PRIMARY KEY, updated_at timestamptz NOT NULL)",
		"INSERT INTO " + table + " VALUES ('driver', NOW())",
	} {
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatal(err)
		}
	}
	olderTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer olderTx.Rollback(ctx)
	var olderStart time.Time
	if err := olderTx.QueryRow(ctx, "SELECT NOW()").Scan(&olderStart); err != nil {
		t.Fatal(err)
	}
	time.Sleep(30 * time.Millisecond)
	newerTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer newerTx.Rollback(ctx)
	if _, err := newerTx.Exec(ctx, "UPDATE "+table+" SET updated_at = NOW() WHERE id = 'driver'"); err != nil {
		t.Fatal(err)
	}
	var previousEventVersion float64
	if err := newerTx.QueryRow(ctx, "SELECT EXTRACT(EPOCH FROM clock_timestamp()) * 1000").Scan(&previousEventVersion); err != nil {
		t.Fatal(err)
	}
	if err := newerTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := olderTx.Exec(ctx, "UPDATE "+table+" SET updated_at = NOW() WHERE id = 'driver'"); err != nil {
		t.Fatal(err)
	}
	if err := olderTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var laterCommitTimestampVersion float64
	if err := pool.QueryRow(ctx, "SELECT EXTRACT(EPOCH FROM updated_at) * 1000 FROM "+table+" WHERE id = 'driver'").
		Scan(&laterCommitTimestampVersion); err != nil {
		t.Fatal(err)
	}
	if laterCommitTimestampVersion >= previousEventVersion {
		t.Fatalf("expected later commit to carry older version: later=%v previous=%v start=%v",
			laterCommitTimestampVersion, previousEventVersion, olderStart)
	}
}
