package reconcile

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var errCheckpointLeaseLost = errors.New("reconciliation checkpoint lease lost")

type checkpoint struct {
	aggregateType    string
	owner            uuid.UUID
	completedThrough time.Time
	windowEnd        time.Time
	cursorUpdatedAt  *time.Time
	cursorID         *string
}

// claimCheckpoint fixes the window end on first claim and retains it after a
// crash. No database transaction remains open during projection work.
func claimCheckpoint(ctx context.Context, pool *pgxpool.Pool, aggregateType string, initialFrom time.Time, lease time.Duration) (*checkpoint, error) {
	return claimScheduledCheckpoint(ctx, pool, aggregateType, initialFrom, lease, 0)
}

func claimScheduledCheckpoint(ctx context.Context, pool *pgxpool.Pool, aggregateType string, initialFrom time.Time, lease, interval time.Duration) (*checkpoint, error) {
	if aggregateType == "" || lease <= 0 || interval < 0 || initialFrom.IsZero() {
		return nil, errors.New("invalid reconciliation checkpoint claim")
	}
	owner := uuid.New()
	c := &checkpoint{aggregateType: aggregateType, owner: owner}
	err := pool.QueryRow(ctx, `
		INSERT INTO public.reconcile_checkpoints
			(aggregate_type, completed_through, window_end, lease_owner, lease_until)
		SELECT $1, $2, clock_timestamp(), $3, clock_timestamp() + $4 * interval '1 second'
		WHERE $2 <= clock_timestamp()
		ON CONFLICT (aggregate_type) DO UPDATE SET
			window_end = COALESCE(reconcile_checkpoints.window_end, clock_timestamp()),
			lease_owner = EXCLUDED.lease_owner,
			lease_until = clock_timestamp() + $4 * interval '1 second'
		WHERE (reconcile_checkpoints.lease_until IS NULL
		   OR reconcile_checkpoints.lease_until <= clock_timestamp())
		  AND (reconcile_checkpoints.window_end IS NOT NULL
		       OR reconcile_checkpoints.completed_through <= clock_timestamp() - $5 * interval '1 second')
		RETURNING completed_through, window_end, cursor_updated_at, cursor_id`,
		aggregateType, initialFrom, owner, lease.Seconds(), interval.Seconds()).
		Scan(&c.completedThrough, &c.windowEnd, &c.cursorUpdatedAt, &c.cursorID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("claim reconciliation checkpoint: %w", err)
	}
	return c, nil
}

func renewCheckpoint(ctx context.Context, pool *pgxpool.Pool, c *checkpoint, lease time.Duration) error {
	if lease <= 0 {
		return errors.New("invalid reconciliation checkpoint lease")
	}
	tag, err := pool.Exec(ctx, `
		UPDATE public.reconcile_checkpoints
		SET lease_until = clock_timestamp() + $3 * interval '1 second'
		WHERE aggregate_type = $1 AND lease_owner = $2 AND lease_until > clock_timestamp()`,
		c.aggregateType, c.owner, lease.Seconds())
	return checkpointUpdateResult(tag.RowsAffected(), err)
}

// saveCheckpoint is called only after every item through the cursor succeeds.
func saveCheckpoint(ctx context.Context, pool *pgxpool.Pool, c *checkpoint, updatedAt time.Time, id string) error {
	if id == "" {
		return errors.New("empty reconciliation cursor ID")
	}
	tag, err := pool.Exec(ctx, `
		UPDATE public.reconcile_checkpoints
		SET cursor_updated_at = $3, cursor_id = $4
		WHERE aggregate_type = $1 AND lease_owner = $2 AND lease_until > clock_timestamp()
		  AND $3 >= completed_through AND $3 <= window_end
		  AND (cursor_updated_at IS NULL OR
		       (cursor_updated_at, cursor_id COLLATE "C") < ($3, $4::text COLLATE "C"))`,
		c.aggregateType, c.owner, updatedAt, id)
	return checkpointUpdateResult(tag.RowsAffected(), err)
}

func finishCheckpoint(ctx context.Context, pool *pgxpool.Pool, c *checkpoint) error {
	tag, err := pool.Exec(ctx, `
		UPDATE public.reconcile_checkpoints
		SET completed_through = window_end, window_end = NULL,
		    cursor_updated_at = NULL, cursor_id = NULL, lease_owner = NULL, lease_until = NULL
		WHERE aggregate_type = $1 AND lease_owner = $2 AND lease_until > clock_timestamp()`,
		c.aggregateType, c.owner)
	return checkpointUpdateResult(tag.RowsAffected(), err)
}

// releaseCheckpoint keeps the window and cursor so a failed run can resume
// without waiting for its lease to expire.
func releaseCheckpoint(ctx context.Context, pool *pgxpool.Pool, c *checkpoint) error {
	tag, err := pool.Exec(ctx, `
		UPDATE public.reconcile_checkpoints
		SET lease_owner = NULL, lease_until = NULL
		WHERE aggregate_type = $1 AND lease_owner = $2 AND lease_until > clock_timestamp()`,
		c.aggregateType, c.owner)
	return checkpointUpdateResult(tag.RowsAffected(), err)
}

func checkpointUpdateResult(affected int64, err error) error {
	if err != nil {
		return fmt.Errorf("update reconciliation checkpoint: %w", err)
	}
	if affected != 1 {
		return errCheckpointLeaseLost
	}
	return nil
}
