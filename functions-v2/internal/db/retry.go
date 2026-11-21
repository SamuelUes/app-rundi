package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// RetrySerializable reintenta fn cuando la TX muere por un fallo transitorio
// de concurrencia: SQLSTATE 40001 (could not serialize — esperado bajo
// pgx.Serializable cuando dos TXs actualizan filas solapadas, p.ej. la API
// contra la proyección del consumer sobre el mismo ride) y 40P01 (deadlock).
// Postgres define ambos como retry-safe; errores de dominio (apperr 4xx) y
// cualquier otro fallo retornan inmediato sin reintento.
func RetrySerializable(ctx context.Context, fn func(context.Context) error) error {
	var err error
	for attempt := 0; attempt < 4; attempt++ {
		if err = fn(ctx); err == nil || !isRetryableTxError(err) {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(25*(1<<attempt)) * time.Millisecond):
		}
	}
	return err
}

func isRetryableTxError(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && (pgErr.Code == "40001" || pgErr.Code == "40P01")
}
