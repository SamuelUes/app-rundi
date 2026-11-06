package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type fakeOutboxExec struct {
	query string
	args  []any
	tag   pgconn.CommandTag
}

func TestOutboxLeaseFencingIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_OUTBOX_INTEGRATION") != "1" {
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
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.outbox_events (
			event_id uuid PRIMARY KEY, event_type text NOT NULL, aggregate_type text NOT NULL,
			aggregate_id text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
			next_attempt_at timestamptz NOT NULL, published_at timestamptz,
			failed_at timestamptz, last_error text
		)`); err != nil {
		t.Fatal(err)
	}
	newEvent := func(lease time.Time) string {
		id := uuid.NewString()
		if _, err := pool.Exec(ctx, `
			INSERT INTO public.outbox_events
				(event_id, event_type, aggregate_type, aggregate_id, payload, next_attempt_at)
			VALUES ($1::uuid, 'test', 'test', $1::uuid::text, '{}'::jsonb, $2)`, id, lease); err != nil {
			t.Fatal(err)
		}
		return id
	}
	leaseA := time.Now().UTC().Add(time.Minute).Truncate(time.Microsecond)
	leaseB := leaseA.Add(time.Minute)
	expired := time.Now().UTC().Add(-time.Minute).Truncate(time.Microsecond)
	expiredID := newEvent(expired)
	if err := markOutboxPublished(ctx, pool, expiredID, expired); !errors.Is(err, errOutboxLeaseLost) {
		t.Fatalf("expired lease must not publish, even before reclaim: %v", err)
	}
	id := newEvent(leaseA)
	if _, err := pool.Exec(ctx, `UPDATE public.outbox_events SET next_attempt_at=$2 WHERE event_id=$1`, id, leaseB); err != nil {
		t.Fatal(err)
	}
	if err := markOutboxPublished(ctx, pool, id, leaseA); !errors.Is(err, errOutboxLeaseLost) {
		t.Fatalf("stale publish: %v", err)
	}
	if err := markOutboxFailed(ctx, pool, id, leaseA, "stale"); !errors.Is(err, errOutboxLeaseLost) {
		t.Fatalf("stale failure: %v", err)
	}
	if err := rescheduleOutbox(ctx, pool, id, leaseA, 2, "stale"); !errors.Is(err, errOutboxLeaseLost) {
		t.Fatalf("stale retry: %v", err)
	}
	if err := markOutboxPublished(ctx, pool, id, leaseB); err != nil {
		t.Fatal(err)
	}
	var state string
	if err := pool.QueryRow(ctx, `SELECT status::text FROM public.outbox_events WHERE event_id=$1`, id).Scan(&state); err != nil || state != "published" {
		t.Fatalf("current owner did not publish: state=%q err=%v", state, err)
	}
	failedID := newEvent(leaseA)
	if err := markOutboxFailed(ctx, pool, failedID, leaseA, "failure"); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT status::text FROM public.outbox_events WHERE event_id=$1`, failedID).Scan(&state); err != nil || state != "failed" {
		t.Fatalf("current owner did not dead-letter: state=%q err=%v", state, err)
	}
	retryID := newEvent(leaseA)
	if err := rescheduleOutbox(ctx, pool, retryID, leaseA, 2, "retry"); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT status::text FROM public.outbox_events WHERE event_id=$1`, retryID).Scan(&state); err != nil || state != "pending" {
		t.Fatalf("retry did not remain pending: state=%q err=%v", state, err)
	}
}

func (f *fakeOutboxExec) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.query, f.args = sql, args
	return f.tag, nil
}

func TestOutboxUpdatesAreFenced(t *testing.T) {
	lease := time.Now()
	tests := []struct {
		name string
		run  func(*fakeOutboxExec) error
	}{
		{"publish", func(f *fakeOutboxExec) error { return markOutboxPublished(context.Background(), f, "event", lease) }},
		{"failure", func(f *fakeOutboxExec) error {
			return markOutboxFailed(context.Background(), f, "event", lease, "error")
		}},
		{"retry", func(f *fakeOutboxExec) error {
			return rescheduleOutbox(context.Background(), f, "event", lease, 2, "error")
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := &fakeOutboxExec{tag: pgconn.NewCommandTag("UPDATE 0")}
			if err := tt.run(f); !errors.Is(err, errOutboxLeaseLost) {
				t.Fatalf("stale lease error = %v", err)
			}
			if !strings.Contains(f.query, "status = 'pending'") || !strings.Contains(f.query, "next_attempt_at =") ||
				!strings.Contains(f.query, "next_attempt_at > NOW()") {
				t.Fatalf("missing lease or status fence: %s", f.query)
			}
			found := false
			for _, arg := range f.args {
				if value, ok := arg.(time.Time); ok && value.Equal(lease) {
					found = true
				}
			}
			if !found {
				t.Fatal("lease is not passed to the update")
			}
			f.tag = pgconn.NewCommandTag("UPDATE 1")
			if err := tt.run(f); err != nil {
				t.Fatalf("owned lease update: %v", err)
			}
		})
	}
}
