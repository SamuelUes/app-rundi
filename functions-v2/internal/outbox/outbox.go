// Package outbox — Transactional Outbox SQL (doc §6.1).
// El evento se inserta EN LA MISMA TX que la mutación de negocio; el sweeper
// (cmd/consumer) lo proyecta a Firestore con idempotencia.
package outbox

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type Event struct {
	Type          string // 'ride.status_changed', 'payment.completed', ...
	AggregateType string // 'ride' | 'payment' | 'driver' | ...
	AggregateID   string // UUID o Firebase UID según agregado
	Payload       any    // serializado a JSONB (schema_version=1)
	RequestID     string
}

// Insert dentro de una TX abierta por el comando de negocio.
func Insert(ctx context.Context, tx pgx.Tx, e Event) error {
	_, err := InsertReturning(ctx, tx, e)
	return err
}

// InsertReturning — igual que Insert pero devuelve event_id (fast-path:
// la API puede proyectar el evento inline sin esperar al consumer).
func InsertReturning(ctx context.Context, tx pgx.Tx, e Event) (string, error) {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return "", fmt.Errorf("outbox marshal: %w", err)
	}
	var eventID string
	err = tx.QueryRow(ctx, `
		INSERT INTO public.outbox_events
			(event_type, aggregate_type, aggregate_id, payload, request_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING event_id::text`,
		e.Type, e.AggregateType, e.AggregateID, payload, nullStr(e.RequestID),
	).Scan(&eventID)
	return eventID, err
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}
