package main

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestPendingEventLeaseIntegration(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	c, err := firestore.NewClient(ctx, "demo-rundi-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()

	newEvent := func() *firestore.DocumentRef {
		ref := c.Collection(fs.ColPendingEvents).Doc("test-" + uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"status": "pending", "eventType": "test", "aggregateId": "test",
			"createdAt": time.Now(), "payload": map[string]any{},
		}); err != nil {
			t.Fatal(err)
		}
		return ref
	}

	t.Run("concurrent claims and atomic completion", func(t *testing.T) {
		ref := newEvent()
		var wg sync.WaitGroup
		claims := make(chan *pendingClaim, 2)
		errs := make(chan error, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				claim, err := claimPendingEvent(ctx, c, ref)
				claims <- claim
				errs <- err
			}()
		}
		wg.Wait()
		close(claims)
		close(errs)
		for err := range errs {
			if err != nil {
				t.Fatal(err)
			}
		}
		var winner *pendingClaim
		count := 0
		for claim := range claims {
			if claim != nil {
				count++
				winner = claim
			}
		}
		if count != 1 {
			t.Fatalf("got %d claims, want 1", count)
		}
		if err := finishPendingEvent(ctx, c, ref, winner, "done", nil); err != nil {
			t.Fatal(err)
		}
		snap, err := ref.Get(ctx)
		if err != nil || snap.Data()["status"] != "processed" {
			t.Fatalf("pending event not processed: %v", err)
		}
		if _, err := c.Collection(fs.ColProcessedEvents).Doc(ref.ID).Get(ctx); err != nil {
			t.Fatalf("processed marker missing: %v", err)
		}
	})

	t.Run("retry and dead letter", func(t *testing.T) {
		ref := newEvent()
		for i := 1; i <= pendingEventMaxAttempts; i++ {
			claim, err := claimPendingEvent(ctx, c, ref)
			if err != nil || claim == nil {
				t.Fatalf("attempt %d: claim=%v err=%v", i, claim, err)
			}
			if err := finishPendingEvent(ctx, c, ref, claim, "", errors.New("failed")); err != nil {
				t.Fatal(err)
			}
			snap, err := ref.Get(ctx)
			if err != nil {
				t.Fatal(err)
			}
			want := "pending"
			if i == pendingEventMaxAttempts {
				want = "failed"
			}
			if got := snap.Data()["status"]; got != want {
				t.Fatalf("attempt %d: status=%v, want %s", i, got, want)
			}
		}
		_, err := c.Collection(fs.ColProcessedEvents).Doc(ref.ID).Get(ctx)
		if status.Code(err) != codes.NotFound {
			t.Fatalf("failed event must not have processed marker: %v", err)
		}
	})

	t.Run("expired leases do not consume failure budget", func(t *testing.T) {
		ref := newEvent()
		for i := 0; i < pendingEventMaxAttempts; i++ {
			claim, err := claimPendingEvent(ctx, c, ref)
			if err != nil || claim == nil {
				t.Fatalf("claim %d: claim=%v err=%v", i, claim, err)
			}
			if _, err := ref.Update(ctx, []firestore.Update{
				{Path: "processingLeaseUntil", Value: time.Now().Add(-time.Minute)},
			}); err != nil {
				t.Fatal(err)
			}
		}
		claim, err := claimPendingEvent(ctx, c, ref)
		if err != nil || claim == nil {
			t.Fatalf("claim after crashes: claim=%v err=%v", claim, err)
		}
		if err := finishPendingEvent(ctx, c, ref, claim, "", errors.New("temporary failure")); err != nil {
			t.Fatal(err)
		}
		snap, err := ref.Get(ctx)
		if err != nil || snap.Data()["status"] != "pending" {
			t.Fatalf("first handler failure after crashes must remain pending: %v", err)
		}
		if failures, _ := snap.Data()["processingFailures"].(int64); failures != 1 {
			t.Fatalf("got %d handler failures, want 1", failures)
		}
		claim, err = claimPendingEvent(ctx, c, ref)
		if err != nil || claim == nil {
			t.Fatalf("claim after failure: claim=%v err=%v", claim, err)
		}
		if err := finishPendingEvent(ctx, c, ref, claim, "done", nil); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("expired lease cannot finish after reclaim", func(t *testing.T) {
		ref := newEvent()
		first, err := claimPendingEvent(ctx, c, ref)
		if err != nil || first == nil {
			t.Fatalf("first claim: %v", err)
		}
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "processingLeaseUntil", Value: time.Now().Add(-time.Minute)}}); err != nil {
			t.Fatal(err)
		}
		second, err := claimPendingEvent(ctx, c, ref)
		if err != nil || second == nil {
			t.Fatalf("second claim: %v", err)
		}
		if err := finishPendingEvent(ctx, c, ref, first, "stale", nil); err == nil {
			t.Fatal("stale worker must not finish event")
		}
		if err := finishPendingEvent(ctx, c, ref, second, "done", nil); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("expired lease cannot finish before reclaim", func(t *testing.T) {
		ref := newEvent()
		claim, err := claimPendingEvent(ctx, c, ref)
		if err != nil || claim == nil {
			t.Fatalf("claim: %v", err)
		}
		if _, err := ref.Update(ctx, []firestore.Update{
			{Path: "processingLeaseUntil", Value: time.Now().Add(-time.Minute)},
		}); err != nil {
			t.Fatal(err)
		}
		if err := finishPendingEvent(ctx, c, ref, claim, "stale", nil); err == nil {
			t.Fatal("expired owner finished before reclaim")
		}
		claim, err = claimPendingEvent(ctx, c, ref)
		if err != nil || claim == nil {
			t.Fatalf("reclaim: %v", err)
		}
		if err := finishPendingEvent(ctx, c, ref, claim, "done", nil); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("existing processed marker closes pending event", func(t *testing.T) {
		ref := newEvent()
		if _, err := c.Collection(fs.ColProcessedEvents).Doc(ref.ID).Set(ctx, map[string]any{"result": "done"}); err != nil {
			t.Fatal(err)
		}
		claim, err := claimPendingEvent(ctx, c, ref)
		if err != nil || claim != nil {
			t.Fatalf("processed event must not be claimed: claim=%v err=%v", claim, err)
		}
		snap, err := ref.Get(ctx)
		if err != nil || snap.Data()["status"] != "processed" {
			t.Fatalf("pending event not closed: %v", err)
		}
	})

	t.Run("sweep retries a transient handler failure", func(t *testing.T) {
		ref := newEvent()
		calls := 0
		handler := func(_ context.Context, _ string, _ map[string]any) (string, error) {
			calls++
			if calls == 1 {
				return "", errors.New("temporary failure")
			}
			return "done", nil
		}
		if n, err := processPendingEventsWithHandler(ctx, c, handler); err != nil || n != 0 {
			t.Fatalf("first sweep: processed=%d err=%v", n, err)
		}
		snap, err := ref.Get(ctx)
		if err != nil || snap.Data()["status"] != "pending" {
			t.Fatalf("failure must leave event pending: %v", err)
		}
		if n, err := processPendingEventsWithHandler(ctx, c, handler); err != nil || n != 1 {
			t.Fatalf("retry sweep: processed=%d err=%v", n, err)
		}
		snap, err = ref.Get(ctx)
		if err != nil || snap.Data()["status"] != "processed" {
			t.Fatalf("retry must process event: %v", err)
		}
	})

	t.Run("sweep continues past a leased page", func(t *testing.T) {
		batch := c.Batch()
		base := time.Now().Add(-time.Hour)
		for i := 0; i < 51; i++ {
			ref := c.Collection(fs.ColPendingEvents).Doc("leased-" + uuid.NewString())
			batch.Set(ref, map[string]any{
				"status": "pending", "eventType": "test", "createdAt": base.Add(time.Duration(i) * time.Second),
				"processingLeaseUntil": time.Now().Add(time.Minute),
			})
		}
		ready := c.Collection(fs.ColPendingEvents).Doc("ready-" + uuid.NewString())
		batch.Set(ready, map[string]any{
			"status": "pending", "eventType": "test", "createdAt": base.Add(52 * time.Second),
			"payload": map[string]any{"marker": "ready"},
		})
		if _, err := batch.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		calls := 0
		handler := func(_ context.Context, _ string, data map[string]any) (string, error) {
			calls++
			payload, _ := data["payload"].(map[string]any)
			if payload["marker"] != "ready" {
				return "", errors.New("claimed an unexpected event")
			}
			return "done", nil
		}
		if n, err := processPendingEventsWithHandler(ctx, c, handler); err != nil || n != 1 || calls != 1 {
			t.Fatalf("leased page blocked ready event: processed=%d calls=%d err=%v", n, calls, err)
		}
	})
}
