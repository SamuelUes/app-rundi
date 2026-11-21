package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/compliance"
	"github.com/rundi/functions-v2/internal/fs"
)

func TestArchiveComplianceHistoryValidation(t *testing.T) {
	// Invalid events are rejected before touching SQL.
	err := archiveComplianceHistory(context.Background(), nil, map[string]any{
		"aggregateId": "owner",
		"createdAt":   time.Now(),
		"payload": map[string]any{
			"eventId": uuid.NewString(), "uid": "other", "kind": "documents_changed",
			"revision": int64(1), "snapshot": map[string]any{},
		},
	})
	if err == nil {
		t.Fatal("accepted a mismatched owner")
	}
}

func TestComplianceHistoryEndToEnd(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" || !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires local PostgreSQL and Firestore emulator")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "localhost" && cfg.ConnConfig.Host != "127.0.0.1") || cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	client, err := firestore.NewClient(ctx, "demo-rundi-history-"+uuid.NewString())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	uid := "history-test-" + uuid.NewString()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_compliance_history WHERE driver_uid=$1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_compliance_sync_checkpoints WHERE driver_uid=$1`, uid)
		docs, _ := client.Collection(fs.ColPendingEvents).Documents(ctx).GetAll()
		for _, doc := range docs {
			_, _ = client.Collection(fs.ColProcessedEvents).Doc(doc.Ref.ID).Delete(ctx)
			_, _ = doc.Ref.Delete(ctx)
		}
	}()
	if err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		return compliance.QueueComplianceHistory(tx, client, uid, "documents_changed", 1,
			map[string]any{"expiryDate": "2030-01-01"})
	}); err != nil {
		t.Fatal(err)
	}
	count, err := processPendingEventsWithHandler(ctx, client, func(ctx context.Context, eventType string, data map[string]any) (string, error) {
		return applyPendingEvent(ctx, pool, client, nil, nil, eventType, data)
	})
	if err != nil || count != 1 {
		t.Fatalf("history processing: count=%d error=%v", count, err)
	}
	var archived int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.driver_compliance_history
		WHERE driver_uid=$1 AND snapshot->>'expiryDate'='2030-01-01'`, uid).Scan(&archived); err != nil || archived != 1 {
		t.Fatalf("missing history: count=%d error=%v", archived, err)
	}
	count, err = processPendingEventsWithHandler(ctx, client, func(ctx context.Context, eventType string, data map[string]any) (string, error) {
		return applyPendingEvent(ctx, pool, client, nil, nil, eventType, data)
	})
	if err != nil || count != 0 {
		t.Fatalf("history reprocessed: count=%d error=%v", count, err)
	}
}

func TestArchiveComplianceHistoryIdempotent(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires local PostgreSQL")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "localhost" && cfg.ConnConfig.Host != "127.0.0.1") || cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	id, uid := uuid.NewString(), "history-test-"+uuid.NewString()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_compliance_history WHERE driver_uid = $1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_compliance_sync_checkpoints WHERE driver_uid = $1`, uid)
	}()
	event := map[string]any{
		"aggregateId": uid, "createdAt": time.Now(),
		"payload": map[string]any{
			"eventId": id, "uid": uid, "kind": "documents_changed",
			"revision": int64(1), "snapshot": map[string]any{"expiryDate": "2030-01-01"},
		},
	}
	for range 2 {
		if err := archiveComplianceHistory(ctx, pool, event); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	var expiry string
	err = pool.QueryRow(ctx, `SELECT COUNT(*), MAX(snapshot->>'expiryDate')
		FROM public.driver_compliance_history WHERE event_id = $1::uuid`, id).Scan(&count, &expiry)
	if err != nil || count != 1 || expiry != "2030-01-01" {
		t.Fatalf("history count=%d expiry=%q error=%v", count, expiry, err)
	}
	event["payload"].(map[string]any)["snapshot"] = map[string]any{"expiryDate": "2031-01-01"}
	if err := archiveComplianceHistory(ctx, pool, event); err == nil {
		t.Fatal("accepted a reused event ID with different contents")
	}
}

func TestComplianceHistoryCheckpointGaps(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires local PostgreSQL")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "localhost" && cfg.ConnConfig.Host != "127.0.0.1") || cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	uid := "checkpoint-test-" + uuid.NewString()
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_compliance_history WHERE driver_uid=$1`, uid)
		_, _ = pool.Exec(ctx, `DELETE FROM public.driver_compliance_sync_checkpoints WHERE driver_uid=$1`, uid)
	}()
	for _, tc := range []struct{ revision, want int64 }{{3, 0}, {1, 1}, {2, 3}} {
		event := map[string]any{
			"aggregateId": uid, "createdAt": time.Now(),
			"payload": map[string]any{
				"eventId": uuid.NewString(), "uid": uid, "kind": "documents_changed",
				"revision": tc.revision, "snapshot": map[string]any{},
			},
		}
		if err := archiveComplianceHistory(ctx, pool, event); err != nil {
			t.Fatal(err)
		}
		var checkpoint int64
		if err := pool.QueryRow(ctx, `SELECT document_revision FROM public.driver_compliance_sync_checkpoints
			WHERE driver_uid=$1`, uid).Scan(&checkpoint); err != nil || checkpoint != tc.want {
			t.Fatalf("revision %d: checkpoint %d want %d: %v", tc.revision, checkpoint, tc.want, err)
		}
	}
}
