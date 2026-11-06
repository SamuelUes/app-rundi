package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

var errOutboxLeaseLost = errors.New("outbox lease lost")

type outboxExecutor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func markOutboxPublished(ctx context.Context, db outboxExecutor, id string, lease time.Time) error {
	return updateClaimedOutbox(ctx, db, id, `
		UPDATE public.outbox_events
		SET status = 'published', published_at = NOW(), last_error = NULL
		WHERE event_id = $1 AND status = 'pending' AND next_attempt_at = $2
		  AND next_attempt_at > NOW()`, id, lease)
}

func markOutboxFailed(ctx context.Context, db outboxExecutor, id string, lease time.Time, message string) error {
	return updateClaimedOutbox(ctx, db, id, `
		UPDATE public.outbox_events
		SET status = 'failed', failed_at = NOW(), last_error = $2
		WHERE event_id = $1 AND status = 'pending' AND next_attempt_at = $3
		  AND next_attempt_at > NOW()`, id, message, lease)
}

func rescheduleOutbox(ctx context.Context, db outboxExecutor, id string, lease time.Time, seconds int, message string) error {
	return updateClaimedOutbox(ctx, db, id, `
		UPDATE public.outbox_events
		SET next_attempt_at = NOW() + $2 * interval '1 second', last_error = $3
		WHERE event_id = $1 AND status = 'pending' AND next_attempt_at = $4
		  AND next_attempt_at > NOW()`, id, seconds, message, lease)
}

func updateClaimedOutbox(ctx context.Context, db outboxExecutor, id, query string, args ...any) error {
	tag, err := db.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("update outbox event %s: %w", id, err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("%w: %s", errOutboxLeaseLost, id)
	}
	return nil
}
