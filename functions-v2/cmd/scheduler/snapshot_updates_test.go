package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestSnapshotUpdatesPreserveNewerStateIntegration(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	c, err := firestore.NewClient(ctx, "demo-sweep-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	get := func(ref *firestore.DocumentRef) *firestore.DocumentSnapshot {
		t.Helper()
		snap, err := ref.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return snap
	}
	set := func(ref *firestore.DocumentRef, data map[string]any) {
		t.Helper()
		if _, err := ref.Set(ctx, data); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("fresh heartbeat is not overwritten", func(t *testing.T) {
		fresh := c.Collection(fs.ColDriversLive).Doc(uuid.NewString())
		stale := c.Collection(fs.ColDriversLive).Doc(uuid.NewString())
		for _, ref := range []*firestore.DocumentRef{fresh, stale} {
			set(ref, map[string]any{"status": "online", "lastSeen": time.Now().Add(-time.Hour)})
		}
		candidates := []*firestore.DocumentSnapshot{get(fresh), get(stale)}
		if _, err := fresh.Update(ctx, []firestore.Update{{Path: "lastSeen", Value: time.Now()}}); err != nil {
			t.Fatal(err)
		}
		updated := updateScannedDocuments(ctx, c, candidates, []firestore.Update{{Path: "status", Value: "offline"}})
		if len(updated) != 1 || updated[0].Ref.ID != stale.ID {
			t.Fatalf("updated drivers = %v", updated)
		}
		if got := get(fresh).Data()["status"]; got != "online" {
			t.Fatalf("fresh driver status = %v", got)
		}
		if got := get(stale).Data()["status"]; got != "offline" {
			t.Fatalf("stale driver status = %v", got)
		}
	})
	t.Run("accepted offer is not expired", func(t *testing.T) {
		ref := c.Collection(fs.ColDriverOffers).Doc(uuid.NewString())
		set(ref, map[string]any{"status": "pending", "expiresAt": time.Now().Add(-time.Minute)})
		candidate := get(ref)
		if _, err := ref.Update(ctx, []firestore.Update{{Path: "status", Value: "accepted"}}); err != nil {
			t.Fatal(err)
		}
		updated := updateScannedDocuments(ctx, c, []*firestore.DocumentSnapshot{candidate}, []firestore.Update{{Path: "status", Value: "expired"}})
		if len(updated) != 0 || get(ref).Data()["status"] != "accepted" {
			t.Fatalf("accepted offer overwritten: updated=%d", len(updated))
		}
	})
	t.Run("missing version fails closed", func(t *testing.T) {
		ref := c.Collection(fs.ColDriverOffers).Doc(uuid.NewString())
		set(ref, map[string]any{"status": "pending"})
		candidate := &firestore.DocumentSnapshot{Ref: ref}
		updated := updateScannedDocuments(ctx, c, []*firestore.DocumentSnapshot{candidate}, []firestore.Update{{Path: "status", Value: "expired"}})
		if len(updated) != 0 || get(ref).Data()["status"] != "pending" {
			t.Fatalf("unversioned snapshot overwritten: updated=%d", len(updated))
		}
	})
	t.Run("failed write is not reported as updated", func(t *testing.T) {
		ref := c.Collection(fs.ColDriverOffers).Doc(uuid.NewString())
		set(ref, map[string]any{"status": "pending"})
		candidate := get(ref)
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		updated := updateScannedDocuments(cancelled, c, []*firestore.DocumentSnapshot{candidate}, []firestore.Update{{Path: "status", Value: "expired"}})
		if len(updated) != 0 || get(ref).Data()["status"] != "pending" {
			t.Fatalf("failed write reported as success: updated=%d", len(updated))
		}
	})
}
