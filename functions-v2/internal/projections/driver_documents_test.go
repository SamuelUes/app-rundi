package projections

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestDriverDocumentsRevisionFence(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ref := client.Collection(fs.ColDriversLive).Doc("docs-test-" + time.Now().Format("150405.000000000")).
		Collection("private").Doc("documents")
	defer ref.Delete(ctx)
	write := func(revision int64, license any, deleted bool) {
		t.Helper()
		err := writeDriverDocuments(ctx, client, ref, revision, map[string]any{
			"revision": revision, "license": license, "deleted": deleted,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	write(2, "new", false)
	write(1, "stale", false)
	snapshot, err := ref.Get(ctx)
	if err != nil || snapshot.Data()["license"] != "new" {
		t.Fatalf("stale event overwrote newer snapshot: %v %v", snapshot, err)
	}
	write(3, nil, true)
	write(2, "new", false)
	snapshot, err = ref.Get(ctx)
	if err != nil || snapshot.Data()["deleted"] != true || snapshot.Data()["license"] != nil {
		t.Fatalf("stale event restored deleted data: %v %v", snapshot, err)
	}
	if _, err := ref.Set(ctx, map[string]any{"source": "firestore", "revision": int64(1), "license": "authoritative"}); err != nil {
		t.Fatal(err)
	}
	write(999, "old-sql-projection", false)
	snapshot, err = ref.Get(ctx)
	if err != nil || snapshot.Data()["license"] != "authoritative" {
		t.Fatalf("legacy SQL projection overwrote Firestore authority: %v %v", snapshot, err)
	}
}
