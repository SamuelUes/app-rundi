package compliance

import (
	"encoding/json"
	"errors"
	"strings"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
)

const (
	ComplianceHistoryEventType = "driver_compliance_history"
	maxHistorySnapshotBytes    = 128 * 1024
)

// QueueComplianceHistory writes an immutable backend-only outbox event as part
// of the caller's Firestore transaction. It does not establish authority.
func QueueComplianceHistory(tx *firestore.Transaction, client *firestore.Client, uid, kind string, revision int64, snapshot map[string]any) error {
	if tx == nil || client == nil || uid == "" || len(uid) > 128 || strings.Contains(uid, "/") ||
		revision <= 0 || snapshot == nil || !validHistoryKind(kind) {
		return errors.New("invalid compliance history event")
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil || len(encoded) > maxHistorySnapshotBytes {
		return errors.New("invalid compliance history snapshot")
	}
	eventID := uuid.NewString()
	return tx.Create(client.Collection(fs.ColPendingEvents).Doc(eventID), map[string]any{
		"eventType":   ComplianceHistoryEventType,
		"aggregateId": uid,
		"status":      "pending",
		"createdAt":   firestore.ServerTimestamp,
		"payload": map[string]any{
			"eventId": eventID, "uid": uid, "kind": kind, "revision": revision, "snapshot": snapshot,
		},
	})
}

func validHistoryKind(kind string) bool {
	return kind == "documents_changed" || kind == "session_activated" || kind == "session_deactivated"
}
