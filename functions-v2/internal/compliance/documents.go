// Documentos — carga, consulta y revisión (port de api/compliance.ts v1).
// submitNewCurrent mantiene el historial (supersedes); sync legacy a columnas
// drivers.license_*/vehicles.* en la misma TX; reevalúa al final.
package compliance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/notifications"
)

const signTTL = 15 * time.Minute

var licenseTypes = map[string]bool{
	"ordinaria": true, "profesional": true, "menor_de_edad": true,
	"especial": true, "permiso": true,
}

var coverageTypes = map[string]bool{
	"rc_obligatorio": true, "pasajeros": true, "danios_propios": true,
	"licencia_conductor": true, "otro": true,
}

var checkResults = map[string]bool{"approved": true, "rejected": true, "conditional": true}

// ---------- inputs ----------

type LicenseInput struct {
	LicenseNumber string   `json:"licenseNumber"`
	LicenseType   string   `json:"licenseType"`
	Categories    []string `json:"categories"`
	IssueDate     string   `json:"issueDate"`
	ExpiryDate    string   `json:"expiryDate"`
	PhotoFront    string   `json:"photoFront"` // objectPath GCS
	PhotoBack     string   `json:"photoBack"`
}

type VehicleDocInput struct {
	VehicleID    string `json:"vehicleId"`
	DocumentType string `json:"documentType"`
	DocumentPath string `json:"documentPath"`
	DocumentBack string `json:"documentPathBack"`

	// circulation_card
	CardNumber         string `json:"cardNumber"`
	IssuedAt           string `json:"issuedAt"`
	DeclaredValidUntil string `json:"declaredValidUntil"`
	// insurance
	PolicyNumber     string `json:"policyNumber"`
	InsurerCode      string `json:"insurerCode"`
	InsurerName      string `json:"insurerName"`
	CoverageType     string `json:"coverageType"`
	EffectiveFrom    string `json:"effectiveFrom"`
	EffectiveUntil   string `json:"effectiveUntil"`
	InsuredPlate     string `json:"insuredPlate"`
	InsuredVin       string `json:"insuredVin"`
	InsuredMotor     string `json:"insuredMotor"`
	InsuredChasis    string `json:"insuredChasis"`
	PolicyholderName string `json:"policyholderName"`
	// inspection / emissions
	InspectedAt       string `json:"inspectedAt"`
	TestedAt          string `json:"testedAt"`
	Result            string `json:"result"`
	CertificateNumber string `json:"certificateNumber"`
	ValidUntil        string `json:"validUntil"`
	Issuer            string `json:"issuer"`
	// road_tax
	TaxYear       *int   `json:"taxYear"`
	Municipality  string `json:"municipality"`
	PaidAt        string `json:"paidAt"`
	ReceiptNumber string `json:"receiptNumber"`
	Exempt        *bool  `json:"exempt"`
	ExemptReason  string `json:"exemptReason"`
	// revisado
	StickerYear *int `json:"stickerYear"`
}

type ReviewInput struct {
	DocumentTable   string `json:"documentTable"`
	DocumentID      string `json:"documentId"`
	Action          string `json:"action"` // approve|reject|request_review
	RejectionReason string `json:"rejectionReason"`
	ReviewNotes     string `json:"reviewNotes"`
}

// ---------- helpers ----------

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func dateOrNil(s string) any {
	if s == "" {
		return nil
	}
	return s // 'YYYY-MM-DD' — Postgres castea a DATE
}

func (s *Service) signDoc(ctx context.Context, doc map[string]any) {
	if s.sign == nil {
		return
	}
	for k, out := range map[string]string{
		"document_path": "documentUrl", "document_path_back": "documentUrlBack",
	} {
		if p, ok := doc[k].(string); ok && p != "" {
			if url, err := s.sign.SignURL(p, signTTL); err == nil {
				doc[out] = url
			}
		}
	}
}

// queryDocs — SELECT to_jsonb: Postgres formatea tipos (DATE 'YYYY-MM-DD',
// TIMESTAMPTZ ISO, UUID texto, NUMERIC) sin mapeo manual por OID.
func (s *Service) queryDocs(ctx context.Context, table, where string, args ...any) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, fmt.Sprintf(
		`SELECT to_jsonb(t) FROM public.%s t WHERE %s`, table, where), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		m := map[string]any{}
		if err := json.Unmarshal(b, &m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func ownerFieldFor(table string) string {
	if table == "driver_licenses" {
		return "driver_id"
	}
	return "vehicle_id"
}

func (s *Service) signDocs(ctx context.Context, docs []map[string]any) {
	for _, d := range docs {
		s.signDoc(ctx, d)
	}
}

// ---------- driver: submissions ----------

// SubmitDriverLicense — submitDriverLicense de v1. Dual-write legacy
// drivers.license_* en la misma TX; reevalúa tras commit.
func (s *Service) SubmitDriverLicense(ctx context.Context, uid string, in LicenseInput) (string, error) {
	dID, _, found, err := s.driverRow(ctx, uid)
	if err != nil {
		return "", err
	}
	if !found {
		return "", apperr.New(404, "Perfil de conductor no encontrado")
	}
	lt := in.LicenseType
	if lt == "" {
		lt = "ordinaria"
	}
	if !licenseTypes[lt] {
		return "", apperr.New(400, "licenseType inválido")
	}
	cats := in.Categories
	if cats == nil {
		cats = []string{}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	newID, err := s.submitNewCurrent(ctx, tx, "driver_licenses", "driver_id", dID,
		map[string]any{
			"license_number":     nilIfEmpty(in.LicenseNumber),
			"license_type":       lt,
			"categories":         cats,
			"issue_date":         dateOrNil(toDateOnly(in.IssueDate)),
			"expiry_date":        dateOrNil(toDateOnly(in.ExpiryDate)),
			"document_path":      nilIfEmpty(in.PhotoFront),
			"document_path_back": nilIfEmpty(in.PhotoBack),
		}, nil, map[string]string{"license_type": "public.license_type"})
	if err != nil {
		return "", err
	}
	// Compat legacy (v1: COALESCE — no borra fotos previas si no se envían).
	if _, err := tx.Exec(ctx, `
		UPDATE public.drivers SET
			license_number = $2,
			license_expiry = COALESCE($3, license_expiry),
			license_photo_front = COALESCE($4, license_photo_front),
			license_photo_back = COALESCE($5, license_photo_back)
		WHERE id = $1::uuid`,
		dID, nilIfEmpty(in.LicenseNumber), dateOrNil(toDateOnly(in.ExpiryDate)),
		nilIfEmpty(in.PhotoFront), nilIfEmpty(in.PhotoBack)); err != nil {
		return "", err
	}
	if err := s.logEvent(ctx, tx, "driver_licenses", newID, &dID, nil, "submitted", uid, "driver",
		map[string]any{"licenseNumber": in.LicenseNumber, "expiryDate": toDateOnly(in.ExpiryDate)}); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	s.ReevaluateAfterChange(ctx, dID, "", uid)
	return newID, nil
}

type vehicleRow struct {
	ID, DriverID, Plate             string
	Vin, Chasis, Motor, ServiceType *string
}

func (s *Service) vehicleForDriver(ctx context.Context, vehicleID, driverUUID string) (*vehicleRow, error) {
	v := &vehicleRow{}
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, driver_id::text, plate, vin, chasis, motor, service_type
		FROM public.vehicles WHERE id = $1::uuid AND deleted_at IS NULL`, vehicleID).
		Scan(&v.ID, &v.DriverID, &v.Plate, &v.Vin, &v.Chasis, &v.Motor, &v.ServiceType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "Vehículo no encontrado")
	}
	if err != nil {
		return nil, err
	}
	if v.DriverID != driverUUID {
		return nil, apperr.New(403, "El vehículo no pertenece a este conductor")
	}
	return v, nil
}

// SubmitVehicleDocument — submitVehicleDocument de v1 (6 tipos, sync legacy).
func (s *Service) SubmitVehicleDocument(ctx context.Context, uid string, in VehicleDocInput) (string, error) {
	dID, _, found, err := s.driverRow(ctx, uid)
	if err != nil {
		return "", err
	}
	if !found {
		return "", apperr.New(404, "Perfil de conductor no encontrado")
	}
	v, err := s.vehicleForDriver(ctx, in.VehicleID, dID)
	if err != nil {
		return "", err
	}
	table, ok := vehicleDocTableByType[in.DocumentType]
	if !ok {
		return "", apperr.New(400, "Tipo de documento inválido: "+in.DocumentType)
	}

	var data map[string]any
	var extraWhere map[string]any
	var casts map[string]string
	var legacySQL string
	var legacyArgs []any

	switch in.DocumentType {
	case "circulation_card":
		data = map[string]any{
			"card_number":           nilIfEmpty(in.CardNumber),
			"issued_at":             dateOrNil(toDateOnly(in.IssuedAt)),
			"declared_valid_until":  dateOrNil(toDateOnly(in.DeclaredValidUntil)),
			"declared_plate":        v.Plate,
			"declared_vin":          v.Vin,
			"declared_chasis":       v.Chasis,
			"declared_motor":        v.Motor,
			"declared_service_type": v.ServiceType,
			"document_path":         nilIfEmpty(in.DocumentPath),
			"document_path_back":    nilIfEmpty(in.DocumentBack),
		}
		legacySQL = `UPDATE public.vehicles SET
			registration_number = COALESCE($2, registration_number),
			emission_date = COALESCE($3, emission_date),
			registration_expiry = COALESCE($4, registration_expiry),
			registration_photo_front = COALESCE($5, registration_photo_front),
			registration_photo_back = COALESCE($6, registration_photo_back)
			WHERE id = $1::uuid`
		legacyArgs = []any{v.ID, nilIfEmpty(in.CardNumber), dateOrNil(toDateOnly(in.IssuedAt)),
			dateOrNil(toDateOnly(in.DeclaredValidUntil)), nilIfEmpty(in.DocumentPath), nilIfEmpty(in.DocumentBack)}

	case "insurance":
		ct := in.CoverageType
		if ct == "" {
			ct = "rc_obligatorio"
		}
		if !coverageTypes[ct] {
			return "", apperr.New(400, "coverageType inválido")
		}
		data = map[string]any{
			"policy_number":     nilIfEmpty(in.PolicyNumber),
			"insurer_code":      nilIfEmpty(in.InsurerCode),
			"insurer_name":      nilIfEmpty(in.InsurerName),
			"coverage_type":     ct,
			"effective_from":    dateOrNil(toDateOnly(in.EffectiveFrom)),
			"effective_until":   dateOrNil(toDateOnly(in.EffectiveUntil)),
			"insured_plate":     coalesceStr(in.InsuredPlate, v.Plate),
			"insured_vin":       coalescePtrStr(in.InsuredVin, v.Vin),
			"insured_motor":     coalescePtrStr(in.InsuredMotor, v.Motor),
			"insured_chasis":    coalescePtrStr(in.InsuredChasis, v.Chasis),
			"policyholder_name": nilIfEmpty(in.PolicyholderName),
			"document_path":     nilIfEmpty(in.DocumentPath),
		}
		extraWhere = map[string]any{"coverage_type": ct}
		casts = map[string]string{"coverage_type": "public.insurance_coverage_type"}
		if ct == "rc_obligatorio" {
			legacySQL = `UPDATE public.vehicles SET
				insurance_number = COALESCE($2, insurance_number),
				insurance_company = COALESCE($3, insurance_company),
				insurance_start_date = COALESCE($4, insurance_start_date),
				insurance_expiry = COALESCE($5, insurance_expiry),
				insurance_photo = COALESCE($6, insurance_photo)
				WHERE id = $1::uuid`
			legacyArgs = []any{v.ID, nilIfEmpty(in.PolicyNumber), nilIfEmpty(in.InsurerName),
				dateOrNil(toDateOnly(in.EffectiveFrom)), dateOrNil(toDateOnly(in.EffectiveUntil)),
				nilIfEmpty(in.DocumentPath)}
		}

	case "inspection", "emissions":
		if in.Result != "" && !checkResults[in.Result] {
			return "", apperr.New(400, "result inválido")
		}
		atCol, atVal := "inspected_at", in.InspectedAt
		if in.DocumentType == "emissions" {
			atCol, atVal = "tested_at", in.TestedAt
		}
		data = map[string]any{
			atCol:                dateOrNil(toDateOnly(atVal)),
			"result":             nilIfEmpty(in.Result),
			"certificate_number": nilIfEmpty(in.CertificateNumber),
			"valid_until":        dateOrNil(toDateOnly(in.ValidUntil)),
			"issuer":             nilIfEmpty(in.Issuer),
			"document_path":      nilIfEmpty(in.DocumentPath),
		}
		if in.Result != "" {
			casts = map[string]string{"result": "public.document_check_result"}
		}

	case "road_tax":
		year := yearOf(TodayNicaragua())
		if in.TaxYear != nil {
			year = *in.TaxYear
		}
		exempt := false
		if in.Exempt != nil {
			exempt = *in.Exempt
		}
		data = map[string]any{
			"tax_year":       year,
			"municipality":   nilIfEmpty(in.Municipality),
			"paid_at":        dateOrNil(toDateOnly(in.PaidAt)),
			"receipt_number": nilIfEmpty(in.ReceiptNumber),
			"exempt":         exempt,
			"exempt_reason":  nilIfEmpty(in.ExemptReason),
			"document_path":  nilIfEmpty(in.DocumentPath),
		}
		extraWhere = map[string]any{"tax_year": year}

	case "revisado":
		data = map[string]any{
			"sticker_year":  in.StickerYear,
			"issued_at":     dateOrNil(toDateOnly(in.IssuedAt)),
			"valid_until":   dateOrNil(toDateOnly(in.ValidUntil)),
			"document_path": nilIfEmpty(in.DocumentPath),
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	newID, err := s.submitNewCurrent(ctx, tx, table, "vehicle_id", v.ID, data, extraWhere, casts)
	if err != nil {
		return "", err
	}
	if legacySQL != "" {
		if _, err := tx.Exec(ctx, legacySQL, legacyArgs...); err != nil {
			return "", err
		}
	}
	if err := s.logEvent(ctx, tx, table, newID, &dID, &v.ID, "submitted", uid, "driver",
		map[string]any{"documentType": in.DocumentType}); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	s.ReevaluateAfterChange(ctx, dID, v.ID, uid)
	return newID, nil
}

// ---------- driver: consulta ----------

// GetMyDocuments — getMyDocuments de v1 (licencias + docs por vehículo +
// alertas abiertas + evaluaciones recientes + snapshot, paths firmados).
func (s *Service) GetMyDocuments(ctx context.Context, uid string) (map[string]any, error) {
	dID, _, found, err := s.driverRow(ctx, uid)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, apperr.New(404, "Perfil de conductor no encontrado")
	}

	licenses, err := s.queryDocs(ctx, "driver_licenses",
		"driver_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC", dID)
	if err != nil {
		return nil, err
	}

	vehs, err := s.queryDocs(ctx, "vehicles",
		"driver_id = $1::uuid AND deleted_at IS NULL ORDER BY created_at ASC", dID)
	if err != nil {
		return nil, err
	}
	vehicleOut := make([]map[string]any, 0, len(vehs))
	for _, veh := range vehs {
		vid, _ := veh["id"].(string)
		docs := map[string]any{}
		for _, t := range vehicleDocTables {
			rows, err := s.queryDocs(ctx, t,
				"vehicle_id = $1::uuid AND is_current = TRUE AND deleted_at IS NULL ORDER BY created_at DESC", vid)
			if err != nil {
				return nil, err
			}
			s.signDocs(ctx, rows)
			docs[t] = rows
		}
		vehicleOut = append(vehicleOut, map[string]any{
			"id": vid, "plate": veh["plate"], "isActive": veh["is_active"],
			"complianceStatus": veh["compliance_status"], "documents": docs,
		})
	}
	s.signDocs(ctx, licenses)

	alerts, err := s.openAlerts(ctx, dID)
	if err != nil {
		return nil, err
	}
	evals, err := s.queryDocs(ctx, "compliance_evaluations",
		"driver_id = $1::uuid ORDER BY evaluated_at DESC LIMIT 3", dID)
	if err != nil {
		return nil, err
	}
	var complianceStatus *string
	_ = s.pool.QueryRow(ctx,
		`SELECT compliance_status::text FROM public.drivers WHERE id = $1::uuid`, dID).Scan(&complianceStatus)

	return map[string]any{
		"licenses":          licenses,
		"vehicles":          vehicleOut,
		"alerts":            alerts,
		"recentEvaluations": evals,
		"complianceStatus":  complianceStatus,
	}, nil
}

// GetComplianceStatus — getComplianceStatus de v1.
func (s *Service) GetComplianceStatus(ctx context.Context, uid string) (map[string]any, error) {
	dID, _, found, err := s.driverRow(ctx, uid)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, apperr.New(404, "Perfil de conductor no encontrado")
	}
	var acct, comp *string
	if err := s.pool.QueryRow(ctx, `
		SELECT account_status::text, compliance_status::text
		FROM public.drivers WHERE id = $1::uuid`, dID).Scan(&acct, &comp); err != nil {
		return nil, err
	}

	driverEval, err := s.CanDriverOperate(ctx, dID, uid)
	if err != nil {
		return nil, err
	}
	var activeVehicle map[string]any
	var vid, plate string
	var vcomp *string
	if err := s.pool.QueryRow(ctx, `
		SELECT id::text, plate, compliance_status::text FROM public.vehicles
		WHERE driver_id = $1::uuid AND is_active = TRUE AND deleted_at IS NULL
		ORDER BY updated_at DESC LIMIT 1`, dID).Scan(&vid, &plate, &vcomp); err == nil {
		activeVehicle = map[string]any{"id": vid, "plate": plate, "complianceStatus": vcomp}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	eval := driverEval
	if activeVehicle != nil {
		if pairEval, err := s.CanDriverOperateVehicle(ctx, dID, vid, "", uid); err == nil {
			eval = pairEval
		}
	}
	alerts, err := s.openAlerts(ctx, dID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"driver":        map[string]any{"id": dID, "accountStatus": acct, "complianceStatus": comp},
		"evaluation":    eval,
		"activeVehicle": activeVehicle,
		"alerts":        alerts,
	}, nil
}

func (s *Service) openAlerts(ctx context.Context, driverUUID string) ([]map[string]any, error) {
	return s.queryDocs(ctx, "document_alerts",
		"driver_id = $1::uuid AND status = 'open' ORDER BY created_at DESC", driverUUID)
}

// AcknowledgeAlert — acknowledgeDocumentAlert de v1 (owner check).
func (s *Service) AcknowledgeAlert(ctx context.Context, uid, alertID string) error {
	dID, _, found, err := s.driverRow(ctx, uid)
	if err != nil {
		return err
	}
	if !found {
		return apperr.New(404, "Perfil de conductor no encontrado")
	}
	var alertDriver *string
	if err := s.pool.QueryRow(ctx, `
		SELECT driver_id::text FROM public.document_alerts WHERE id = $1::uuid`, alertID).
		Scan(&alertDriver); errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(404, "Alerta no encontrada")
	} else if err != nil {
		return err
	}
	if alertDriver == nil || *alertDriver != dID {
		return apperr.New(403, "La alerta no pertenece a este conductor")
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE public.document_alerts SET status = 'acknowledged', updated_at = NOW()
		WHERE id = $1::uuid`, alertID)
	return err
}

// ---------- admin: revisión ----------

// ListForReview — listDocumentsForReview de v1: grupos por tabla, status en
// lista (default pending/in_review/requires_review), updated_at ASC, firmado.
func (s *Service) ListForReview(ctx context.Context, statuses []string, limit, offset int) ([]map[string]any, error) {
	if len(statuses) == 0 {
		statuses = []string{"pending", "in_review", "requires_review"}
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	tables := []string{"driver_licenses"}
	tables = append(tables, vehicleDocTables...)
	groups := []map[string]any{}
	for _, t := range tables {
		rows, err := s.queryDocs(ctx, t, fmt.Sprintf(
			`status = ANY($1::public.document_status[]) AND deleted_at IS NULL
			 ORDER BY updated_at ASC LIMIT %d OFFSET %d`, limit, offset), statuses)
		if err != nil {
			return nil, err
		}
		s.signDocs(ctx, rows)
		groups = append(groups, map[string]any{
			"table": t, "count": len(rows), "documents": rows,
		})
	}
	return groups, nil
}

// ReviewDocument — reviewDocument de v1: approve→verified / reject→rejected
// /request_review→requires_review; verified_by/method manual en todos;
// verified_at solo en approve|reject; alerta+push si reject|request_review.
func (s *Service) ReviewDocument(ctx context.Context, adminUID string, in ReviewInput) (string, error) {
	if !DocumentTables[in.DocumentTable] {
		return "", apperr.New(400, "Tabla de documento inválida")
	}
	var newStatus, event string
	switch in.Action {
	case "approve":
		newStatus, event = "verified", "verified"
	case "reject":
		newStatus, event = "rejected", "rejected"
		if in.RejectionReason == "" {
			in.RejectionReason = "Rechazado por el equipo de verificación"
		}
	case "request_review":
		newStatus, event = "requires_review", "review_requested"
	default:
		return "", apperr.New(400, "action inválida (approve|reject|request_review)")
	}

	ownerField := ownerFieldFor(in.DocumentTable)
	var prevStatus, ownerID string
	err := s.pool.QueryRow(ctx, fmt.Sprintf(`
		SELECT status::text, %s::text FROM public.%s
		WHERE id = $1::uuid AND deleted_at IS NULL`, ownerField, in.DocumentTable), in.DocumentID).
		Scan(&prevStatus, &ownerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.New(404, "Documento no encontrado")
	}
	if err != nil {
		return "", err
	}

	var driverID, vehicleID *string
	if ownerField == "driver_id" {
		driverID = &ownerID
	} else {
		vehicleID = &ownerID
		var d string
		if err := s.pool.QueryRow(ctx, `
			SELECT driver_id::text FROM public.vehicles WHERE id = $1::uuid`, ownerID).Scan(&d); err == nil {
			driverID = &d
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var rejReason any
	if in.Action == "reject" {
		rejReason = in.RejectionReason
	}
	var verifiedAt any
	if in.Action == "approve" || in.Action == "reject" {
		verifiedAt = time.Now()
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(`
		UPDATE public.%s SET
			status = $2::public.document_status,
			verified_at = $3,
			verified_by = $4,
			verification_method = 'manual'::public.verification_method,
			rejection_reason = $5,
			review_notes = $6,
			updated_at = NOW()
		WHERE id = $1::uuid`, in.DocumentTable),
		in.DocumentID, newStatus, verifiedAt, adminUID, rejReason, nilIfEmpty(in.ReviewNotes)); err != nil {
		return "", err
	}
	if err := s.logEvent(ctx, tx, in.DocumentTable, in.DocumentID, driverID, vehicleID,
		event, adminUID, "admin", map[string]any{
			"previousStatus": prevStatus, "rejectionReason": rejReason,
		}); err != nil {
		return "", err
	}
	if driverID != nil && (in.Action == "reject" || in.Action == "request_review") {
		alertType := "rejected"
		if in.Action == "request_review" {
			alertType = "requires_review"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO public.document_alerts
				(document_table, document_id, driver_id, vehicle_id, alert_type, status)
			VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, 'open')
			ON CONFLICT (document_table, document_id, alert_type, due_date) DO NOTHING`,
			in.DocumentTable, in.DocumentID, *driverID, vehicleID, alertType); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	// Push al conductor (best-effort, igual que v1).
	if driverID != nil && (in.Action == "reject" || in.Action == "request_review") && s.notify != nil {
		if userID, err := s.userIDOfDriver(ctx, *driverID); err == nil && userID != "" {
			body := "Un documento requiere revisión adicional."
			if in.Action == "reject" {
				body = "Un documento fue rechazado: " + in.RejectionReason
			}
			short := in.DocumentID
			if len(short) > 8 {
				short = short[:8]
			}
			_ = s.notify.Notify(ctx, userID, "", notifications.AdminNotice, notifications.NotifyOpts{
				Title: "Documento requiere atención",
				Body:  body,
				Key:   "doc-" + short,
				ExtraData: map[string]string{
					"type": "document_review", "documentTable": in.DocumentTable,
					"documentId": in.DocumentID,
					"alertType":  map[string]string{"reject": "rejected", "request_review": "requires_review"}[in.Action],
				},
			})
		}
	}
	if driverID != nil {
		vid := ""
		if vehicleID != nil {
			vid = *vehicleID
		}
		s.ReevaluateAfterChange(ctx, *driverID, vid, adminUID)
	}
	return newStatus, nil
}

func (s *Service) userIDOfDriver(ctx context.Context, driverUUID string) (string, error) {
	var uid string
	err := s.pool.QueryRow(ctx, `SELECT user_id FROM public.drivers WHERE id = $1::uuid`, driverUUID).Scan(&uid)
	return uid, err
}

// GetDocumentHistory — getDocumentHistory de v1: driver solo su historial;
// admin/operator cualquiera. Devuelve filas firmadas.
func (s *Service) GetDocumentHistory(ctx context.Context, uid, role, table, ownerID string) ([]map[string]any, error) {
	if !DocumentTables[table] {
		return nil, apperr.New(400, "Tabla de documento inválida")
	}
	isAdmin := role == "admin" || role == "operator"
	if !isAdmin {
		dID, _, found, err := s.driverRow(ctx, uid)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, apperr.New(404, "Perfil de conductor no encontrado")
		}
		if table == "driver_licenses" {
			if ownerID != dID {
				return nil, apperr.New(403, "Historial no pertenece a este conductor")
			}
		} else if _, err := s.vehicleForDriver(ctx, ownerID, dID); err != nil {
			return nil, err
		}
	}
	docs, err := s.queryDocs(ctx, table,
		ownerFieldFor(table)+" = $1::uuid AND deleted_at IS NULL ORDER BY created_at DESC", ownerID)
	if err != nil {
		return nil, err
	}
	s.signDocs(ctx, docs)
	return docs, nil
}

func coalesceStr(s, fallback string) any {
	if s != "" {
		return s
	}
	return fallback
}

func coalescePtrStr(s string, fallback *string) any {
	if s != "" {
		return s
	}
	return fallback
}
