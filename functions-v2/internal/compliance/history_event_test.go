package compliance

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestQueueComplianceHistoryAtomic(t *testing.T) {
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
	uid := "history-test-" + uuid.NewString()
	marker := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("history-test")
	query := client.Collection(fs.ColPendingEvents).Where("aggregateId", "==", uid)
	defer func() {
		_, _ = marker.Delete(ctx)
		docs, _ := query.Documents(ctx).GetAll()
		for _, doc := range docs {
			_, _ = doc.Ref.Delete(ctx)
		}
	}()
	aborted := errors.New("abort transaction")
	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		if err := tx.Set(marker, map[string]any{"revision": 1}); err != nil {
			return err
		}
		if err := QueueComplianceHistory(tx, client, uid, "documents_changed", 1, map[string]any{"license": "verified"}); err != nil {
			return err
		}
		return aborted
	})
	if !errors.Is(err, aborted) {
		t.Fatalf("expected rollback: %v", err)
	}
	docs, err := query.Documents(ctx).GetAll()
	if err != nil || len(docs) != 0 {
		t.Fatalf("rolled-back event was persisted: %d, %v", len(docs), err)
	}
	err = client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		if err := tx.Set(marker, map[string]any{"revision": 1}); err != nil {
			return err
		}
		return QueueComplianceHistory(tx, client, uid, "documents_changed", 1, map[string]any{"license": "verified"})
	})
	if err != nil {
		t.Fatal(err)
	}
	docs, err = query.Documents(ctx).GetAll()
	if err != nil || len(docs) != 1 {
		t.Fatalf("expected one event: %d, %v", len(docs), err)
	}
	if docs[0].Data()["eventType"] != ComplianceHistoryEventType || docs[0].Data()["status"] != "pending" {
		t.Fatalf("unexpected event: %v", docs[0].Data())
	}
}

func TestComplianceHistoryKinds(t *testing.T) {
	for _, kind := range []string{"documents_changed", "session_activated", "session_deactivated"} {
		if !validHistoryKind(kind) {
			t.Fatalf("rejected valid kind %s", kind)
		}
	}
	if validHistoryKind("anything_else") {
		t.Fatal("accepted unknown history kind")
	}
}
