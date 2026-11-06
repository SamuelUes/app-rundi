// ComplianceService — motor de compliance documental (port de
// ComplianceService.ts + ComplianceRepository.ts + api/compliance.ts de v1).
// Autoridad SQL (doc §7); snapshots derivados en drivers/vehicles.compliance_status.
package compliance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/notifications"
	rstorage "github.com/rundi/functions-v2/internal/storage"
)

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

const duplicatePlatePredicate = `LOWER(plate) = LOWER($1) AND id <> $2::uuid AND deleted_at IS NULL`

// DocumentTables — whitelist fija (los nombres van interpolados al SQL;
// nunca viene del cliente un nombre arbitrario).
var DocumentTables = map[string]bool{
	"driver_licenses":               true,
	"vehicle_circulation_cards":     true,
	"vehicle_insurance_policies":    true,
	"vehicle_inspections":           true,
	"vehicle_emission_certificates": true,
	"vehicle_road_taxes":            true,
	"vehicle_revisado_stickers":     true,
}

var vehicleDocTableByType = map[string]string{
	"circulation_card": "vehicle_circulation_cards",
	"insurance":        "vehicle_insurance_policies",
	"inspection":       "vehicle_inspections",
	"emissions":        "vehicle_emission_certificates",
	"road_tax":         "vehicle_road_taxes",
	"revisado":         "vehicle_revisado_stickers",
}

var vehicleDocTables = []string{
	"vehicle_circulation_cards", "vehicle_insurance_policies", "vehicle_inspections",
	"vehicle_emission_certificates", "vehicle_road_taxes", "vehicle_revisado_stickers",
}

type Service struct {
	pool   *pgxpool.Pool
	notify *notifications.Center // puede ser nil (push best-effort)
	sign   *rstorage.Signer      // puede ser nil (devuelve paths sin firmar)
}

func NewService(pool *pgxpool.Pool, notify *notifications.Center, sign *rstorage.Signer) *Service {
	return &Service{pool: pool, notify: notify, sign: sign}
}

// ---------- facts loading (ComplianceRepository.loadFacts) ----------

// driverRow — resuelve por UUID interno (id o user_id) o Firebase UID.
func (s *Service) driverRow(ctx context.Context, identifier string) (id, uid string, found bool, err error) {
	return driverRowWithQuerier(ctx, s.pool, identifier)
}

func driverRowWithQuerier(ctx context.Context, db factsQuerier, identifier string) (id, uid string, found bool, err error) {
	q := `SELECT id::text, user_id FROM public.drivers WHERE deleted_at IS NULL AND `
	if uuidRe.MatchString(identifier) {
		q += `(id = $1::uuid OR user_id = $1::text)`
	} else {
		q += `user_id = $1`
	}
	err = db.QueryRow(ctx, q+" LIMIT 1", identifier).Scan(&id, &uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", false, nil
	}
	return id, uid, err == nil, err
}

func (s *Service) loadContext(ctx context.Context, today string) (*RuleContext, error) {
	return loadRuleContext(ctx, s.pool, today)
}

type ruleQueryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

type factsQuerier interface {
	ruleQueryer
	QueryRow(context.Context, string, ...any) pgx.Row
}

func loadRuleContext(ctx context.Context, db ruleQueryer, today string) (*RuleContext, error) {
	rules := map[string]RuleConfig{}
	rows, err := db.Query(ctx, `
		SELECT code, severity, blocking, enabled, warning_days, legal_basis, params
		FROM public.compliance_rules`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var rc RuleConfig
		var params []byte
		var wd *int
		var lb *string
		if err := rows.Scan(&rc.Code, &rc.Severity, &rc.Blocking, &rc.Enabled, &wd, &lb, &params); err != nil {
			return nil, err
		}
		rc.WarningDays, rc.LegalBasis = wd, lb
		if err := json.Unmarshal(params, &rc.Params); err != nil {
			return nil, fmt.Errorf("invalid compliance rule params %s: %w", rc.Code, err)
		}
		if rc.Params == nil {
			rc.Params = map[string]any{}
		}
		rules[rc.Code] = rc
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var catRules []CategoryRuleRow
	crows, err := db.Query(ctx, `
		SELECT vehicle_type, service_code, required_categories, severity, confirmed_by_source
		FROM public.license_category_rules WHERE is_active = TRUE`)
	if err != nil {
		return nil, err
	}
	defer crows.Close()
	for crows.Next() {
		var r CategoryRuleRow
		if err := crows.Scan(&r.VehicleType, &r.ServiceCode, &r.RequiredCategories, &r.Severity, &r.ConfirmedBySource); err != nil {
			return nil, err
		}
		catRules = append(catRules, r)
	}
	if err := crows.Err(); err != nil {
		return nil, err
	}
	return &RuleContext{Today: today, Rules: rules, CategoryRules: catRules}, nil
}

func (s *Service) loadFacts(ctx context.Context, driverID, vehicleID, serviceCode, today string) (*Facts, error) {
	return loadFactsWithQuerier(ctx, s.pool, driverID, vehicleID, serviceCode, today)
}

func loadFactsWithQuerier(ctx context.Context, db factsQuerier, driverID, vehicleID, serviceCode, today string) (*Facts, error) {
	f := &Facts{ServiceCode: nilIf(serviceCode), VehicleRequested: vehicleID != ""}

	dID, uid, found, err := driverRowWithQuerier(ctx, db, driverID)
	if err != nil {
		return nil, err
	}
	if found {
		f.Driver = &DriverFacts{ID: dID, UserID: uid}
		var acct, docs *string
		if err := db.QueryRow(ctx, `
			SELECT account_status::text, documents_status::text
			FROM public.drivers WHERE id = $1::uuid`, dID).Scan(&acct, &docs); err != nil {
			return nil, err
		}
		f.Driver.AccountStatus, f.Driver.DocumentsStatus = acct, docs

		// Licencia vigente
		var lic LicenseFacts
		err := db.QueryRow(ctx, `
			SELECT id::text, status, license_number, license_type::text, categories,
			       issue_date::text, expiry_date::text, reported_status
			FROM public.driver_licenses
			WHERE driver_id = $1::uuid AND is_current = TRUE AND deleted_at IS NULL
			ORDER BY created_at DESC LIMIT 1`, dID).
			Scan(&lic.ID, &lic.Status, &lic.LicenseNumber, &lic.LicenseType, &lic.Categories,
				&lic.IssueDate, &lic.ExpiryDate, &lic.ReportedStatus)
		if err == nil {
			f.License = &lic
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		// Duplicado de número de licencia
		if lic.LicenseNumber != nil {
			rows, err := db.Query(ctx, `
				SELECT driver_id::text FROM public.driver_licenses
				WHERE license_number = $1 AND is_current = TRUE AND driver_id <> $2::uuid
				  AND deleted_at IS NULL`, *lic.LicenseNumber, dID)
			if err != nil {
				return nil, err
			}
			ids, err := collectDuplicateIDs(rows)
			if err != nil {
				return nil, err
			}
			f.Duplicates.LicenseNumberDriverIDs = ids
		}
	}

	if vehicleID != "" && uuidRe.MatchString(vehicleID) {
		v := &VehicleFacts{}
		err := db.QueryRow(ctx, `
			SELECT id::text, driver_id::text, plate, type, service_type, vehicle_class,
			       vin, chasis, motor, year, emission_date::text, COALESCE(is_active,false),
			       created_at::text
			FROM public.vehicles
			WHERE id = $1::uuid AND deleted_at IS NULL`, vehicleID).
			Scan(&v.ID, &v.DriverID, &v.Plate, &v.Type, &v.ServiceType, &v.VehicleClass,
				&v.Vin, &v.Chasis, &v.Motor, &v.Year, &v.EmissionDate, &v.IsActive, &v.CreatedAt)
		if err == nil {
			f.Vehicle = v
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	if f.Vehicle != nil {
		vid := f.Vehicle.ID
		// Circulación
		var c CirculationFacts
		if err := db.QueryRow(ctx, `
			SELECT id::text, status, card_number, issued_at::text, declared_valid_until::text,
			       declared_plate, declared_vin, declared_chasis, declared_motor, declared_service_type
			FROM public.vehicle_circulation_cards
			WHERE vehicle_id = $1::uuid AND is_current = TRUE AND deleted_at IS NULL
			ORDER BY created_at DESC LIMIT 1`, vid).
			Scan(&c.ID, &c.Status, &c.CardNumber, &c.IssuedAt, &c.DeclaredValidUntil,
				&c.DeclaredPlate, &c.DeclaredVin, &c.DeclaredChasis, &c.DeclaredMotor, &c.DeclaredServiceType); err == nil {
			f.Circulation = &c
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		// RC insurance
		var ins InsuranceFacts
		if err := db.QueryRow(ctx, `
			SELECT id::text, status, policy_number, insurer_code, coverage_type::text,
			       effective_from::text, effective_until::text, insured_plate, insured_vin,
			       insured_motor, insured_chasis
			FROM public.vehicle_insurance_policies
			WHERE vehicle_id = $1::uuid AND coverage_type = 'rc_obligatorio'
			  AND is_current = TRUE AND deleted_at IS NULL
			ORDER BY created_at DESC LIMIT 1`, vid).
			Scan(&ins.ID, &ins.Status, &ins.PolicyNumber, &ins.InsurerCode, &ins.CoverageType,
				&ins.EffectiveFrom, &ins.EffectiveUntil, &ins.InsuredPlate, &ins.InsuredVin,
				&ins.InsuredMotor, &ins.InsuredChasis); err == nil {
			f.RcInsurance = &ins
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		// Cobertura pasajeros
		var cnt int
		if err := db.QueryRow(ctx, `
			SELECT count(*) FROM public.vehicle_insurance_policies
			WHERE vehicle_id = $1::uuid AND coverage_type = 'pasajeros'
			  AND is_current = TRUE AND deleted_at IS NULL`, vid).Scan(&cnt); err != nil {
			return nil, err
		}
		f.HasPassengerCoverage = cnt > 0
		// Periódicos
		load := func(table, atCol string) (*PeriodicFacts, error) {
			var p PeriodicFacts
			err := db.QueryRow(ctx, fmt.Sprintf(`
				SELECT id::text, status, %s::text, result::text, valid_until::text
				FROM public.%s
				WHERE vehicle_id = $1::uuid AND is_current = TRUE AND deleted_at IS NULL
				ORDER BY created_at DESC LIMIT 1`, atCol, table), vid).
				Scan(&p.ID, &p.Status, &p.At, &p.Result, &p.ValidUntil)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, nil
			}
			return &p, err
		}
		if f.Inspection, err = load("vehicle_inspections", "inspected_at"); err != nil {
			return nil, err
		}
		if f.Emissions, err = load("vehicle_emission_certificates", "tested_at"); err != nil {
			return nil, err
		}
		// Revisado (sin result)
		var rev RevisadoFacts
		if err := db.QueryRow(ctx, `
			SELECT id::text, status, sticker_year, issued_at::text, valid_until::text
			FROM public.vehicle_revisado_stickers
			WHERE vehicle_id = $1::uuid AND is_current = TRUE AND deleted_at IS NULL
			ORDER BY created_at DESC LIMIT 1`, vid).
			Scan(&rev.ID, &rev.Status, &rev.StickerYear, &rev.IssuedAt, &rev.ValidUntil); err == nil {
			f.Revisado = &rev
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		// Rodamiento del año corriente
		var rt RoadTaxFacts
		if err := db.QueryRow(ctx, `
			SELECT id::text, status, tax_year, paid_at::text, exempt, exempt_reason
			FROM public.vehicle_road_taxes
			WHERE vehicle_id = $1::uuid AND tax_year = $2 AND is_current = TRUE
			  AND deleted_at IS NULL
			ORDER BY created_at DESC LIMIT 1`, vid, yearOf(today)).
			Scan(&rt.ID, &rt.Status, &rt.TaxYear, &rt.PaidAt, &rt.Exempt, &rt.ExemptReason); err == nil {
			f.RoadTax = &rt
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		// Duplicados placa/vin/póliza
		dup := func(q string, args ...any) ([]string, error) {
			rows, err := db.Query(ctx, q, args...)
			if err != nil {
				return nil, err
			}
			return collectDuplicateIDs(rows)
		}
		if ids, err := dup(`SELECT id::text FROM public.vehicles WHERE `+duplicatePlatePredicate, f.Vehicle.Plate, vid); err != nil {
			return nil, err
		} else {
			f.Duplicates.PlateVehicleIDs = ids
		}
		if f.Vehicle.Vin != nil || f.Vehicle.Chasis != nil || f.Vehicle.Motor != nil {
			if ids, err := dup(`
				SELECT id::text FROM public.vehicles
				WHERE id <> $1::uuid AND deleted_at IS NULL
				  AND (vin = $2 OR chasis = $3 OR motor = $4)`, vid, f.Vehicle.Vin, f.Vehicle.Chasis, f.Vehicle.Motor); err != nil {
				return nil, err
			} else {
				f.Duplicates.VinVehicleIDs = ids
			}
		}
		if ins.PolicyNumber != nil {
			if ids, err := dup(`
				SELECT vehicle_id::text FROM public.vehicle_insurance_policies
				WHERE policy_number = $1 AND is_current = TRUE AND vehicle_id <> $2::uuid
				  AND deleted_at IS NULL`, *ins.PolicyNumber, vid); err != nil {
				return nil, err
			} else {
				f.Duplicates.PolicyVehicleIDs = ids
			}
		}
	}
	return f, nil
}

func collectDuplicateIDs(rows pgx.Rows) ([]string, error) {
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

// ---------- evaluaciones (ComplianceService) ----------

func (s *Service) evaluate(ctx context.Context, driverID, vehicleID, serviceCode, scope, evaluatedBy string) (*Evaluation, error) {
	today := TodayNicaragua()
	// Reglas, hechos y señales se leen en un solo snapshot RepeatableRead: la
	// decisión y las generaciones registradas corresponden exactamente a los
	// datos evaluados, aunque otra tx los cambie durante la evaluación.
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rctx, err := loadRuleContext(ctx, tx, today)
	if err != nil {
		return nil, err
	}
	facts, err := loadFactsWithQuerier(ctx, tx, driverID, vehicleID, serviceCode, today)
	if err != nil {
		return nil, err
	}
	var inputGenerations map[string]int64
	if facts.Driver != nil {
		keys := signalKeysForFacts(facts.Driver.ID, facts)
		if err := seedComplianceSignals(ctx, tx, keys); err != nil {
			return nil, err
		}
		if inputGenerations, err = loadSignalGenerations(ctx, tx, keys); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	reasons := EvaluateFacts(*facts, rctx)
	if scope == "vehicle" {
		filtered := reasons[:0]
		for _, r := range reasons {
			if strings.HasPrefix(r.Code, "LICENSE_") || strings.HasPrefix(r.Code, "DRIVER_") ||
				r.Code == "VEHICLE_DRIVER_MISMATCH" {
				continue
			}
			filtered = append(filtered, r)
		}
		reasons = filtered
	}
	allowed, status := SummarizeEvaluation(reasons, scope)
	ev := &Evaluation{
		Allowed: allowed, Status: status, Reasons: reasons,
		EvaluatedAt: time.Now().Format(time.RFC3339), RulesVersion: RulesVersion,
		ServiceCode:  facts.ServiceCode,
		NicaraguaDay: today, InputGenerations: inputGenerations,
	}
	if facts.Driver != nil {
		ev.DriverID = &facts.Driver.ID
	}
	if facts.Vehicle != nil {
		ev.VehicleID = &facts.Vehicle.ID
	}
	s.persistEvaluation(ctx, ev, scope, evaluatedBy)
	s.refreshSnapshots(ctx, facts, rctx)
	return ev, nil
}

func (s *Service) CanDriverOperate(ctx context.Context, uid, evaluatedBy string) (*Evaluation, error) {
	return s.evaluate(ctx, uid, "", "", "driver", evaluatedBy)
}

func (s *Service) CanVehicleOperate(ctx context.Context, vehicleID, evaluatedBy string) (*Evaluation, error) {
	return s.evaluate(ctx, vehicleID, vehicleID, "", "vehicle", evaluatedBy)
}

func (s *Service) CanDriverOperateVehicle(ctx context.Context, uid, vehicleID, serviceCode, evaluatedBy string) (*Evaluation, error) {
	return s.evaluate(ctx, uid, vehicleID, serviceCode, "pair", evaluatedBy)
}

// persistEvaluation — compliance_evaluations + compliance_events 'evaluated'.
// Fallos no rompen la decisión (auditoría, igual que v1).
func (s *Service) persistEvaluation(ctx context.Context, ev *Evaluation, evalType, evaluatedBy string) {
	reasonsJSON, _ := json.Marshal(ev.Reasons)
	var evalID string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO public.compliance_evaluations
			(driver_id, vehicle_id, service_code, evaluation_type, allowed, status, reasons, rules_version, evaluated_by)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id::text`,
		ev.DriverID, ev.VehicleID, ev.ServiceCode, evalType, ev.Allowed, ev.Status,
		string(reasonsJSON), ev.RulesVersion, evaluatedBy).Scan(&evalID)
	if err != nil {
		return
	}
	blocking := []string{}
	for _, r := range ev.Reasons {
		if r.Blocking && r.Status != StatusPass {
			blocking = append(blocking, r.Code)
		}
	}
	payload, _ := json.Marshal(map[string]any{
		"allowed": ev.Allowed, "status": ev.Status, "blockingCodes": blocking,
	})
	role := "admin"
	if evaluatedBy == "system" || evaluatedBy == "scheduled" {
		role = "system"
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO public.compliance_events
			(entity_table, entity_id, driver_id, vehicle_id, event, actor_uid, actor_role, payload)
		VALUES ('compliance_evaluations', $1::uuid, $2::uuid, $3::uuid, 'evaluated', $4, $5, $6)`,
		evalID, ev.DriverID, ev.VehicleID, evaluatedBy, role, string(payload))
}

// refreshSnapshots — recomputa drivers/vehicles.compliance_status (scopes
// driver y vehicle respectivamente, igual que refreshSnapshots de v1).
func (s *Service) refreshSnapshots(ctx context.Context, facts *Facts, rctx *RuleContext) {
	if facts.Driver != nil {
		df := Facts{Driver: facts.Driver, License: facts.License, Duplicates: DuplicateFacts{
			LicenseNumberDriverIDs: facts.Duplicates.LicenseNumberDriverIDs,
		}}
		dreasons := EvaluateFacts(df, rctx)
		_, dstatus := SummarizeEvaluation(dreasons, "driver")
		_, _ = s.pool.Exec(ctx, `
			UPDATE public.drivers SET compliance_status = $2::public.driver_compliance_status
			WHERE id = $1::uuid`, facts.Driver.ID, dstatus)
	}
	if facts.Vehicle != nil {
		vreasons := []Reason{}
		for _, r := range EvaluateFacts(*facts, rctx) {
			if strings.HasPrefix(r.Code, "LICENSE_") || strings.HasPrefix(r.Code, "DRIVER_") {
				continue
			}
			vreasons = append(vreasons, r)
		}
		_, vstatus := SummarizeEvaluation(vreasons, "vehicle")
		_, _ = s.pool.Exec(ctx, `
			UPDATE public.vehicles SET compliance_status = $2::public.vehicle_compliance_status
			WHERE id = $1::uuid`, facts.Vehicle.ID, vstatus)
	}
}

// ReevaluateAfterChange — reevalúa conductor (y par si hay vehículo) tras
// submit/review, igual que reevaluateAfterChange de v1.
func (s *Service) ReevaluateAfterChange(ctx context.Context, driverUUID, vehicleID, actorUID string) {
	if _, err := s.CanDriverOperate(ctx, driverUUID, actorUID); err != nil {
		return
	}
	if vehicleID != "" {
		_, _ = s.CanDriverOperateVehicle(ctx, driverUUID, vehicleID, "", actorUID)
	}
}

// ScheduledSweep — equivalente a complianceDailyEvaluation de v1 (cron 3am):
// reevalúa TODOS los conductores activos (scope driver + par por vehículo)
// con evaluatedBy='scheduled'. Fallos individuales no detienen el barrido.
func (s *Service) ScheduledSweep(ctx context.Context) (evaluated, errs int) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text FROM public.drivers WHERE account_status = 'active'`)
	if err != nil {
		return 0, 1
	}
	var driverIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			driverIDs = append(driverIDs, id)
		}
	}
	rows.Close()

	for _, id := range driverIDs {
		if _, err := s.CanDriverOperate(ctx, id, "scheduled"); err != nil {
			errs++
			continue
		}
		evaluated++
		// Par por cada vehículo activo del conductor (como v1).
		vrows, err := s.pool.Query(ctx, `
			SELECT id::text FROM public.vehicles WHERE driver_id = $1::uuid AND is_active = TRUE`, id)
		if err != nil {
			continue
		}
		var vids []string
		for vrows.Next() {
			var v string
			if err := vrows.Scan(&v); err == nil {
				vids = append(vids, v)
			}
		}
		vrows.Close()
		for _, vid := range vids {
			_, _ = s.CanDriverOperateVehicle(ctx, id, vid, "", "scheduled")
		}
	}
	return evaluated, errs
}

// ---------- submitNewCurrent (DocumentsRepository) ----------

// submitNewCurrent — inserta doc nuevo como vigente ('pending'/'self_declared'
// /is_current); el vigente previo pasa a is_current=false enlazado vía
// supersedes_id (port de DocumentsRepository.submitNewCurrent). Todo en la TX.
// extraWhere filtra cuál fila cuenta como "vigente" (p.ej. coverage_type,
// tax_year). casts: columna → cast explícito ('public.license_type', etc.).
func (s *Service) submitNewCurrent(ctx context.Context, tx pgx.Tx, table, ownerField, ownerID string,
	data map[string]any, extraWhere map[string]any, casts map[string]string) (string, error) {

	where := fmt.Sprintf("%s = $1::uuid AND is_current = TRUE AND deleted_at IS NULL", ownerField)
	args := []any{ownerID}
	if len(extraWhere) > 0 {
		keys := make([]string, 0, len(extraWhere))
		for k := range extraWhere {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for i, k := range keys {
			where += fmt.Sprintf(" AND %s = $%d", k, i+2)
			args = append(args, extraWhere[k])
		}
	}
	var prevID *string
	_ = tx.QueryRow(ctx, fmt.Sprintf(
		`SELECT id::text FROM public.%s WHERE %s ORDER BY created_at DESC LIMIT 1`, table, where),
		args...).Scan(&prevID)

	dataKeys := make([]string, 0, len(data))
	for k := range data {
		dataKeys = append(dataKeys, k)
	}
	sort.Strings(dataKeys)

	cols := []string{ownerField, "status", "verification_method", "is_current"}
	vals := []any{ownerID}
	ph := []string{"$1", "'pending'::public.document_status", "'self_declared'::public.verification_method", "TRUE"}
	for i, k := range dataKeys {
		cols = append(cols, k)
		vals = append(vals, data[k])
		p := fmt.Sprintf("$%d", i+2)
		if c, ok := casts[k]; ok {
			p += "::" + c
		}
		ph = append(ph, p)
	}
	cols = append(cols, "supersedes_id")
	vals = append(vals, prevID)
	ph = append(ph, fmt.Sprintf("$%d", len(dataKeys)+2))

	var newID string
	err := tx.QueryRow(ctx, fmt.Sprintf(
		`INSERT INTO public.%s (%s) VALUES (%s) RETURNING id::text`,
		table, joinCols(cols), joinPh(ph)), vals...).Scan(&newID)
	if err != nil {
		return "", fmt.Errorf("%s insert: %w", table, err)
	}
	if prevID != nil {
		if _, err := tx.Exec(ctx, fmt.Sprintf(
			`UPDATE public.%s SET is_current = FALSE WHERE id = $1::uuid`, table), *prevID); err != nil {
			return "", err
		}
	}
	return newID, nil
}

// logEvent — compliance_events append-only (igual que documentsRepository.logEvent).
func (s *Service) logEvent(ctx context.Context, tx pgx.Tx, table, entityID string,
	driverID, vehicleID *string, event, actorUID, actorRole string, payload map[string]any) error {
	b, _ := json.Marshal(payload)
	_, err := tx.Exec(ctx, `
		INSERT INTO public.compliance_events
			(entity_table, entity_id, driver_id, vehicle_id, event, actor_uid, actor_role, payload)
		VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8)`,
		table, entityID, driverID, vehicleID, event, actorUID, actorRole, string(b))
	return err
}

func nilIf(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func keysOf(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func joinCols(c []string) string {
	s := ""
	for i, x := range c {
		if i > 0 {
			s += ", "
		}
		s += x
	}
	return s
}

func joinPh(p []string) string {
	s := ""
	for i, x := range p {
		if i > 0 {
			s += ", "
		}
		s += x
	}
	return s
}
