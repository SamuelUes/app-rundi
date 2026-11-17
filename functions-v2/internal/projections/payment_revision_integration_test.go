package projections

import (
	"context"
	"os"
	"testing"

	"cloud.google.com/go/firestore"
)

func TestPaymentRevisionRejectsStaleProjection(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires FIRESTORE_EMULATOR_HOST")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-payment-revision")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ref := client.Collection("test_payment_revisions").NewDoc()
	t.Cleanup(func() { _, _ = ref.Delete(context.Background()) })

	for _, write := range []struct {
		revision int64
		status   string
	}{
		{2, "confirmed"},
		{1, "pending"},
	} {
		if err := applyPaymentRevision(ctx, client, ref, write.revision, map[string]any{
			"paymentRevision": write.revision,
			"status":          write.status,
		}); err != nil {
			t.Fatal(err)
		}
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["status"] != "confirmed" || snap.Data()["paymentRevision"] != int64(2) {
		t.Fatalf("stale projection overwrote confirmed payment: %v", snap.Data())
	}
}
