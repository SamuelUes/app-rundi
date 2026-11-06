package main

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestCallExpirationEligibility(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	old := now.Add(-time.Second)
	for _, tt := range []struct {
		name string
		data map[string]any
		want bool
	}{
		{"expired milliseconds", map[string]any{"status": "initiated", "acceptDeadline": old.UnixMilli()}, true},
		{"expired float", map[string]any{"status": "ringing_driver", "acceptDeadline": float64(old.UnixMilli())}, true},
		{"expired timestamp", map[string]any{"status": "ringing_client", "acceptDeadline": old}, true},
		{"deadline boundary", map[string]any{"status": "ringing_operator", "acceptDeadline": now}, true},
		{"not expired", map[string]any{"status": "initiated", "acceptDeadline": now.Add(time.Second)}, false},
		{"accepted", map[string]any{"status": "accepted", "acceptDeadline": old}, false},
		{"connected", map[string]any{"status": "connected", "acceptDeadline": old}, false},
		{"terminal", map[string]any{"status": "ended", "acceptDeadline": old}, false},
		{"fallback createdAt", map[string]any{"status": "initiated", "createdAt": now.Add(-61 * time.Second)}, true},
		{"recent createdAt", map[string]any{"status": "initiated", "createdAt": now.Add(-59 * time.Second)}, false},
		{"no valid time", map[string]any{"status": "initiated"}, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := callExpired(tt.data, now); got != tt.want {
				t.Fatalf("expired = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCallExpirationIntegration(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	c, err := firestore.NewClient(ctx, "demo-calls-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	now := time.Now()
	newCall := func() *firestore.DocumentRef {
		t.Helper()
		ref := c.Collection(fs.ColCalls).Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"status": "initiated", "acceptDeadline": now.Add(-time.Minute).UnixMilli(),
			"callerUid": "caller-test", "calleeUid": "callee-test",
		}); err != nil {
			t.Fatal(err)
		}
		return ref
	}
	getStatus := func(ref *firestore.DocumentRef) string {
		t.Helper()
		snap, err := ref.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		value, _ := snap.Data()["status"].(string)
		return value
	}
	t.Run("accepted after scan is preserved", func(t *testing.T) {
		ref := newCall()
		scanned, err := ref.Get(ctx)
		if err != nil || !callExpired(scanned.Data(), now) {
			t.Fatalf("initial call not expired: %v", err)
		}
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "status", Value: "accepted"}}); err != nil {
			t.Fatal(err)
		}
		missed, err := markCallMissedIfExpired(ctx, c, ref, now)
		if err != nil || missed || getStatus(ref) != "accepted" {
			t.Fatalf("accepted call missed=%v err=%v", missed, err)
		}
	})
	t.Run("extended deadline is respected", func(t *testing.T) {
		ref := newCall()
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "acceptDeadline", Value: now.Add(time.Minute).UnixMilli()}}); err != nil {
			t.Fatal(err)
		}
		missed, err := markCallMissedIfExpired(ctx, c, ref, now)
		if err != nil || missed || getStatus(ref) != "initiated" {
			t.Fatalf("extended call missed=%v err=%v", missed, err)
		}
	})
	t.Run("concurrent workers transition once", func(t *testing.T) {
		ref := newCall()
		type result struct {
			missed bool
			err    error
		}
		results := make(chan result, 2)
		var wg sync.WaitGroup
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				missed, err := markCallMissedIfExpired(ctx, c, ref, now)
				results <- result{missed, err}
			}()
		}
		wg.Wait()
		close(results)
		count := 0
		for result := range results {
			if result.err != nil {
				t.Fatal(result.err)
			}
			if result.missed {
				count++
			}
		}
		if count != 1 || getStatus(ref) != "missed" {
			t.Fatalf("missed transitions=%d status=%s", count, getStatus(ref))
		}
		events, err := ref.Collection("events").Documents(ctx).GetAll()
		if err != nil || len(events) != 1 || events[0].Data()["type"] != "missed" {
			t.Fatalf("missed lifecycle events=%d err=%v", len(events), err)
		}
		pending, err := c.Collection(fs.ColPendingEvents).
			Where("aggregateId", "==", ref.ID).Documents(ctx).GetAll()
		if err != nil || len(pending) != 1 {
			t.Fatalf("archive recovery events=%d err=%v", len(pending), err)
		}
		data := pending[0].Data()
		payload, _ := data["payload"].(map[string]any)
		if data["eventType"] != "call_ended" || data["status"] != "pending" ||
			data["source"] != "server" || payload["callId"] != ref.ID || payload["uid"] != "caller-test" {
			t.Fatalf("invalid archive recovery event: %v", data)
		}
	})
	t.Run("callee is used if caller is missing", func(t *testing.T) {
		ref := newCall()
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "callerUid", Value: firestore.Delete}}); err != nil {
			t.Fatal(err)
		}
		missed, err := markCallMissedIfExpired(ctx, c, ref, now)
		if err != nil || !missed {
			t.Fatalf("call missed=%v err=%v", missed, err)
		}
		pending, err := c.Collection(fs.ColPendingEvents).
			Where("aggregateId", "==", ref.ID).Documents(ctx).GetAll()
		if err != nil || len(pending) != 1 {
			t.Fatalf("archive recovery events=%d err=%v", len(pending), err)
		}
		payload, _ := pending[0].Data()["payload"].(map[string]any)
		if payload["uid"] != "callee-test" {
			t.Fatalf("archive recovery participant=%v", payload["uid"])
		}
	})
	t.Run("missing call is ignored", func(t *testing.T) {
		ref := c.Collection(fs.ColCalls).Doc(uuid.NewString())
		missed, err := markCallMissedIfExpired(ctx, c, ref, now)
		if err != nil || missed {
			t.Fatalf("missing call missed=%v err=%v", missed, err)
		}
	})
}
