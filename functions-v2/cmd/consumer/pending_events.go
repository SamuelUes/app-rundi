package main

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

const (
	pendingEventLease       = 5 * time.Minute
	pendingEventMaxAttempts = 5
)

type pendingClaim struct {
	token    string
	data     map[string]any
	attempts int64
	failures int64
}

// claimPendingEvent serializes concurrent workers without removing the event
// from the pending query, so an expired lease is recoverable after a crash.
func claimPendingEvent(ctx context.Context, c *firestore.Client, ref *firestore.DocumentRef) (*pendingClaim, error) {
	token := uuid.NewString()
	var claim *pendingClaim
	err := c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		claim = nil
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return nil
		}
		if err != nil {
			return err
		}
		data := snap.Data()
		if data["status"] != "pending" {
			return nil
		}
		if until, ok := data["processingLeaseUntil"].(time.Time); ok && until.After(time.Now()) {
			return nil
		}
		processed, err := tx.Get(c.Collection(fs.ColProcessedEvents).Doc(ref.ID))
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if processed != nil && processed.Exists() {
			return tx.Update(ref, []firestore.Update{{Path: "status", Value: "processed"}})
		}
		attempts, _ := data["processingAttempts"].(int64)
		failures, _ := data["processingFailures"].(int64)
		attempts++
		if err := tx.Update(ref, []firestore.Update{
			{Path: "processingToken", Value: token},
			{Path: "processingLeaseUntil", Value: time.Now().Add(pendingEventLease)},
			{Path: "processingAttempts", Value: attempts},
		}); err != nil {
			return err
		}
		claim = &pendingClaim{token: token, data: data, attempts: attempts, failures: failures}
		return nil
	})
	return claim, err
}

func finishPendingEvent(ctx context.Context, c *firestore.Client, ref *firestore.DocumentRef, claim *pendingClaim, result string, applyErr error) error {
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil {
			return err
		}
		data := snap.Data()
		if data["status"] != "pending" || data["processingToken"] != claim.token {
			return fmt.Errorf("pending event %s: lease no longer owned", ref.ID)
		}
		if until, ok := data["processingLeaseUntil"].(time.Time); !ok || !until.After(time.Now()) {
			return fmt.Errorf("pending event %s: lease expired", ref.ID)
		}
		updates := []firestore.Update{
			{Path: "processingToken", Value: firestore.Delete},
			{Path: "processingLeaseUntil", Value: firestore.Delete},
		}
		if applyErr != nil {
			failures := claim.failures + 1
			updates = append(updates,
				firestore.Update{Path: "lastError", Value: applyErr.Error()},
				firestore.Update{Path: "processingFailures", Value: failures})
			if failures >= pendingEventMaxAttempts {
				updates = append(updates,
					firestore.Update{Path: "status", Value: "failed"},
					firestore.Update{Path: "failedAt", Value: firestore.ServerTimestamp})
			}
			return tx.Update(ref, updates)
		}
		updates = append(updates,
			firestore.Update{Path: "status", Value: "processed"},
			firestore.Update{Path: "lastError", Value: firestore.Delete})
		if err := tx.Set(c.Collection(fs.ColProcessedEvents).Doc(ref.ID), map[string]any{
			"eventType":   data["eventType"],
			"aggregateId": data["aggregateId"],
			"result":      result,
			"payload":     data["payload"],
			"processedAt": firestore.ServerTimestamp,
			"expireAt":    time.Now().Add(30 * 24 * time.Hour),
		}); err != nil {
			return err
		}
		return tx.Update(ref, updates)
	})
}
