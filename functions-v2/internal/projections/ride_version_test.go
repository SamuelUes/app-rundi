package projections

import (
	"context"
	"os"
	"strings"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
)

func TestRideProjectionRejectsOlderDoubleVersion(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ref := client.Collection("test_ride_projection").Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{"status": "driver_arrived", "appliedVersion": float64(5)}); err != nil {
		t.Fatal(err)
	}
	if err := writeRideProjection(ctx, client, ref, map[string]any{"status": "driver_on_route", "appliedVersion": int64(4)}, int64(4)); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "driver_arrived" {
		t.Fatalf("older projection overwrote newer status: %v, %v", snap, err)
	}
	if err := writeRideProjection(ctx, client, ref, map[string]any{"status": "in_progress", "appliedVersion": int64(6)}, int64(6)); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "in_progress" {
		t.Fatalf("newer projection was not applied: %v, %v", snap, err)
	}
}
