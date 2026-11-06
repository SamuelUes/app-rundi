package reconcile

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type checkpointItem struct {
	id       string
	sortTime time.Time
	version  float64
}

// runCheckpointPage advances only after each item's external work succeeds.
// The loader must return items in (sortTime, ID) order within the window.
func runCheckpointPage(ctx context.Context, pool *pgxpool.Pool, c *checkpoint, limit int,
	load func(context.Context, *checkpoint, int) ([]checkpointItem, error),
	apply func(context.Context, checkpointItem) error,
) (processed int, more bool, err error) {
	finished := false
	defer func() {
		if finished {
			return
		}
		releaseCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if releaseErr := releaseCheckpoint(releaseCtx, pool, c); releaseErr != nil {
			slog.Warn("reconcile checkpoint release", "aggregate", c.aggregateType, "err", releaseErr)
		}
	}()

	if limit <= 0 {
		return 0, false, fmt.Errorf("invalid reconciliation batch size %d", limit)
	}
	items, err := load(ctx, c, limit)
	if err != nil {
		return 0, false, err
	}
	if len(items) > limit {
		return 0, false, fmt.Errorf("reconciliation loader returned %d items for limit %d", len(items), limit)
	}
	for _, item := range items {
		if item.id == "" || item.sortTime.Before(c.completedThrough) || item.sortTime.After(c.windowEnd) ||
			(c.cursorUpdatedAt != nil && (item.sortTime.Before(*c.cursorUpdatedAt) ||
				(item.sortTime.Equal(*c.cursorUpdatedAt) && item.id <= *c.cursorID))) {
			return processed, false, fmt.Errorf("invalid reconciliation cursor for %s", c.aggregateType)
		}
		if err := apply(ctx, item); err != nil {
			return processed, false, err
		}
		if err := saveCheckpoint(ctx, pool, c, item.sortTime, item.id); err != nil {
			return processed, false, err
		}
		timestamp, id := item.sortTime, item.id
		c.cursorUpdatedAt, c.cursorID = &timestamp, &id
		processed++
	}
	if len(items) == limit {
		return processed, true, nil
	}
	if err := finishCheckpoint(ctx, pool, c); err != nil {
		return processed, false, err
	}
	finished = true
	return processed, false, nil
}
