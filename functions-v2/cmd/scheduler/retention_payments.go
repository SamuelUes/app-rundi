package main

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

func orphanPaymentEligible(data map[string]any, updatedAt, cutoff time.Time) bool {
	if updatedAt.IsZero() || !updatedAt.Before(cutoff) {
		return false
	}
	switch data["status"] {
	case "completed", "payment_completed", "confirmed", "canceled":
		return true
	default:
		return false
	}
}

// Re-read both documents in the transaction so a stale scan cannot delete a
// payment that has changed or acquired a corresponding trip in the meantime.
func removeOrphanPayment(ctx context.Context, c *firestore.Client, ref *firestore.DocumentRef, cutoff time.Time) (bool, error) {
	removed := false
	err := c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		removed = false
		payment, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read payment: %w", err)
		}
		if !orphanPaymentEligible(payment.Data(), payment.UpdateTime, cutoff) {
			return nil
		}
		_, err = tx.Get(c.Collection(fs.ColTripsLive).Doc(ref.ID))
		if err == nil {
			return nil
		}
		if !isMissingTrip(err) {
			return fmt.Errorf("read trip: %w", err)
		}
		if err := tx.Delete(ref); err != nil {
			return fmt.Errorf("delete payment: %w", err)
		}
		removed = true
		return nil
	})
	if err != nil {
		return false, err
	}
	return removed, nil
}
