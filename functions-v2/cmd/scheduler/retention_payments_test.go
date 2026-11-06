package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestOrphanPaymentEligible(t *testing.T) {
	cutoff := time.Date(2026, 1, 10, 0, 0, 0, 0, time.UTC)
	old := cutoff.Add(-time.Second)
	for _, tt := range []struct {
		name    string
		status  any
		updated time.Time
		want    bool
	}{
		{"completed", "completed", old, true},
		{"confirmed", "confirmed", old, true},
		{"payment completed", "payment_completed", old, true},
		{"canceled", "canceled", old, true},
		{"pending", "pending", old, false},
		{"pending confirmation", "pending_confirmation", old, false},
		{"failed can be retried", "failed", old, false},
		{"missing status", nil, old, false},
		{"unknown status", "unknown", old, false},
		{"missing update time", "completed", time.Time{}, false},
		{"cutoff boundary", "completed", cutoff, false},
		{"recent payment", "completed", cutoff.Add(time.Second), false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got := orphanPaymentEligible(map[string]any{"status": tt.status}, tt.updated, cutoff)
			if got != tt.want {
				t.Fatalf("eligible = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestOrphanPaymentCleanupIntegration(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	c, err := firestore.NewClient(ctx, "demo-retention-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	payments := c.Collection(fs.ColPaymentsLive)
	trips := c.Collection(fs.ColTripsLive)
	cutoff := time.Now().Add(time.Hour)
	newPayment := func(state string) *firestore.DocumentRef {
		t.Helper()
		ref := payments.Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{"status": state}); err != nil {
			t.Fatal(err)
		}
		return ref
	}
	assertExists := func(ref *firestore.DocumentRef, want bool) {
		t.Helper()
		_, err := ref.Get(ctx)
		if want && err != nil {
			t.Fatalf("payment must be retained: %v", err)
		}
		if !want && status.Code(err) != codes.NotFound {
			t.Fatalf("payment must be deleted: %v", err)
		}
	}

	t.Run("pending payment without trip is retained", func(t *testing.T) {
		ref := newPayment("pending")
		removed, err := removeOrphanPayment(ctx, c, ref, cutoff)
		if err != nil || removed {
			t.Fatalf("pending payment removed=%v err=%v", removed, err)
		}
		assertExists(ref, true)
	})
	t.Run("recent terminal payment is retained", func(t *testing.T) {
		ref := newPayment("completed")
		// A stale payload timestamp must not override Firestore's update time.
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "updatedAt", Value: time.Now().Add(-30 * 24 * time.Hour)}}); err != nil {
			t.Fatal(err)
		}
		removed, err := removeOrphanPayment(ctx, c, ref, time.Now().Add(-time.Hour))
		if err != nil || removed {
			t.Fatalf("recent payment removed=%v err=%v", removed, err)
		}
		assertExists(ref, true)
	})
	t.Run("cancelled verification retains payment", func(t *testing.T) {
		ref := newPayment("completed")
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		removed, err := removeOrphanPayment(cancelled, c, ref, cutoff)
		if err == nil || removed {
			t.Fatalf("cancelled verification removed=%v err=%v", removed, err)
		}
		assertExists(ref, true)
	})
	t.Run("payment with trip is retained", func(t *testing.T) {
		ref := newPayment("completed")
		if _, err := trips.Doc(ref.ID).Set(ctx, map[string]any{"status": "completed"}); err != nil {
			t.Fatal(err)
		}
		removed, err := removeOrphanPayment(ctx, c, ref, cutoff)
		if err != nil || removed {
			t.Fatalf("payment with trip removed=%v err=%v", removed, err)
		}
		assertExists(ref, true)
	})
	t.Run("old terminal orphan is removed", func(t *testing.T) {
		ref := newPayment("completed")
		removed, err := removeOrphanPayment(ctx, c, ref, cutoff)
		if err != nil || !removed {
			t.Fatalf("old terminal orphan removed=%v err=%v", removed, err)
		}
		assertExists(ref, false)
	})
	t.Run("state changed after scan is rechecked", func(t *testing.T) {
		ref := newPayment("completed")
		scanned, err := ref.Get(ctx)
		if err != nil || !orphanPaymentEligible(scanned.Data(), scanned.UpdateTime, cutoff) {
			t.Fatalf("initial candidate not eligible: %v", err)
		}
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "status", Value: "pending"}}); err != nil {
			t.Fatal(err)
		}
		removed, err := removeOrphanPayment(ctx, c, ref, cutoff)
		if err != nil || removed {
			t.Fatalf("changed payment removed=%v err=%v", removed, err)
		}
		assertExists(ref, true)
	})
}
