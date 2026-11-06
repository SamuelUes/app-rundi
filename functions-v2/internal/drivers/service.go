// Package drivers — registro y ciclo de vida del conductor + vehículos.
// Autoridad SQL (doc §7: registro/aprobación/compliance). Cada mutación
// escribe audit_log (equivalente a logAuditEvent de v1) y evento Outbox
// para la proyección whitelist a DATA-MAIN_drivers / DATA-MAIN_vehicles.
// driver_id en paths/payloads = drivers.id (UUID interno); uid = Firebase UID.
package drivers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	firebase "firebase.google.com/go/v4"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/claims"
	"github.com/rundi/functions-v2/internal/outbox"
)

type Service struct {
	pool *pgxpool.Pool
	app  *firebase.App
}

func NewService(pool *pgxpool.Pool, app *firebase.App) *Service {
	return &Service{pool: pool, app: app}
}

func versionNow() float64 { return float64(time.Now().UnixMicro()) / 1000 }

// ---------- perfil de conductor ----------

type RegisterDriverInput struct {
	LicenseNumber     string  `json:"licenseNumber"`
	LicenseExpiry     string  `json:"licenseExpiry"` // YYYY-MM-DD
	ProfilePhoto      *string `json:"profilePhoto,omitempty"`
	LicensePhotoFront *string `json:"licensePhotoFront,omitempty"`
	LicensePhotoBack  *string `json:"licensePhotoBack,omitempty"`
	Department        *string `json:"department,omitempty"`
	Municipality      *string `json:"municipality,omitempty"`
}

// Register — createDriverProfile de v1: drivers(user_id=uid, account_status='pending').
func (s *Service) Register(ctx context.Context, uid string, in RegisterDriverInput, requestID string) (string, error) {
	if in.LicenseNumber == "" || in.LicenseExpiry == "" {
		return "", apperr.New(400, "licenseNumber and licenseExpiry are required")
	}
	if _, err := time.Parse("2006-01-02", in.LicenseExpiry); err != nil {
		return "", apperr.New(400, "licenseExpiry must be YYYY-MM-DD")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var driverID string
	err = tx.QueryRow(ctx, `
		INSERT INTO public.drivers
			(user_id, license_number, license_expiry, profile_photo,
			 license_photo_front, license_photo_back, department, municipality,
			 account_status)
		VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,'pending')
		RETURNING id::text`,
		uid, in.LicenseNumber, in.LicenseExpiry, in.ProfilePhoto,
		in.LicensePhotoFront, in.LicensePhotoBack, in.Department, in.Municipality,
	).Scan(&driverID)
	if err != nil {
		if isUniqueViolation(err) {
			return "", apperr.New(409, "driver profile already exists")
		}
		// FK users.id — el bootstrap de usuario debe correr antes.
		if isFKViolation(err) {
			return "", apperr.New(409, "user not registered — run /v1/users/bootstrap first")
		}
		return "", fmt.Errorf("drivers insert: %w", err)
	}

	if err := s.emitDriverEvent(ctx, tx, uid, "driver.registered", requestID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	// Un driver registrado necesita el claim para escribir drivers_live y leer
	// sus ofertas (reglas isDriver). Bootstrap ya lo re-synca, pero el registro
	// suele venir justo tras upgrade-to-driver sin refresh de token.
	claims.Ensure(ctx, s.app, uid, "driver")
	return driverID, nil
}

// driverEditable — campos editables por el propio conductor (NO account_status,
// documents_status, designated_role_status, earnings, rating, verified_at).
var driverEditable = map[string]string{
	"licenseNumber":     "license_number",
	"licenseExpiry":     "license_expiry",
	"profilePhoto":      "profile_photo",
	"licensePhotoFront": "license_photo_front",
	"licensePhotoBack":  "license_photo_back",
	"department":        "department",
	"municipality":      "municipality",
}

// PatchMe — updateDriverProfile: solo columnas no privilegiadas del propio driver.
func (s *Service) PatchMe(ctx context.Context, uid string, fields map[string]any, requestID string) error {
	sets := []string{}
	vals := []any{uid}
	i := 2
	for k, v := range fields {
		col, ok := driverEditable[k]
		if !ok {
			continue
		}
		if col == "license_expiry" {
			if str, ok := v.(string); ok {
				if _, err := time.Parse("2006-01-02", str); err != nil {
					return apperr.New(400, "licenseExpiry must be YYYY-MM-DD")
				}
			}
		}
		sets = append(sets, fmt.Sprintf("%s = $%d", col, i))
		vals = append(vals, v)
		i++
	}
	if len(sets) == 0 {
		return apperr.New(400, "no editable fields")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := fmt.Sprintf(`UPDATE public.drivers SET %s WHERE user_id = $1 AND deleted_at IS NULL`,
		joinStrings(sets))
	res, err := tx.Exec(ctx, q, vals...)
	if err != nil {
		return fmt.Errorf("drivers update: %w", err)
	}
	if res.RowsAffected() == 0 {
		return apperr.New(404, "driver profile not found")
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// GetMe — perfil completo del propio conductor (incluye campos sensibles).
func (s *Service) GetMe(ctx context.Context, uid string) (map[string]any, error) {
	var (
		id, accountStatus, docsStatus, designated string
		license, dept, muni, photo, lFront, lBack *string
		expiry, verifiedAt                        *time.Time
		totalRides                                int
		rating, earnings, balance                 float64
		createdAt, updatedAt                      time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, account_status::text, documents_status::text,
		       designated_role_status::text, license_number, license_expiry,
		       profile_photo, license_photo_front, license_photo_back,
		       department, municipality, verified_at, total_rides,
		       average_rating, total_earnings, current_recharge_balance,
		       created_at, updated_at
		FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL`, uid).
		Scan(&id, &accountStatus, &docsStatus, &designated, &license, &expiry,
			&photo, &lFront, &lBack, &dept, &muni, &verifiedAt, &totalRides,
			&rating, &earnings, &balance, &createdAt, &updatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "driver profile not found")
	}
	if err != nil {
		return nil, err
	}
	out := map[string]any{
		"id":                   id,
		"userId":               uid,
		"accountStatus":        accountStatus,
		"documentsStatus":      docsStatus,
		"designatedRoleStatus": designated,
		"totalRides":           totalRides,
		"averageRating":        rating,
		"totalEarnings":        earnings,
		"rechargeBalance":      balance,
		"createdAt":            createdAt,
		"updatedAt":            updatedAt,
	}
	if license != nil {
		out["licenseNumber"] = *license
	}
	if expiry != nil {
		out["licenseExpiry"] = expiry.Format("2006-01-02")
	}
	if photo != nil {
		out["profilePhoto"] = *photo
	}
	if lFront != nil {
		out["licensePhotoFront"] = *lFront
	}
	if lBack != nil {
		out["licensePhotoBack"] = *lBack
	}
	if dept != nil {
		out["department"] = *dept
	}
	if muni != nil {
		out["municipality"] = *muni
	}
	if verifiedAt != nil {
		out["verifiedAt"] = *verifiedAt
	}
	return out, nil
}

// ---------- servicios del conductor (driver_services) ----------

// AssignMyService — assignServiceToDriver: driver pide un servicio por code;
// queda is_active=true, is_approved=false (aprobación es admin-only).
func (s *Service) AssignMyService(ctx context.Context, uid, serviceCode string, requestID string) error {
	if serviceCode == "" {
		return apperr.New(400, "serviceCode is required")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO public.driver_services (driver_id, service_id, is_active, is_approved)
		SELECT d.id, s.id, TRUE, FALSE
		FROM public.drivers d, public.services s
		WHERE d.user_id = $1 AND d.deleted_at IS NULL
		  AND s.code = $2 AND s.is_active = TRUE
		ON CONFLICT (driver_id, service_id) DO UPDATE SET is_active = TRUE
		RETURNING id::text`, uid, serviceCode).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(404, "driver profile or active service not found")
	}
	if err != nil {
		return fmt.Errorf("driver_services assign: %w", err)
	}
	// La aprobación cambia qué ve el matching (activeServiceCodes) → re-proyecta driver.
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.service_assigned", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListMyServices — servicios del conductor vía vista driver_active_services +
// pendientes (misma data que getDriverServices de v1).
func (s *Service) ListMyServices(ctx context.Context, uid string) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT ds.id::text, s.code, s.name, ds.is_active, ds.is_approved,
		       ds.custom_commission_rate, ds.approved_at, ds.assigned_at
		FROM public.driver_services ds
		JOIN public.drivers d ON d.id = ds.driver_id
		JOIN public.services s ON s.id = ds.service_id
		WHERE d.user_id = $1 AND d.deleted_at IS NULL
		ORDER BY ds.assigned_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, code, name string
		var active, approved bool
		var customRate *float64
		var approvedAt, assignedAt *time.Time
		if err := rows.Scan(&id, &code, &name, &active, &approved, &customRate, &approvedAt, &assignedAt); err != nil {
			return nil, err
		}
		m := map[string]any{
			"id": id, "serviceCode": code, "serviceName": name,
			"isActive": active, "isApproved": approved,
		}
		if customRate != nil {
			m["customCommissionRate"] = *customRate
		}
		if approvedAt != nil {
			m["approvedAt"] = *approvedAt
		}
		if assignedAt != nil {
			m["assignedAt"] = *assignedAt
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// DeactivateMyDriverService — deactivateDriverService (owner): is_active=false.
// La aprobación/aprobador no se tocan desde el cliente.
func (s *Service) DeactivateMyDriverService(ctx context.Context, uid, driverServiceID string, requestID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	res, err := tx.Exec(ctx, `
		UPDATE public.driver_services ds
		SET is_active = FALSE
		FROM public.drivers d
		WHERE ds.id = $1::uuid AND d.id = ds.driver_id AND d.user_id = $2`,
		driverServiceID, uid)
	if err != nil {
		return fmt.Errorf("driver_services deactivate: %w", err)
	}
	if res.RowsAffected() == 0 {
		return apperr.New(404, "driver service not found")
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.service_deactivated", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------- admin: aprobación de servicios y estado de cuenta ----------

// ApproveDriverService — approveDriverService de v1 (admin-only):
// is_approved=true, approved_at, approved_by=adminUID.
func (s *Service) ApproveDriverService(ctx context.Context, adminUID, driverServiceID, requestID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var driverUID string
	err = tx.QueryRow(ctx, `
		UPDATE public.driver_services ds
		SET is_approved = TRUE, approved_at = NOW(), approved_by = $2
		FROM public.drivers d
		WHERE ds.id = $1::uuid AND d.id = ds.driver_id
		RETURNING d.user_id`, driverServiceID, adminUID).Scan(&driverUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(404, "driver service not found")
	}
	if err != nil {
		return fmt.Errorf("driver_services approve: %w", err)
	}
	if err := s.audit(ctx, tx, adminUID, "admin", "update", "driver_service",
		driverServiceID, map[string]any{"after": map[string]any{"is_approved": true}}); err != nil {
		return err
	}
	if err := s.emitDriverEvent(ctx, tx, driverUID, "driver.service_approved", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

var validAccountStatuses = map[string]bool{
	"pending": true, "active": true, "suspended": true, "rejected": true,
}

// SetAccountStatus — changeDriverStatus/verifyDriver/rejectDriver/suspendDriver
// de v1: UPDATE account_status (+verified_at si 'active') + audit_log con
// before/after + outbox driver.upserted.
func (s *Service) SetAccountStatus(ctx context.Context, adminUID, driverID, status, reason, requestID string) error {
	if !validAccountStatuses[status] {
		return apperr.New(400, "status must be pending|active|suspended|rejected")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var prev, driverUID string
	err = tx.QueryRow(ctx, `
		SELECT account_status::text, user_id FROM public.drivers
		WHERE id = $1::uuid AND deleted_at IS NULL
		FOR UPDATE`, driverID).Scan(&prev, &driverUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(404, "driver not found")
	}
	if err != nil {
		return err
	}
	if prev == status {
		return nil // idempotente
	}

	if _, err := tx.Exec(ctx, `
		UPDATE public.drivers
		SET account_status = $2::public.driver_account_status,
		    verified_at = CASE WHEN $2 = 'active' THEN NOW() ELSE verified_at END
		WHERE id = $1::uuid`, driverID, status); err != nil {
		return fmt.Errorf("drivers status: %w", err)
	}

	if err := s.audit(ctx, tx, adminUID, "admin", "update", "driver", driverID,
		map[string]any{
			"before": map[string]any{"account_status": prev},
			"after":  map[string]any{"account_status": status, "reason": reason},
		}); err != nil {
		return err
	}
	if err := s.emitDriverEvent(ctx, tx, driverUID, "driver.account_status_changed", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------- vehículos ----------

type VehicleInput struct {
	Plate               string   `json:"plate"`
	Brand               *string  `json:"brand,omitempty"`
	Model               *string  `json:"model,omitempty"`
	Year                *int     `json:"year,omitempty"`
	RegistrationOcrYear *int     `json:"registrationOcrYear,omitempty"`
	Color               *string  `json:"color,omitempty"`
	Type                *string  `json:"type,omitempty"` // auto|moto|suv|pickup
	Motor               *string  `json:"motor,omitempty"`
	Chasis              *string  `json:"chasis,omitempty"`
	Vin                 *string  `json:"vin,omitempty"`
	Cylinders           *int     `json:"cylinders,omitempty"`
	Passengers          *int     `json:"passengers,omitempty"`
	FuelType            *string  `json:"fuelType,omitempty"`
	Tonnage             *float64 `json:"tonnage,omitempty"`
	VehicleClass        *string  `json:"vehicleClass,omitempty"`
	ServiceType         *string  `json:"serviceType,omitempty"`
	RegistrationNumber  *string  `json:"registrationNumber,omitempty"`
	RegistrationExpiry  *string  `json:"registrationExpiry,omitempty"` // YYYY-MM-DD
	EmissionDate        *string  `json:"emissionDate,omitempty"`       // YYYY-MM-DD
	InsuranceNumber     *string  `json:"insuranceNumber,omitempty"`
	InsuranceCompany    *string  `json:"insuranceCompany,omitempty"`
	InsuranceStartDate  *string  `json:"insuranceStartDate,omitempty"` // YYYY-MM-DD
	InsuranceExpiry     *string  `json:"insuranceExpiry,omitempty"`
	Lien                *string  `json:"lien,omitempty"`
	Is4x4               *bool    `json:"is4x4,omitempty"`
	VehiclePhoto        *string  `json:"vehiclePhoto,omitempty"` // objectPath
}

// RegisterVehicle — INSERT vehicles; driver_id se resuelve desde el uid.
func (s *Service) RegisterVehicle(ctx context.Context, uid string, in VehicleInput, requestID string) (string, error) {
	if in.Plate == "" {
		return "", apperr.New(400, "plate is required")
	}
	if in.Year != nil && (*in.Year < 1900 || *in.Year > 2100) {
		return "", apperr.New(400, "year must be between 1900 and 2100")
	}
	if in.RegistrationOcrYear != nil && (*in.RegistrationOcrYear < 1900 || *in.RegistrationOcrYear > 2100) {
		return "", apperr.New(400, "registrationOcrYear must be between 1900 and 2100")
	}
	for _, d := range []struct {
		name string
		ptr  **string
	}{
		{"registrationExpiry", &in.RegistrationExpiry},
		{"emissionDate", &in.EmissionDate},
		{"insuranceStartDate", &in.InsuranceStartDate},
		{"insuranceExpiry", &in.InsuranceExpiry},
	} {
		if *d.ptr == nil {
			continue
		}
		if **d.ptr == "" {
			*d.ptr = nil // "" equivaldría a NULL pero rompe el cast ::date
			continue
		}
		if _, err := time.Parse("2006-01-02", **d.ptr); err != nil {
			return "", apperr.New(400, d.name+" must be YYYY-MM-DD")
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	// Serializar altas del mismo conductor: solo el primer vehículo queda activo.
	var driverID string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE`, uid).Scan(&driverID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", apperr.New(404, "driver profile not found")
		}
		return "", err
	}
	var vehicleID string
	err = tx.QueryRow(ctx, `
		INSERT INTO public.vehicles (
			driver_id, plate, brand, model, year, color, type, motor, chasis,
			vin, cylinders, passengers, fuel_type, tonnage, vehicle_class,
			service_type, registration_number, registration_expiry, emission_date,
			insurance_number, insurance_company, insurance_start_date, insurance_expiry,
			lien, is_4x4, vehicle_photo, registration_ocr_year, is_active
		)
		SELECT d.id, $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::date,$19::date,$20,$21,$22::date,$23::date,$24,$25,$26,$27,
		       NOT EXISTS (SELECT 1 FROM public.vehicles existing WHERE existing.driver_id = d.id AND existing.is_active = TRUE AND existing.deleted_at IS NULL)
		FROM public.drivers d
		WHERE d.user_id = $1 AND d.deleted_at IS NULL
		RETURNING id::text`,
		uid, in.Plate, in.Brand, in.Model, in.Year, in.Color, in.Type,
		in.Motor, in.Chasis, in.Vin, in.Cylinders, in.Passengers,
		in.FuelType, in.Tonnage, in.VehicleClass, in.ServiceType,
		in.RegistrationNumber, in.RegistrationExpiry, in.EmissionDate,
		in.InsuranceNumber, in.InsuranceCompany, in.InsuranceStartDate,
		in.InsuranceExpiry, in.Lien, in.Is4x4, in.VehiclePhoto, in.RegistrationOcrYear,
	).Scan(&vehicleID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.New(404, "driver profile not found")
	}
	if err != nil {
		if isUniqueViolation(err) {
			return "", apperr.New(409, "plate already registered")
		}
		return "", fmt.Errorf("vehicles insert: %w", err)
	}
	if err := s.emitVehicleEvent(ctx, tx, uid, vehicleID, "vehicle.registered", requestID); err != nil {
		return "", err
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", requestID); err != nil {
		return "", err
	}
	return vehicleID, tx.Commit(ctx)
}

// ListMyVehicles — vehículos activos del conductor.
func (s *Service) ListMyVehicles(ctx context.Context, uid string) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT v.id::text, v.plate, v.brand, v.model, v.year, v.color, v.type,
		       v.is_4x4, v.is_active, v.vehicle_photo, v.created_at,
		       v.registration_number, v.registration_expiry, v.registration_photo_front, v.registration_photo_back,
		       v.insurance_number, v.insurance_company, v.insurance_expiry, v.insurance_photo
		FROM public.vehicles v
		JOIN public.drivers d ON d.id = v.driver_id
		WHERE d.user_id = $1 AND v.deleted_at IS NULL
		ORDER BY v.created_at DESC`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, plate string
		var brand, model, color, vtype, photo *string
		var year *int
		var is4x4, active *bool
		var createdAt time.Time
		var registrationNumber, registrationFront, registrationBack, insuranceNumber, insuranceCompany, insurancePhoto *string
		var registrationExpiry, insuranceExpiry *time.Time
		if err := rows.Scan(&id, &plate, &brand, &model, &year, &color, &vtype, &is4x4, &active, &photo, &createdAt,
			&registrationNumber, &registrationExpiry, &registrationFront, &registrationBack,
			&insuranceNumber, &insuranceCompany, &insuranceExpiry, &insurancePhoto); err != nil {
			return nil, err
		}
		m := map[string]any{"id": id, "plate": plate, "createdAt": createdAt}
		if brand != nil {
			m["brand"] = *brand
		}
		if model != nil {
			m["model"] = *model
		}
		if year != nil {
			m["year"] = *year
		}
		if color != nil {
			m["color"] = *color
		}
		if vtype != nil {
			m["type"] = *vtype
		}
		if is4x4 != nil {
			m["is4x4"] = *is4x4
		}
		if active != nil {
			m["isActive"] = *active
		}
		if photo != nil {
			m["vehiclePhoto"] = *photo
		}
		for key, value := range map[string]*string{
			"registrationNumber": registrationNumber, "registrationPhotoFront": registrationFront,
			"registrationPhotoBack": registrationBack, "insuranceNumber": insuranceNumber,
			"insuranceCompany": insuranceCompany, "insurancePhoto": insurancePhoto,
		} {
			if value != nil {
				m[key] = *value
			}
		}
		if registrationExpiry != nil {
			m["registrationExpiry"] = registrationExpiry.Format("2006-01-02")
		}
		if insuranceExpiry != nil {
			m["insuranceExpiry"] = insuranceExpiry.Format("2006-01-02")
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// vehicleEditable — update por el dueño (no driver_id, no is_active: la
// desactivación/baja de unidad va por flujo admin/compliance).
var vehicleEditable = map[string]string{
	"brand": "brand", "model": "model", "year": "year", "color": "color",
	"type": "type", "motor": "motor", "chasis": "chasis", "vin": "vin",
	"cylinders": "cylinders", "passengers": "passengers", "fuelType": "fuel_type",
	"tonnage": "tonnage", "vehicleClass": "vehicle_class", "serviceType": "service_type",
	"registrationNumber": "registration_number", "registrationExpiry": "registration_expiry",
	"emissionDate":    "emission_date",
	"insuranceNumber": "insurance_number", "insuranceCompany": "insurance_company",
	"insuranceStartDate": "insurance_start_date", "insuranceExpiry": "insurance_expiry",
	"lien": "lien", "is4x4": "is_4x4", "vehiclePhoto": "vehicle_photo",
}

// vehicleDateCols — columnas DATE editables: validar formato antes de que PG
// devuelva un 500 opaco por "invalid input syntax".
var vehicleDateCols = map[string]bool{
	"registration_expiry": true, "emission_date": true,
	"insurance_start_date": true, "insurance_expiry": true,
}

// PatchVehicle — UPDATE de campos permitidos en vehículo propio.
func (s *Service) PatchVehicle(ctx context.Context, uid, vehicleID string, fields map[string]any, requestID string) error {
	sets := []string{}
	vals := []any{vehicleID, uid}
	i := 3
	for k, v := range fields {
		col, ok := vehicleEditable[k]
		if !ok {
			continue
		}
		if vehicleDateCols[col] {
			if str, ok := v.(string); ok {
				if str == "" {
					v = nil // "" en una columna DATE falla el cast → NULL
				} else if _, err := time.Parse("2006-01-02", str); err != nil {
					return apperr.New(400, k+" must be YYYY-MM-DD")
				}
			}
		}
		sets = append(sets, fmt.Sprintf("%s = $%d", col, i))
		vals = append(vals, v)
		i++
	}
	if len(sets) == 0 {
		return apperr.New(400, "no editable fields")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	res, err := tx.Exec(ctx, fmt.Sprintf(`
		UPDATE public.vehicles v SET %s
		FROM public.drivers d
		WHERE v.id = $1::uuid AND d.id = v.driver_id AND d.user_id = $2
		  AND v.deleted_at IS NULL`, joinStrings(sets)), vals...)
	if err != nil {
		return fmt.Errorf("vehicles update: %w", err)
	}
	if res.RowsAffected() == 0 {
		return apperr.New(404, "vehicle not found")
	}
	if err := s.emitVehicleEvent(ctx, tx, uid, vehicleID, "vehicle.updated", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------- helpers internos ----------

// audit — equivalente a logAuditEvent de v1 (audit_log append-only).
func (s *Service) audit(ctx context.Context, tx pgx.Tx, actorUID, actorRole, action, entityType, entityID string, changes map[string]any) error {
	b, err := json.Marshal(changes)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO public.audit_log (actor_uid, actor_role, action, entity_type, entity_id, changes, source)
		VALUES ($1,$2,$3,$4,$5,$6,'api')`,
		actorUID, actorRole, action, entityType, entityID, string(b))
	return err
}

// emitDriverEvent — re-lee la fila y emite payload whitelist al outbox.
// La proyección a DATA-MAIN_drivers NO incluye licencias/docs (compliance).
func (s *Service) emitDriverEvent(ctx context.Context, tx pgx.Tx, driverUID, eventType, requestID string) error {
	var (
		accountStatus, designated string
		dept, muni, photo         *string
		totalRides                int
		rating                    float64
		displayName               *string
	)
	err := tx.QueryRow(ctx, `
		SELECT d.account_status::text, d.designated_role_status::text,
		       d.department, d.municipality, d.profile_photo,
		       d.total_rides, d.average_rating, u.name
		FROM public.drivers d
		LEFT JOIN public.users u ON u.id = d.user_id
		WHERE d.user_id = $1`, driverUID).
		Scan(&accountStatus, &designated, &dept, &muni, &photo, &totalRides, &rating, &displayName)
	if err != nil {
		return err
	}
	payload := map[string]any{
		"userId":               driverUID,
		"accountStatus":        accountStatus,
		"designatedRoleStatus": designated,
		"totalRides":           totalRides,
		"averageRating":        rating,
		"version":              versionNow(),
	}
	if dept != nil {
		payload["department"] = *dept
	}
	if muni != nil {
		payload["municipality"] = *muni
	}
	if photo != nil {
		payload["photoUrl"] = *photo
	}
	if displayName != nil {
		payload["displayName"] = *displayName
	}

	return outbox.Insert(ctx, tx, outbox.Event{
		Type:          eventType,
		AggregateType: "driver",
		AggregateID:   driverUID, // doc DATA-MAIN_drivers/{uid} (Firebase UID)
		Payload:       payload,
		RequestID:     requestID,
	})
}

func (s *Service) emitVehicleEvent(ctx context.Context, tx pgx.Tx, driverUID, vehicleID, eventType, requestID string) error {
	var plate string
	var brand, model, color, vtype, photo *string
	var year *int
	var is4x4, active *bool
	err := tx.QueryRow(ctx, `
		SELECT plate, brand, model, year, color, type, is_4x4, is_active, vehicle_photo
		FROM public.vehicles WHERE id = $1::uuid`, vehicleID).
		Scan(&plate, &brand, &model, &year, &color, &vtype, &is4x4, &active, &photo)
	if err != nil {
		return err
	}
	payload := map[string]any{
		"driverUid": driverUID,
		"plate":     plate,
		"version":   float64(time.Now().UnixMicro()),
	}
	if brand != nil {
		payload["brand"] = *brand
	}
	if model != nil {
		payload["model"] = *model
	}
	if year != nil {
		payload["year"] = *year
	}
	if color != nil {
		payload["color"] = *color
	}
	if vtype != nil {
		payload["type"] = *vtype
	}
	if is4x4 != nil {
		payload["is4x4"] = *is4x4
	}
	if active != nil {
		payload["isActive"] = *active
	}
	if photo != nil {
		payload["vehiclePhoto"] = *photo
	}

	return outbox.Insert(ctx, tx, outbox.Event{
		Type:          eventType,
		AggregateType: "vehicle",
		AggregateID:   vehicleID,
		Payload:       payload,
		RequestID:     requestID,
	})
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}

func isFKViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23503"
	}
	return false
}

func joinStrings(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ", "
		}
		out += x
	}
	return out
}
