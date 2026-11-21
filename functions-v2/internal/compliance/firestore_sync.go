// firestore_sync.go — resync de los inputs de disponibilidad Firestore desde
// el estado SQL. Corre tras mutaciones documentales (post-commit), en el
// consumer (evento driver.fs_inputs_stale) y como autoreparación cuando la
// activación encuentra inputs ausentes/denegados.
package compliance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	grpccodes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/compliancedocs"
	"github.com/rundi/functions-v2/internal/fs"
)

// RevokeAllFirestoreSessions — cierra todas las sesiones _fs vivas (cambio de
// reglas/política): sesión Firestore + estado live por cada entrada de la cola
// de expiración, y marca el espejo SQL para que ninguna tx de viaje pase.
func RevokeAllFirestoreSessions(ctx context.Context, client *firestore.Client, pool *pgxpool.Pool) (int, error) {
	docs, err := client.Collection(fs.ColDriverAvailabilityExpiry).Documents(ctx).GetAll()
	if err != nil {
		return 0, err
	}
	revoked := 0
	var firstErr error
	for _, doc := range docs {
		uid, _ := doc.Data()["driverUid"].(string)
		if uid != doc.Ref.ID || !validFirestoreUID(uid) {
			if firstErr == nil {
				firstErr = fmt.Errorf("invalid availability expiry %s", doc.Ref.ID)
			}
			continue
		}
		if err := DeactivateFirestoreSession(ctx, client, uid); err != nil && firstErr == nil {
			firstErr = err
			continue
		}
		revoked++
	}
	if _, err := pool.Exec(ctx, `
		UPDATE public.driver_sessions
		SET session_seq = session_seq + 1, session_id = NULL,
		    reactivation_required = TRUE, revoked_at = clock_timestamp()
		WHERE session_id IS NOT NULL
		  AND COALESCE(input_generations ->> '_fs', '') = '1'`); err != nil && firstErr == nil {
		firstErr = err
	}
	return revoked, firstErr
}

// SyncResult — decisión reevaluada durante el resync; permite a la
// activación devolver los motivos sin una segunda evaluación.
type SyncResult struct {
	Allowed bool
	Status  string
	Reasons []Reason
}

// activationContext — vehículo activo, servicios habilitados y expiración de
// sesión compartida por la activación y el resync.
type activationContext struct {
	driverUUID   string
	vehicleID    *string
	serviceCodes []string
	expiresAt    time.Time
	day          string
}

func (s *Service) loadActivationContext(ctx context.Context, driverUUID string, now time.Time) (*activationContext, error) {
	day, dayEnd := NicaraguaDayWindow(now)
	var vehicleID *string
	{
		var id string
		err := s.pool.QueryRow(ctx, `SELECT id::text FROM public.vehicles
			WHERE driver_id = $1::uuid AND is_active = TRUE AND deleted_at IS NULL
			ORDER BY created_at DESC, id DESC LIMIT 1`, driverUUID).Scan(&id)
		switch {
		case err != nil && !errors.Is(err, pgx.ErrNoRows):
			return nil, err
		case err == nil:
			vehicleID = &id
		}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT s.code, ds.expires_at
		FROM public.driver_services ds
		JOIN public.services s ON s.id = ds.service_id AND s.is_active
		WHERE ds.driver_id = $1::uuid AND ds.is_active AND ds.is_approved
		  AND (ds.expires_at IS NULL OR ds.expires_at > clock_timestamp())
		ORDER BY s.code`, driverUUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var serviceCodes []string
	var earliestExpiry *time.Time
	for rows.Next() {
		var code string
		var exp *time.Time
		if err := rows.Scan(&code, &exp); err != nil {
			return nil, err
		}
		serviceCodes = append(serviceCodes, code)
		if exp != nil && (earliestExpiry == nil || exp.Before(*earliestExpiry)) {
			earliestExpiry = exp
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	expiresAt := dayEnd
	if earliestExpiry != nil && earliestExpiry.Before(dayEnd) {
		expiresAt = *earliestExpiry
	}
	return &activationContext{
		driverUUID: driverUUID, vehicleID: vehicleID,
		serviceCodes: serviceCodes, expiresAt: expiresAt, day: day,
	}, nil
}

// ensureCompliancePolicy — crea la política global si falta (bootstrap del
// cutover) y devuelve su versión vigente.
func ensureCompliancePolicy(ctx context.Context, client *firestore.Client) (int64, error) {
	ref := client.Collection(fs.ColCompliancePolicy).Doc("active")
	var version int64
	err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if status.Code(err) == grpccodes.NotFound {
			version = 1
			return tx.Set(ref, map[string]any{"version": version, "engineVersion": RulesVersion})
		}
		if err != nil {
			return err
		}
		v, ok := snap.Data()["version"].(int64)
		if !ok || v <= 0 {
			return errors.New("malformed compliance policy")
		}
		version = v
		return nil
	})
	return version, err
}

// BumpCompliancePolicy — incrementa la versión global (cambio de reglas) y
// devuelve la nueva. Todas las sesiones _fs quedan invalidadas por el fence
// de policyVersion.
func BumpCompliancePolicy(ctx context.Context, client *firestore.Client) (int64, error) {
	ref := client.Collection(fs.ColCompliancePolicy).Doc("active")
	var version int64
	err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if status.Code(err) == grpccodes.NotFound {
			version = 1
			return tx.Set(ref, map[string]any{"version": version, "engineVersion": RulesVersion})
		}
		if err != nil {
			return err
		}
		v, _ := snap.Data()["version"].(int64)
		version = v + 1
		return tx.Set(ref, map[string]any{"version": version, "engineVersion": RulesVersion})
	})
	return version, err
}

// SyncFirestoreInputs — reevalúa en SQL, reemplaza atómicamente los inputs +
// snapshot de documentos en Firestore (revocando la sesión si cambiaron) y
// limpia la marca reactivation_required del espejo _fs. Idempotente por la
// revisión monotónica de inputs.
func (s *Service) SyncFirestoreInputs(ctx context.Context, uid string) (*SyncResult, error) {
	if s.fs == nil {
		return nil, errors.New("firestore client unavailable")
	}
	dID, fUID, found, err := driverRowWithQuerier(ctx, s.pool, uid)
	if err != nil {
		return nil, err
	}
	if !found || fUID == "" {
		return nil, ErrDriverNotFound
	}
	uid = fUID
	now := time.Now()
	actx, err := s.loadActivationContext(ctx, dID, now)
	if err != nil {
		return nil, err
	}

	allowed, statusStr, reasons := false, "non_compliant", []Reason{{
		Code: "NO_ENABLED_SERVICES", Severity: SevBlocking, Blocking: true,
		Status: StatusFail, Message: "No tienes servicios habilitados.",
	}}
	if actx.vehicleID == nil {
		reasons = []Reason{{
			Code: "VEHICLE_NOT_FOUND", Severity: SevBlocking, Blocking: true,
			Status: StatusFail, Message: "Sin vehículo activo.",
		}}
	} else if len(actx.serviceCodes) > 0 {
		ev, err := s.evaluateForActivation(ctx, dID, actx.vehicleID, actx.serviceCodes, actx.day)
		if err != nil {
			return nil, err
		}
		allowed, statusStr, reasons = ev.Allowed, ev.Status, ev.Reasons
	}

	policyVersion, err := ensureCompliancePolicy(ctx, s.fs)
	if err != nil {
		return nil, err
	}
	documents, err := compliancedocs.LoadDriverDocumentData(ctx, s.pool, uid)
	if err != nil {
		return nil, err
	}
	inputs := FirestoreAvailabilityInputs{
		DriverUID: uid, DriverID: dID, VehicleID: strOrEmpty(actx.vehicleID),
		Allowed: allowed, PolicyVersion: policyVersion, EngineVersion: RulesVersion,
		Day: actx.day, ExpiresAt: actx.expiresAt, ServiceCodes: actx.serviceCodes,
	}
	history := map[string]any{
		"documents":  documents,
		"evaluation": map[string]any{"allowed": allowed, "status": statusStr, "rulesVersion": RulesVersion},
	}
	inputRef := s.fs.Collection(fs.ColDriverAvailabilityInputs).Doc(uid)
	for attempt := 0; ; attempt++ {
		snap, err := inputRef.Get(ctx)
		if err != nil && status.Code(err) != grpccodes.NotFound {
			return nil, err
		}
		var revision int64
		if err == nil {
			revision, _ = snap.Data()["revision"].(int64)
		}
		inputs.Revision = revision + 1
		err = ReplaceFirestoreAvailabilityInputs(ctx, s.fs, uid, revision, inputs, documents, history)
		if err == nil {
			break
		}
		if !errors.Is(err, ErrSessionSignalsStale) || attempt >= 2 {
			return nil, err
		}
	}
	// El resync validó el estado actual: el espejo _fs puede reabrirse en la
	// próxima activación. Se limpia también en filas legacy (sin marca _fs):
	// una marca vieja de la arquitectura anterior no debe bloquear el primer
	// espejo Firestore — este resync ya reevaluó contra los datos actuales.
	// Una sesión legacy viva mantiene su defensa propia (comparación de
	// generaciones de señal en CheckDriverSession).
	if _, err := s.pool.Exec(ctx, `
		UPDATE public.driver_sessions SET reactivation_required = FALSE
		WHERE driver_id = $1::uuid AND reactivation_required`, dID); err != nil {
		return nil, err
	}
	return &SyncResult{Allowed: allowed, Status: statusStr, Reasons: reasons}, nil
}
