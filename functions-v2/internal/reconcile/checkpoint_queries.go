package reconcile

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// These identifiers and expressions are fixed backend constants, never input
// from a request. UUID ordering matches canonical UUID string ordering.
type checkpointQuerySpec struct {
	table      string
	id         string
	versionSQL string
	idType     string
	collation  string
}

var checkpointQuerySpecs = map[string]checkpointQuerySpec{
	"ride":    {"public.rides", "id", "version::double precision", "uuid", ""},
	"payment": {"public.payments", "id", "COALESCE(EXTRACT(EPOCH FROM updated_at) * 1000, 0)::double precision", "uuid", ""},
	"driver":  {"public.drivers", "user_id", "COALESCE(EXTRACT(EPOCH FROM updated_at) * 1000, 0)::double precision", "text", ` COLLATE "C"`},
	"vehicle": {"public.vehicles", "id", "COALESCE(EXTRACT(EPOCH FROM updated_at) * 1000000, 0)::double precision", "uuid", ""},
}

func (q checkpointQuerySpec) changesQuery() string {
	id := q.id + q.collation
	return fmt.Sprintf(`
		SELECT %s::text, %s, updated_at
		FROM %s
		WHERE updated_at >= $1 AND updated_at <= $2
		  AND ($3::timestamptz IS NULL OR
		       (updated_at, %s) > ($3::timestamptz, $4::%s%s))
		ORDER BY updated_at, %s LIMIT $5`,
		q.id, q.versionSQL, q.table, id, q.idType, q.collation, id)
}

func (q checkpointQuerySpec) auditQuery() string {
	id := q.id + q.collation
	return fmt.Sprintf(`
		SELECT %s::text, %s FROM %s
		WHERE ($1::%s IS NULL OR %s > $1::%s%s)
		ORDER BY %s LIMIT $2`,
		q.id, q.versionSQL, q.table, q.idType, id, q.idType, q.collation, id)
}

func loadCheckpointItems(ctx context.Context, pool *pgxpool.Pool, c *checkpoint, limit int, q checkpointQuerySpec, audit bool) ([]checkpointItem, error) {
	query := q.changesQuery()
	args := []any{c.completedThrough, c.windowEnd, c.cursorUpdatedAt, c.cursorID, limit}
	if audit {
		query = q.auditQuery()
		args = []any{c.cursorID, limit}
	}
	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("load reconciliation page: %w", err)
	}
	defer rows.Close()
	var items []checkpointItem
	for rows.Next() {
		var item checkpointItem
		if audit {
			// The audit uses immutable ID ordering; the fixed timestamp is
			// only the first half of its durable cursor.
			item.sortTime = c.completedThrough
			err = rows.Scan(&item.id, &item.version)
		} else {
			err = rows.Scan(&item.id, &item.version, &item.sortTime)
		}
		if err != nil {
			return nil, fmt.Errorf("scan reconciliation page: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read reconciliation page: %w", err)
	}
	return items, nil
}
