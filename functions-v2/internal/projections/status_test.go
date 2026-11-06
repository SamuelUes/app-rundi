package projections

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

func TestProjectionStatusIntegration(t *testing.T) {
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
	id := uuid.NewString()
	ref := c.Collection(fs.ColProjectionStatus).Doc("ride_" + id)

	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != -1 {
		t.Fatalf("missing marker must be reconciled: version=%v err=%v", got, err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(0), -1, "event-0", "ok", ""); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != 0 {
		t.Fatalf("valid version-zero marker: version=%v err=%v", got, err)
	}

	if err := WriteStatus(ctx, c, "ride", id, float64(5), -1, "event-5", "error", "unavailable"); err != nil {
		t.Fatal(err)
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := statusVersion(snap.Data()["appliedVersion"]); got != 0 {
		t.Fatalf("failed projection advanced appliedVersion to %v", got)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(5), -1, "event-5", "ok", ""); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := snap.Data()["lastError"]; ok {
		t.Fatal("successful projection must clear previous error")
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != 5 {
		t.Fatalf("applied version=%v, err=%v", got, err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(4), -1, "event-4", "error", "late failure"); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "ok" {
		t.Fatalf("older failure must not overwrite status: %v", err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, version := range []float64{6, 7} {
		wg.Add(1)
		go func(v float64) {
			defer wg.Done()
			errs <- WriteStatus(ctx, c, "ride", id, v, -1, "", "ok", "")
		}(version)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != 7 {
		t.Fatalf("concurrent applied version=%v, err=%v", got, err)
	}

	if err := WriteStatus(ctx, c, "ride", id, float64(8), -1, "", "error", "unavailable"); err != nil {
		t.Fatal(err)
	}
	snap, err = ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := statusVersion(snap.Data()["appliedVersion"]); got != 7 {
		t.Fatalf("failure advanced version to %v", got)
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != -1 {
		t.Fatalf("error marker must be retried: version=%v err=%v", got, err)
	}
	if err := WriteStatus(ctx, c, "ride", id, nil, -1, "unversioned", "ok", ""); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != -1 {
		t.Fatalf("unversioned success must not clear failure: version=%v err=%v", got, err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(7), -1, "older", "ok", ""); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != -1 {
		t.Fatalf("older success must not clear newer failure: version=%v err=%v", got, err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(9), -1, "event-9", "error", "newer failure"); err != nil {
		t.Fatal(err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(8), -1, "event-8", "error", "older failure"); err != nil {
		t.Fatal(err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(8), -1, "event-8", "ok", ""); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != -1 {
		t.Fatalf("older failure and success must not mask version 9: version=%v err=%v", got, err)
	}
	if err := WriteStatus(ctx, c, "ride", id, float64(9), -1, "event-9", "ok", ""); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadStatusVersion(ctx, c, "ride", id); err != nil || got != 9 {
		t.Fatalf("matching success must clear failure: version=%v err=%v", got, err)
	}
}
