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

	"github.com/rundi/functions-v2/internal/fs"
)

func TestMissedCallArchiveRetryIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_CALL_ARCHIVE_INTEGRATION") != "1" ||
		!strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires disposable local PostgreSQL and Firestore emulator")
	}
	cfg, err := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	if (cfg.ConnConfig.Host != "127.0.0.1" && cfg.ConnConfig.Host != "localhost") ||
		cfg.ConnConfig.Database != "rundi_test" {
		t.Fatal("integration test requires localhost rundi_test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.call_sessions (
			call_id text PRIMARY KEY, call_type text NOT NULL, ride_id text,
			complaint_id text, operator_uid text, client_uid text NOT NULL,
			driver_uid text, direction text NOT NULL, status text NOT NULL,
			recording_url text, signaling_notes jsonb, created_at timestamptz,
			updated_at timestamptz, connected_at timestamptz, ended_at timestamptz
		)`); err != nil {
		t.Fatal(err)
	}
	brokenPool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	brokenPool.Close()
	client, err := firestore.NewClient(ctx, "demo-archive-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	callID := uuid.NewString()
	if _, err := client.Collection(fs.ColCalls).Doc(callID).Set(ctx, map[string]any{
		"callerUid": "client", "calleeUid": "driver", "clientUid": "client", "driverUid": "driver",
		"callType": "ride", "direction": "client_to_driver", "status": "missed",
		"createdAt": time.Now().Add(-time.Minute), "endedAt": time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	event := client.Collection(fs.ColPendingEvents).NewDoc()
	if _, err := event.Set(ctx, map[string]any{
		"eventType": "call_ended", "aggregateType": "call", "aggregateId": callID,
		"payload": map[string]any{"callId": callID, "uid": "client"},
		"status":  "pending", "source": "server", "createdAt": time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	handler := func(db *pgxpool.Pool) func(context.Context, string, map[string]any) (string, error) {
		return func(ctx context.Context, eventType string, data map[string]any) (string, error) {
			return applyPendingEvent(ctx, db, client, nil, nil, eventType, data)
		}
	}
	if n, err := processPendingEventsWithHandler(ctx, client, handler(brokenPool)); err != nil || n != 0 {
		t.Fatalf("failed archive: processed=%d err=%v", n, err)
	}
	snap, err := event.Get(ctx)
	if err != nil || snap.Data()["status"] != "pending" {
		t.Fatalf("failed archive must remain pending: %v", err)
	}
	if n, err := processPendingEventsWithHandler(ctx, client, handler(pool)); err != nil || n != 1 {
		t.Fatalf("archive retry: processed=%d err=%v", n, err)
	}
	snap, err = event.Get(ctx)
	if err != nil || snap.Data()["status"] != "processed" {
		t.Fatalf("successful archive must be processed: %v", err)
	}
	var count int
	var callStatus string
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(MAX(status::text), '') FROM public.call_sessions WHERE call_id = $1`,
		callID).Scan(&count, &callStatus); err != nil || count != 1 || callStatus != "missed" {
		t.Fatalf("archived calls=%d status=%q err=%v", count, callStatus, err)
	}
	if n, err := processPendingEventsWithHandler(ctx, client, handler(pool)); err != nil || n != 0 {
		t.Fatalf("duplicate sweep: processed=%d err=%v", n, err)
	}
}
