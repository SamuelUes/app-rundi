package main

import (
	"context"
	"errors"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/compliance"
	"github.com/rundi/functions-v2/internal/outbox"
)

// sweepExpiredDriverSessions — transición de medianoche Nicaragua (y de
// vencimientos anticipados de servicios): cada sesión vencida se revoca bajo
// el candado del conductor. Si no tiene un viaje activo, además se emite la
// intención durable de offline; si está asignado o en viaje, no se le toca el
// estado operativo — CompleteRide proyecta el offline al terminar.
// El candado serializa con OpenDriverSession (una reactivación que ganó el
// candado deja expires_at en el futuro y se salta) y con CheckDriverSession
// (una asignación que leyó FOR SHARE espera a que la revocación confirme).
func sweepExpiredDriverSessions(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	rows, err := pool.Query(ctx, `
		SELECT ds.driver_id::text, d.user_id
		FROM public.driver_sessions ds
		JOIN public.drivers d ON d.id = ds.driver_id
		WHERE ds.session_id IS NOT NULL AND ds.expires_at <= clock_timestamp()
		ORDER BY ds.expires_at
		LIMIT 500`)
	if err != nil {
		return 0, err
	}
	type candidate struct{ driverID, uid string }
	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.driverID, &c.uid); err == nil {
			candidates = append(candidates, c)
		}
	}
	rows.Close()

	revoked := 0
	for _, c := range candidates {
		if err := expireOneSession(ctx, pool, c.driverID, c.uid); err != nil {
			slog.Warn("driver session sweep", "driver", c.driverID, "err", err)
			continue
		}
		revoked++
	}
	return revoked, nil
}

func expireOneSession(ctx context.Context, pool *pgxpool.Pool, driverID, uid string) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Candado + re-verificación dentro de la tx: si la sesión fue reabierta o
	// ya no está vencida, esta fila ya no corresponde al barrido.
	var stillExpired bool
	if err := tx.QueryRow(ctx, `
		SELECT (session_id IS NOT NULL AND expires_at <= clock_timestamp())
		FROM public.driver_sessions WHERE driver_id = $1::uuid FOR UPDATE`,
		driverID).Scan(&stillExpired); err != nil {
		return err
	}
	if !stillExpired {
		return nil
	}
	seq, err := compliance.RevokeDriverSession(ctx, tx, driverID)
	if err != nil {
		return err
	}
	// ¿Sigue en un viaje activo? rides.driver_id guarda el user_id.
	var onRide bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM public.rides
			WHERE driver_id = $1 AND status IN
				('accepted','driver_on_route','driver_arrived','in_progress','pending_payment'))`,
		uid).Scan(&onRide); err != nil {
		return err
	}
	if !onRide {
		if _, err := outbox.InsertReturning(ctx, tx, outbox.Event{
			Type: "driver.deactivated", AggregateType: "driver", AggregateID: driverID,
			Payload: map[string]any{
				"driverUid": uid, "driverId": driverID,
				"sessionSeq": seq, "reason": "session_expired",
			},
		}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// revokeSessionForOffline — cuando un barrido de Firestore ya marcó offline al
// conductor, cierra también su sesión SQL. Con fenced=true la revocación solo
// aplica si session_seq sigue igual al observado (una reactivación posterior
// al escaneo no se toca); el evento deactivated queda cercado por esa misma
// seq en la proyección.
func revokeSessionForOffline(ctx context.Context, pool *pgxpool.Pool, uid string,
	expectedSeq int64, fenced bool, reason string) error {

	var driverID string
	err := pool.QueryRow(ctx,
		`SELECT id::text FROM public.drivers WHERE user_id = $1 AND deleted_at IS NULL`,
		uid).Scan(&driverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var seq int64
	if fenced {
		var revoked bool
		if seq, revoked, err = compliance.RevokeDriverSessionIfSeq(ctx, tx, driverID, expectedSeq); err != nil {
			return err
		}
		if !revoked {
			return nil
		}
	} else {
		if seq, err = compliance.RevokeDriverSession(ctx, tx, driverID); err != nil {
			return err
		}
	}
	if _, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type: "driver.deactivated", AggregateType: "driver", AggregateID: driverID,
		Payload: map[string]any{
			"driverUid": uid, "driverId": driverID,
			"sessionSeq": seq, "reason": reason,
		},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
