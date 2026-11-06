package main

import (
	"context"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

func callExpired(data map[string]any, now time.Time) bool {
	switch data["status"] {
	case "initiated", "ringing_client", "ringing_operator", "ringing_driver":
	default:
		return false
	}
	var deadline time.Time
	switch v := data["acceptDeadline"].(type) {
	case int64:
		deadline = time.UnixMilli(v)
	case float64:
		deadline = time.UnixMilli(int64(v))
	case time.Time:
		deadline = v
	default:
		createdAt := tsOrNil(data["createdAt"])
		if createdAt == nil {
			return false
		}
		deadline = createdAt.Add(60 * time.Second)
	}
	return !deadline.After(now)
}

// The state and its lifecycle event are committed together after rechecking
// the current call, rather than applying a stale query result.
func markCallMissedIfExpired(ctx context.Context, c *firestore.Client, ref *firestore.DocumentRef, now time.Time) (bool, error) {
	missed := false
	eventRef := ref.Collection("events").NewDoc()
	pendingRef := c.Collection(fs.ColPendingEvents).NewDoc()
	err := c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		missed = false
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return nil
		}
		if err != nil {
			return err
		}
		if !callExpired(snap.Data(), now) {
			return nil
		}
		if err := tx.Update(ref, []firestore.Update{
			{Path: "status", Value: "missed"},
			{Path: "endedAt", Value: firestore.ServerTimestamp},
			{Path: "updatedAt", Value: firestore.ServerTimestamp},
		}); err != nil {
			return err
		}
		if err := tx.Set(eventRef, map[string]any{
			"type": "missed", "at": firestore.ServerTimestamp, "source": "call_lifecycle",
		}); err != nil {
			return err
		}
		uid, _ := snap.Data()["callerUid"].(string)
		if uid == "" {
			uid, _ = snap.Data()["calleeUid"].(string)
		}
		if uid != "" {
			if err := tx.Set(pendingRef, map[string]any{
				"eventType": "call_ended", "aggregateType": "call", "aggregateId": ref.ID,
				"payload": map[string]any{"callId": ref.ID, "uid": uid},
				"status":  "pending", "source": "server", "createdAt": firestore.ServerTimestamp,
			}); err != nil {
				return err
			}
		}
		missed = true
		return nil
	})
	if err != nil {
		return false, err
	}
	return missed, nil
}
