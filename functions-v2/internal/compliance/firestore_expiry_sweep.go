package compliance

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/rundi/functions-v2/internal/fs"
)

// SweepFirestoreSessionExpiry processes a bounded page of the Firestore
// availability expiry queue (the production authority for _fs sessions).
func SweepFirestoreSessionExpiry(ctx context.Context, client *firestore.Client) (int, error) {
	docs, err := client.Collection(fs.ColDriverAvailabilityExpiry).
		Where("expiresAt", "<=", time.Now()).OrderBy("expiresAt", firestore.Asc).Limit(100).
		Documents(ctx).GetAll()
	if err != nil {
		return 0, err
	}
	expired := 0
	var firstErr error
	for _, doc := range docs {
		data := doc.Data()
		uid, _ := data["driverUid"].(string)
		sequence, _ := data["sequence"].(int64)
		if uid != doc.Ref.ID || !validFirestoreUID(uid) || sequence <= 0 {
			if firstErr == nil {
				firstErr = fmt.Errorf("invalid availability expiry %s", doc.Ref.ID)
			}
			continue
		}
		closed, err := ExpireFirestoreSession(ctx, client, uid, sequence)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if closed {
			expired++
		}
	}
	return expired, firstErr
}
