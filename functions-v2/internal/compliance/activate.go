// activate.go — activación explícita de disponibilidad.
// Flujo: contexto SQL → reutiliza la decisión diaria vigente o evalúa en un
// snapshot consistente → autoriza con re-verificación de señales bajo lock →
// outbox driver.activated proyecta el estado operativo a Firestore.
package compliance

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

var (
	ErrDriverNotFound  = errors.New("driver not found")
	ErrNoActiveVehicle = errors.New("driver has no active vehicle")
)

type ActivationResult struct {
	Allowed          bool     `json:"allowed"`
	Status           string   `json:"status"`
	Reasons          []Reason `json:"reasons,omitempty"`
	SessionID        string   `json:"sessionId,omitempty"`
	SessionSeq       int64    `json:"sessionSeq,omitempty"`
	ReusedEvaluation bool     `json:"reusedEvaluation"`
}

// ActivateAvailability — el conductor pide activarse. Devuelve la decisión
// con sus motivos; una autorización crea la sesión SQL y el evento durable.
// El guardado de la caché es best-effort post-commit (si falla, la próxima
// activación reevalúa — la autorización ya quedó registrada en SQL).
func (s *Service) ActivateAvailability(ctx context.Context, uid string, store *DailyStore) (*ActivationResult, error) {
	return s.activateAvailability(ctx, uid, store, nil)
}

// ActivateAvailabilityPostRide — misma activación pero marca el evento
// driver.activated como reactivación post-viaje: la proyección puede bajar
// un 'on_ride' obsoleto (tras el pago no puede existir viaje nuevo, el
// conductor venía de offline). Es el regreso automático a 'online' una vez
// terminado el proceso de viaje y de pago.
func (s *Service) ActivateAvailabilityPostRide(ctx context.Context, uid string, store *DailyStore) (*ActivationResult, error) {
	return s.activateAvailability(ctx, uid, store, map[string]any{"postRideReactivation": true})
}

func (s *Service) activateAvailability(ctx context.Context, uid string, store *DailyStore, extra map[string]any) (*ActivationResult, error) {
	now := time.Now()
	today, _ := NicaraguaDayWindow(now)

	dID, fUID, found, err := driverRowWithQuerier(ctx, s.pool, uid)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrDriverNotFound
	}
	if s.fs != nil {
		if fUID == "" {
			return nil, ErrDriverNotFound
		}
		return s.activateAvailabilityFirestore(ctx, fUID, extra)
	}

	// La decisión diaria vive en Firestore (la lectura más lenta del camino):
	// corre en paralelo al batch SQL de vehículo+servicios (un solo RTT).
	type dailyLoad struct {
		decision DailyDecision
		found    bool
	}
	var loadCh chan dailyLoad
	if store != nil {
		loadCh = make(chan dailyLoad, 1)
		go func() {
			d, found, err := store.Load(ctx, dID)
			loadCh <- dailyLoad{decision: d, found: err == nil && found}
		}()
	}

	actx, err := s.loadActivationContext(ctx, dID, now)
	if err != nil {
		return nil, err
	}
	vehicleID, serviceCodes, expiresAt := actx.vehicleID, actx.serviceCodes, actx.expiresAt
	if vehicleID == nil {
		return nil, ErrNoActiveVehicle
	}
	if len(serviceCodes) == 0 {
		return &ActivationResult{Allowed: false, Status: "non_compliant", Reasons: []Reason{{
			Code: "NO_ENABLED_SERVICES", Severity: SevBlocking, Blocking: true,
			Status: StatusFail, Message: "No tienes servicios habilitados.",
		}}}, nil
	}

	reused := false
	var decision *DailyDecision
	if loadCh != nil {
		if loaded := <-loadCh; loaded.found &&
			s.reusableAgainstCurrent(ctx, loaded.decision, dID, vehicleID, serviceCodes, now) {
			decision = &loaded.decision
			reused = true
		}
	}

	for attempts := 3; ; attempts-- {
		if decision == nil {
			ev, err := s.evaluateForActivation(ctx, dID, vehicleID, serviceCodes, today)
			if err != nil {
				return nil, err
			}
			if !ev.Allowed {
				return &ActivationResult{Allowed: false, Status: ev.Status, Reasons: ev.Reasons}, nil
			}
			d, err := DailyDecisionFromEvaluation(ev, serviceCodes)
			if err != nil {
				return nil, err
			}
			decision = &d
		}
		sessionID, seq, err := s.authorizeSession(ctx, uid, dID, today, vehicleID,
			serviceCodes, decision.Context.InputGenerations, expiresAt, extra)
		if err == nil {
			if store != nil {
				if !reused {
					go func(d DailyDecision) {
						saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
						defer cancel()
						if err := store.Save(saveCtx, d); err != nil {
							slog.Warn("compliance cache save failed", "err", err)
						}
					}(*decision)
				}
				// SQL and the outbox are already committed. This bounded fast path
				// avoids waiting for the scheduled consumer; the session sequence
				// fence makes a later consumer replay safe.
				payload := map[string]any{
					"driverUid": uid, "driverId": dID, "sessionId": sessionID,
					"sessionSeq": float64(seq), "vehicleId": vehicleID,
					"day": today, "expiresAt": expiresAt.UTC().Format(time.RFC3339),
				}
				services := make([]any, len(serviceCodes))
				for i, code := range serviceCodes {
					services[i] = code
				}
				payload["serviceCodes"] = services
				for k, v := range extra {
					payload[k] = v
				}
				projectionCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
				err = fs.ProjectDriverSession(projectionCtx, store.client, payload, true)
				cancel()
				if err != nil {
					slog.Warn("availability fast projection failed", "err", err)
				}
			}
			return &ActivationResult{
				Allowed: true, Status: decision.Status, Reasons: decision.Reasons,
				SessionID: sessionID, SessionSeq: seq, ReusedEvaluation: reused,
			}, nil
		}
		if !errors.Is(err, ErrSessionSignalsStale) || attempts <= 1 {
			return nil, err
		}
		decision = nil
		reused = false
	}
}

// activateAvailabilityFirestore — path autoritativo: la sesión nace en
// Firestore (sin evaluar SQL) y luego se abre el espejo SQL que cierra las
// operaciones de viaje. Si los inputs faltan o están obsoletos, se resincronizan
// desde SQL una sola vez y se reintenta (autoreparación + migración suave).
func (s *Service) activateAvailabilityFirestore(ctx context.Context, uid string,
	extra map[string]any) (*ActivationResult, error) {
	forceOnline := extra["postRideReactivation"] == true
	for attempt := 0; attempt < 3; attempt++ {
		sess, actErr := ActivateFirestoreSession(ctx, s.fs, uid, forceOnline)
		if actErr == nil {
			seq, mErr := s.openFSMirror(ctx, uid, sess, extra)
			if mErr == nil {
				return &ActivationResult{
					Allowed: true, Status: "compliant",
					SessionID: sess.SessionID, SessionSeq: seq,
				}, nil
			}
			// El espejo no abrió (flag de invalidación pendiente u otro
			// error): compensar la sesión Firestore para no mostrar online
			// con el gate cerrado.
			_ = DeactivateFirestoreSession(ctx, s.fs, uid)
			if !errors.Is(mErr, ErrReactivationRequired) {
				return nil, mErr
			}
		} else if !errors.Is(actErr, ErrReactivationRequired) {
			return nil, actErr
		}
		res, serr := s.SyncFirestoreInputs(ctx, uid)
		if serr != nil {
			return nil, serr
		}
		if !res.Allowed {
			return &ActivationResult{Allowed: false, Status: res.Status, Reasons: res.Reasons}, nil
		}
	}
	return nil, ErrReactivationRequired
}

// openFSMirror — abre la fila-espejo _fs y el evento durable driver.activated
// en una tx serializable. Si el trigger de señales marcó reactivation_required
// (mutación SQL pendiente de resync), devuelve ErrReactivationRequired.
func (s *Service) openFSMirror(ctx context.Context, uid string, sess FirestoreDriverSession,
	extra map[string]any) (int64, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	vehicleID := sess.VehicleID
	seq, err := OpenFirestoreMirrorSession(ctx, tx, sess.DriverID, sess.SessionID, sess.Day,
		&vehicleID, sess.ServiceCodes, sess.InputsVersion, sess.PolicyVersion, sess.ExpiresAt)
	if err != nil {
		return 0, err
	}
	payload := map[string]any{
		"driverUid": uid, "driverId": sess.DriverID, "sessionId": sess.SessionID,
		"sessionSeq": seq, "vehicleId": sess.VehicleID, "serviceCodes": sess.ServiceCodes,
		"day": sess.Day, "expiresAt": sess.ExpiresAt.UTC().Format(time.RFC3339),
		"source": "firestore",
	}
	for k, v := range extra {
		payload[k] = v
	}
	if _, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type: "driver.activated", AggregateType: "driver", AggregateID: sess.DriverID,
		Payload: payload,
	}); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return seq, nil
}

// authorizeSession — re-verifica las señales registradas bajo FOR SHARE dentro
// de la tx que crea la sesión y el evento outbox. Si una mutación entró entre
// la evaluación y la autorización, descarta con ErrSessionSignalsStale.
func (s *Service) authorizeSession(ctx context.Context, uid, dID, today string,
	vehicleID *string, serviceCodes []string, gens map[string]int64, expiresAt time.Time,
	extra map[string]any) (string, int64, error) {

	keys, err := signalKeysFromGenerations(gens)
	if err != nil {
		return "", 0, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return "", 0, err
	}
	defer tx.Rollback(ctx)
	locked, err := lockComplianceSignals(ctx, tx, keys)
	if errors.Is(err, errMissingComplianceSignal) {
		return "", 0, ErrSessionSignalsStale
	}
	if err != nil {
		return "", 0, err
	}
	for mapKey, generation := range gens {
		kind, key, _ := strings.Cut(mapKey, ":")
		if locked[signalKey{kind: kind, key: key}] != generation {
			return "", 0, ErrSessionSignalsStale
		}
	}
	sessionID, seq, err := OpenDriverSession(ctx, tx, dID, today, vehicleID,
		serviceCodes, gens, expiresAt)
	if err != nil {
		return "", 0, err
	}
	payload := map[string]any{
		"driverUid": uid, "driverId": dID, "sessionId": sessionID,
		"sessionSeq": seq, "vehicleId": vehicleID, "serviceCodes": serviceCodes,
		"day": today, "expiresAt": expiresAt.UTC().Format(time.RFC3339),
	}
	for k, v := range extra {
		payload[k] = v
	}
	_, err = outbox.InsertReturning(ctx, tx, outbox.Event{
		Type: "driver.activated", AggregateType: "driver", AggregateID: dID,
		Payload: payload,
	})
	if err != nil {
		return "", 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", 0, err
	}
	return sessionID, seq, nil
}

// DeactivateAvailability — cierre explícito de disponibilidad: revoca la
// sesión vigente y registra la intención durable de offline (el consumer la
// proyecta; si ya no había sesión viva es idempotente).
func (s *Service) DeactivateAvailability(ctx context.Context, uid string) error {
	dID, fUID, found, err := driverRowWithQuerier(ctx, s.pool, uid)
	if err != nil {
		return err
	}
	if !found {
		return ErrDriverNotFound
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	seq, err := RevokeDriverSession(ctx, tx, dID)
	if err != nil {
		return err
	}
	_, err = outbox.InsertReturning(ctx, tx, outbox.Event{
		Type: "driver.deactivated", AggregateType: "driver", AggregateID: dID,
		Payload: map[string]any{
			"driverUid": fUID, "driverId": dID,
			"sessionSeq": seq, "reason": "manual",
		},
	})
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	// El gate SQL ya quedó cerrado; la sesión Firestore se cierra después. Si
	// falla, el conductor no puede operar de todas formas (espejo revocado) y
	// el próximo intento la cierra de forma idempotente.
	if s.fs != nil && fUID != "" {
		if err := DeactivateFirestoreSession(ctx, s.fs, fUID); err != nil {
			return err
		}
	}
	return nil
}

// evaluateForActivation — evalúa todos los servicios habilitados sobre un solo
// snapshot RepeatableRead y consolida los motivos en una evaluación 'pair'.
func (s *Service) evaluateForActivation(ctx context.Context, driverUUID string,
	vehicleID *string, serviceCodes []string, today string) (*Evaluation, error) {

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rctx, err := loadRuleContext(ctx, tx, today)
	if err != nil {
		return nil, err
	}
	facts, err := loadFactsWithQuerier(ctx, tx, driverUUID, strOrEmpty(vehicleID), "", today)
	if err != nil {
		return nil, err
	}
	var gens map[string]int64
	if facts.Driver != nil {
		keys := signalKeysForFacts(facts.Driver.ID, facts)
		if err := seedComplianceSignals(ctx, tx, keys); err != nil {
			return nil, err
		}
		if gens, err = loadSignalGenerations(ctx, tx, keys); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	if facts.Driver == nil {
		return nil, ErrDriverNotFound
	}
	if facts.Vehicle == nil {
		return nil, ErrNoActiveVehicle
	}

	seen := map[string]bool{}
	var reasons []Reason
	for _, code := range serviceCodes {
		code := code
		facts.ServiceCode = &code
		for _, r := range EvaluateFacts(*facts, rctx) {
			if !seen[r.Code+"|"+r.Message] {
				seen[r.Code+"|"+r.Message] = true
				reasons = append(reasons, r)
			}
		}
	}
	allowed, status := SummarizeEvaluation(reasons, "pair")
	ev := &Evaluation{
		Allowed: allowed, Status: status, Reasons: reasons,
		EvaluatedAt: time.Now().Format(time.RFC3339), RulesVersion: RulesVersion,
		DriverID: &facts.Driver.ID, VehicleID: &facts.Vehicle.ID,
		NicaraguaDay: today, InputGenerations: gens,
	}
	s.persistEvaluation(ctx, ev, "pair", "activation")
	s.refreshSnapshots(ctx, facts, rctx)
	return ev, nil
}

// reusableAgainstCurrent — compara la decisión guardada con el contexto actual:
// vehículo y servicios actuales del conductor y generaciones frescas de SQL.
func (s *Service) reusableAgainstCurrent(ctx context.Context, cached DailyDecision,
	driverUUID string, vehicleID *string, serviceCodes []string, now time.Time) bool {

	keys, err := signalKeysFromGenerations(cached.Context.InputGenerations)
	if err != nil {
		return false
	}
	gens, err := loadSignalGenerations(ctx, s.pool, keys)
	if err != nil {
		return false
	}
	current := DailyContext{
		DriverID: driverUUID, VehicleID: strOrEmpty(vehicleID),
		ServiceCodes: serviceCodes, EngineVersion: RulesVersion,
		DriverGeneration: gens["driver:"+driverUUID],
		RulesGeneration:  gens["rules:global"],
		InputGenerations: gens,
	}
	return ReusableDailyDecision(cached, current, now)
}

// signalKeysFromGenerations — parsea el mapa "kind:key" de una decisión.
func signalKeysFromGenerations(gens map[string]int64) ([]signalKey, error) {
	if len(gens) == 0 {
		return nil, errors.New("empty signal generations")
	}
	keys := make([]signalKey, 0, len(gens))
	for mapKey := range gens {
		kind, key, ok := strings.Cut(mapKey, ":")
		if !ok || key == "" {
			return nil, errors.New("invalid signal generation key")
		}
		keys = append(keys, signalKey{kind: kind, key: key})
	}
	return keys, nil
}

func strOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
