// sessions.go — control SQL de autorización de disponibilidad por conductor.
// driver_sessions NO es el estado online/offline: cercan ofertas, asignación,
// barrido de medianoche y finalización; la proyección operativa va por outbox.
package compliance

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Errores de gate: distinguen "debe reactivar" (negocio) de fallos técnicos y
// de señales desactualizadas. Todos cierran la autorización, no la abren.
var (
	ErrReactivationRequired = errors.New("driver reactivation required")
	ErrSessionNotLive       = errors.New("driver session not live")
	ErrSessionSignalsStale  = errors.New("driver session signals changed")
)

// OpenDriverSession — registra una autorización nueva dentro de la tx del
// llamador: session_id nuevo, session_seq+1 y reactivation_required=false.
// La llamada con un contexto incompleto es error (nunca autoriza a medias).
func OpenDriverSession(ctx context.Context, tx pgx.Tx, driverUUID, day string,
	vehicleID *string, serviceCodes []string, gens map[string]int64, expiresAt time.Time) (sessionID string, seq int64, err error) {

	if day == "" || len(serviceCodes) == 0 || len(gens) == 0 || expiresAt.IsZero() {
		return "", 0, errors.New("invalid driver session context")
	}
	gensJSON, err := json.Marshal(gens)
	if err != nil {
		return "", 0, err
	}
	newID := uuid.NewString()
	err = tx.QueryRow(ctx, `
		INSERT INTO public.driver_sessions
			(driver_id, session_seq, session_id, day, vehicle_id, service_codes,
			 input_generations, reactivation_required, authorized_at, expires_at, revoked_at)
		VALUES ($1::uuid, 1, $2::uuid, $3, $4::uuid, $5, $6, FALSE, clock_timestamp(), $7, NULL)
		ON CONFLICT (driver_id) DO UPDATE SET
			session_seq = driver_sessions.session_seq + 1,
			session_id = EXCLUDED.session_id,
			day = EXCLUDED.day,
			vehicle_id = EXCLUDED.vehicle_id,
			service_codes = EXCLUDED.service_codes,
			input_generations = EXCLUDED.input_generations,
			reactivation_required = FALSE,
			authorized_at = EXCLUDED.authorized_at,
			expires_at = EXCLUDED.expires_at,
			revoked_at = NULL
		RETURNING session_id::text, session_seq`,
		driverUUID, newID, day, vehicleID, serviceCodes, string(gensJSON), expiresAt).
		Scan(&sessionID, &seq)
	return sessionID, seq, err
}

// RevokeDriverSession — cierra la autorización vigente: reactivation_required
// y seq+1, para que una transición Firestore atrasada no reviva la sesión.
// Crea la fila de control si faltaba; idempotente sobre una sesión ya cerrada.
func RevokeDriverSession(ctx context.Context, tx pgx.Tx, driverUUID string) (seq int64, err error) {
	if _, err = tx.Exec(ctx, `
		INSERT INTO public.driver_sessions (driver_id) VALUES ($1::uuid)
		ON CONFLICT (driver_id) DO NOTHING`, driverUUID); err != nil {
		return 0, err
	}
	if err = tx.QueryRow(ctx, `
		UPDATE public.driver_sessions
		SET session_seq = session_seq + 1,
		    session_id = NULL,
		    reactivation_required = TRUE,
		    revoked_at = clock_timestamp()
		WHERE driver_id = $1::uuid
		  AND (session_id IS NOT NULL OR reactivation_required = FALSE)
		RETURNING session_seq`, driverUUID).Scan(&seq); err != nil &&
		!errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	err = tx.QueryRow(ctx, `
		SELECT session_seq FROM public.driver_sessions WHERE driver_id = $1::uuid`,
		driverUUID).Scan(&seq)
	return seq, err
}

// RevokeDriverSessionIfSeq — como RevokeDriverSession pero solo actúa si la
// sesión sigue en expectedSeq: un barrido que leyó la seq antes de una
// reactivación concurrente no puede cerrar la sesión nueva. Devuelve
// (expectedSeq+1, true) si revocó; (0, false) si ya no coincide.
func RevokeDriverSessionIfSeq(ctx context.Context, tx pgx.Tx, driverUUID string, expectedSeq int64) (int64, bool, error) {
	tag, err := tx.Exec(ctx, `
		UPDATE public.driver_sessions
		SET session_seq = session_seq + 1,
		    session_id = NULL,
		    reactivation_required = TRUE,
		    revoked_at = clock_timestamp()
		WHERE driver_id = $1::uuid AND session_seq = $2
		  AND session_id IS NOT NULL`, driverUUID, expectedSeq)
	if err != nil {
		return 0, false, err
	}
	if tag.RowsAffected() == 0 {
		return 0, false, nil
	}
	return expectedSeq + 1, true, nil
}

// CheckDriverSession — gate dentro de la tx del llamador: exige una
// autorización viva para el día corriente de Nicaragua (hora del servidor,
// clock_timestamp, no el inicio de una tx antigua) y verifica bajo FOR SHARE
// que las señales registradas sigan iguales en compliance_signals.
func CheckDriverSession(ctx context.Context, tx pgx.Tx, driverUUID string) (sessionID string, err error) {
	var sessID *string
	var live bool
	var gensJSON []byte
	err = tx.QueryRow(ctx, `
		SELECT session_id::text, input_generations,
		       (session_id IS NOT NULL AND reactivation_required = FALSE
		        AND revoked_at IS NULL AND expires_at IS NOT NULL
		        AND expires_at > clock_timestamp()
		        AND day = (clock_timestamp() AT TIME ZONE 'America/Managua')::date::text)
		       AS live
		FROM public.driver_sessions WHERE driver_id = $1::uuid
		FOR SHARE`, driverUUID).Scan(&sessID, &gensJSON, &live)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrReactivationRequired
	}
	if err != nil {
		return "", err
	}
	if !live || sessID == nil {
		return "", ErrReactivationRequired
	}
	var recorded map[string]int64
	if err := json.Unmarshal(gensJSON, &recorded); err != nil || len(recorded) == 0 {
		return "", ErrSessionSignalsStale
	}
	keys := make([]signalKey, 0, len(recorded))
	for mapKey := range recorded {
		kind, key, ok := strings.Cut(mapKey, ":")
		if !ok || key == "" {
			return "", ErrSessionSignalsStale
		}
		keys = append(keys, signalKey{kind: kind, key: key})
	}
	locked, err := lockComplianceSignals(ctx, tx, keys)
	if err != nil {
		return "", err
	}
	for mapKey, generation := range recorded {
		kind, key, _ := strings.Cut(mapKey, ":")
		if locked[signalKey{kind: kind, key: key}] != generation {
			return "", ErrSessionSignalsStale
		}
	}
	return *sessID, nil
}
