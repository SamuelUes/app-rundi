package drivers

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/outbox"
)

// ---------- vehículos: switch / delete ----------

// SwitchVehicle — vehículo activo del conductor (switchVehicle v1):
// desactiva los demás y activa el elegido, en una TX.
func (s *Service) SwitchVehicle(ctx context.Context, uid, vehicleID string) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var driverID string
	if err := tx.QueryRow(ctx,
		`SELECT id::text FROM public.drivers WHERE user_id = $1 AND deleted_at IS NULL`,
		uid).Scan(&driverID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.New(404, "driver not found")
		}
		return err
	}
	rows, err := tx.Query(ctx,
		`UPDATE public.vehicles SET is_active = FALSE
		 WHERE driver_id = $1::uuid AND is_active = TRUE AND deleted_at IS NULL
		   AND id <> $2::uuid RETURNING id::text`,
		driverID, vehicleID)
	if err != nil {
		return err
	}
	var previousIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		previousIDs = append(previousIDs, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	tag, err := tx.Exec(ctx,
		`UPDATE public.vehicles SET is_active = TRUE
		 WHERE id = $1::uuid AND driver_id = $2::uuid AND deleted_at IS NULL`,
		vehicleID, driverID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return apperr.New(404, "vehicle not found")
	}
	for _, id := range previousIDs {
		if err := s.emitVehicleEvent(ctx, tx, uid, id, "vehicle.updated", ""); err != nil {
			return err
		}
	}
	if err := s.emitVehicleEvent(ctx, tx, uid, vehicleID, "vehicle.switched", ""); err != nil {
		return err
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", ""); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeleteVehicle — soft delete del vehículo propio.
func (s *Service) DeleteVehicle(ctx context.Context, uid, vehicleID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `
		UPDATE public.vehicles v SET deleted_at = NOW(), is_active = FALSE
		FROM public.drivers d
		WHERE v.id = $1::uuid AND v.driver_id = d.id AND d.user_id = $2
		  AND v.deleted_at IS NULL`, vehicleID, uid)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return apperr.New(404, "vehicle not found")
	}
	if err := s.emitVehicleEvent(ctx, tx, uid, vehicleID, "vehicle.deleted", ""); err != nil {
		return err
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", ""); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ---------- conductor designado: solicitud de acceso ----------

// RequestDesignatedAccess — requestDesignatedDriverAccess v1: marca
// designated_role_status='requested' (aprobación la hace admin con
// el endpoint de status o flujo CMS).
func (s *Service) RequestDesignatedAccess(ctx context.Context, uid string) (string, error) {
	var status string
	err := s.pool.QueryRow(ctx, `
		UPDATE public.drivers
		SET designated_role_status = 'requested'
		WHERE user_id = $1 AND deleted_at IS NULL
		  AND designated_role_status IN ('pending', 'rejected')
		RETURNING designated_role_status::text`, uid).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		var cur string
		e := s.pool.QueryRow(ctx,
			`SELECT designated_role_status::text FROM public.drivers WHERE user_id = $1`,
			uid).Scan(&cur)
		if e == nil {
			return cur, nil // ya requested/verified — idempotente
		}
		return "", apperr.New(404, "driver not found")
	}
	return status, err
}

// DesignatedAccessStatus — getDesignatedDriverRequestStatus v1.
func (s *Service) DesignatedAccessStatus(ctx context.Context, uid string) (string, error) {
	var st string
	err := s.pool.QueryRow(ctx, `
		SELECT designated_role_status::text FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL`, uid).Scan(&st)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.New(404, "driver not found")
	}
	return st, err
}

// ---------- consultas ----------

type DriverStats struct {
	DriverID        string  `json:"driverId"`
	TotalRides      int     `json:"totalRides"`
	CompletedRides  int     `json:"completedRides"`
	CanceledRides   int     `json:"canceledRides"`
	AverageRating   float64 `json:"averageRating"`
	TotalEarnings   float64 `json:"totalEarnings"`
	RechargeBalance float64 `json:"rechargeBalance"`
	AccountStatus   string  `json:"accountStatus"`
}

// Stats — getDriverStats v1 (métricas propias del conductor).
func (s *Service) Stats(ctx context.Context, uid string) (*DriverStats, error) {
	var st DriverStats
	err := s.pool.QueryRow(ctx, `
		SELECT d.user_id,
		       (SELECT COUNT(*) FROM public.rides r WHERE r.driver_id = d.user_id AND r.deleted_at IS NULL),
		       (SELECT COUNT(*) FROM public.rides r WHERE r.driver_id = d.user_id AND r.status IN ('completed','rating_completed','rating_skipped')),
		       (SELECT COUNT(*) FROM public.rides r WHERE r.driver_id = d.user_id AND r.status = 'canceled'),
		       COALESCE(d.average_rating, 0), COALESCE(d.total_earnings, 0),
		       COALESCE(d.current_recharge_balance, 0), d.account_status::text
		FROM public.drivers d WHERE d.user_id = $1 AND d.deleted_at IS NULL`,
		uid).Scan(&st.DriverID, &st.TotalRides, &st.CompletedRides,
		&st.CanceledRides, &st.AverageRating, &st.TotalEarnings,
		&st.RechargeBalance, &st.AccountStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "driver not found")
	}
	return &st, err
}

// ListForAdmin — getAllDrivers v1 (panel admin, paginado por created_at).
func (s *Service) ListForAdmin(ctx context.Context, status string, limit, offset int) ([]map[string]any, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := `SELECT d.id::text, d.user_id, d.account_status::text,
		d.average_rating, d.total_rides, d.department, d.municipality,
		d.designated_role_status::text, d.created_at
		FROM public.drivers d WHERE d.deleted_at IS NULL`
	args := []any{}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(` AND d.account_status = $%d::driver_account_status`, len(args))
	}
	args = append(args, limit, offset)
	q += fmt.Sprintf(` ORDER BY d.created_at DESC LIMIT $%d OFFSET $%d`, len(args)-1, len(args))
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, uid, st, dept, muni, des string
		var rating *float64
		var total *int
		var createdAt any
		if err := rows.Scan(&id, &uid, &st, &rating, &total, &dept, &muni, &des, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "userId": uid, "accountStatus": st, "averageRating": rating,
			"totalRides": total, "department": dept, "municipality": muni,
			"designatedRolRequested": des, "createdAt": createdAt,
		})
	}
	return out, rows.Err()
}

// ---------- crew candidates (searchDesignatedCrewCandidates v1) ----------

type CrewCandidate struct {
	UserID       string  `json:"userId"`
	Name         string  `json:"name"`
	Rating       float64 `json:"rating"`
	Department   string  `json:"department"`
	ProfilePhoto *string `json:"profilePhoto,omitempty"`
}

// SearchCrewCandidates — drivers elegibles designados (verified + active)
// filtrables por nombre; excluye al propio capitán.
func (s *Service) SearchCrewCandidates(ctx context.Context, uid, q string, limit int) ([]CrewCandidate, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := s.pool.Query(ctx, `
		SELECT d.user_id, COALESCE(u.name, ''), COALESCE(d.average_rating, 0),
		       COALESCE(d.department, ''), d.profile_photo
		FROM public.drivers d
		LEFT JOIN public.users u ON u.id = d.user_id
		WHERE d.designated_role_status = 'verified'
		  AND d.account_status = 'active'
		  AND d.user_id <> $1
		  AND d.deleted_at IS NULL
		  AND ($2 = '' OR u.name ILIKE '%' || $2 || '%')
		ORDER BY d.average_rating DESC NULLS LAST
		LIMIT $3`, uid, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CrewCandidate{}
	for rows.Next() {
		var c CrewCandidate
		if err := rows.Scan(&c.UserID, &c.Name, &c.Rating, &c.Department, &c.ProfilePhoto); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ---------- feature grants (admin) ----------

// SetSeniorFeature changes only the driver's own opt-in preference.
func (s *Service) SetSeniorFeature(ctx context.Context, uid string, enabled bool, requestID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `
		INSERT INTO public.driver_feature_assignments (driver_id, feature_id, is_active, granted_by, revoked_by, revoked_at)
		SELECT d.id, f.id, $2, $1::text, CASE WHEN $2 THEN NULL ELSE $1::text END,
		       CASE WHEN $2 THEN NULL ELSE NOW() END
		FROM public.drivers d CROSS JOIN public.features f
		WHERE d.user_id = $1::text AND d.deleted_at IS NULL AND f.code = 'senior'
		ON CONFLICT (driver_id, feature_id) DO UPDATE
		SET is_active = EXCLUDED.is_active, granted_by = EXCLUDED.granted_by,
		    granted_at = NOW(), expires_at = NULL,
		    revoked_by = EXCLUDED.revoked_by, revoked_at = EXCLUDED.revoked_at`, uid, enabled)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return apperr.New(404, "driver or senior feature not found")
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// GrantFeature — grantDriverRideFeature/grantVehicleRideFeature v1.
func (s *Service) GrantFeature(ctx context.Context, adminUID, entityType, entityID, featureCode string, requestID string) error {
	table := "driver_feature_assignments"
	ownerCol := "driver_id"
	if entityType == "vehicle" {
		table = "vehicle_feature_assignments"
		ownerCol = "vehicle_id"
	}
	var ownerRef string
	if entityType == "vehicle" {
		ownerRef = entityID // vehicle UUID
	} else {
		// driver: acepta UUID interno o Firebase UID.
		if err := s.pool.QueryRow(ctx,
			`SELECT id::text FROM public.drivers WHERE user_id = $1`, entityID).Scan(&ownerRef); err != nil {
			ownerRef = entityID
		}
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, fmt.Sprintf(`
		INSERT INTO public.%s (%s, feature_id, is_active, granted_by)
		SELECT $1::uuid, f.id, TRUE, $2 FROM public.features f WHERE f.code = $3
		ON CONFLICT (%s, feature_id) DO UPDATE SET is_active = TRUE, revoked_by = NULL, revoked_at = NULL, granted_by = $2`,
		table, ownerCol, ownerCol), ownerRef, adminUID, featureCode); err != nil {
		return err
	}
	var uid string
	ownerQuery := `SELECT user_id FROM public.drivers WHERE id = $1::uuid`
	if entityType == "vehicle" {
		ownerQuery = `SELECT d.user_id FROM public.vehicles v JOIN public.drivers d ON d.id = v.driver_id WHERE v.id = $1::uuid`
	}
	if err := tx.QueryRow(ctx, ownerQuery, ownerRef).Scan(&uid); err != nil {
		return err
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", requestID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RevokeFeature — revoca el grant.
func (s *Service) RevokeFeature(ctx context.Context, entityType, entityID, featureCode string) error {
	table := "driver_feature_assignments"
	ownerCol := "driver_id"
	if entityType == "vehicle" {
		table = "vehicle_feature_assignments"
		ownerCol = "vehicle_id"
	}
	var ownerRef string
	if entityType == "vehicle" {
		ownerRef = entityID
	} else {
		if err := s.pool.QueryRow(ctx,
			`SELECT id::text FROM public.drivers WHERE user_id = $1`, entityID).Scan(&ownerRef); err != nil {
			ownerRef = entityID
		}
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, fmt.Sprintf(`
		UPDATE public.%s a SET is_active = FALSE, revoked_at = NOW()
		FROM public.features f
		WHERE a.%s = $1::uuid AND a.feature_id = f.id AND f.code = $2`,
		table, ownerCol), ownerRef, featureCode)
	if err != nil {
		return err
	}
	var uid string
	ownerQuery := `SELECT user_id FROM public.drivers WHERE id = $1::uuid`
	if entityType == "vehicle" {
		ownerQuery = `SELECT d.user_id FROM public.vehicles v JOIN public.drivers d ON d.id = v.driver_id WHERE v.id = $1::uuid`
	}
	if err := tx.QueryRow(ctx, ownerQuery, ownerRef).Scan(&uid); err != nil {
		return err
	}
	if err := s.emitDriverEvent(ctx, tx, uid, "driver.updated", ""); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// MyFeatureCapabilities — getMyRideFeatureCapabilities v1: features del
// conductor (+ sus vehículos) combinadas con service_feature_assignments.
func (s *Service) MyFeatureCapabilities(ctx context.Context, uid string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT f.code
		FROM public.features f
		WHERE f.id IN (
			SELECT a.feature_id FROM public.driver_feature_assignments a
			JOIN public.drivers d ON d.id = a.driver_id
			WHERE d.user_id = $1 AND a.is_active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW()) AND f.code <> 'premium'
			UNION
			SELECT a.feature_id FROM public.vehicle_feature_assignments a
			JOIN public.vehicles v ON v.id = a.vehicle_id
			JOIN public.drivers d ON d.id = v.driver_id
			WHERE d.user_id = $1 AND a.is_active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW()) AND v.is_active = TRUE AND v.deleted_at IS NULL AND f.code NOT IN ('premium', 'senior')
			  AND v.id = (SELECT v2.id FROM public.vehicles v2 WHERE v2.driver_id = d.id AND v2.is_active = TRUE AND v2.deleted_at IS NULL ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
			UNION
			SELECT f.id FROM public.vehicles v
			JOIN public.drivers d ON d.id = v.driver_id
			WHERE d.user_id = $1 AND v.is_active = TRUE AND v.deleted_at IS NULL
			  AND v.id = (SELECT v2.id FROM public.vehicles v2 WHERE v2.driver_id = d.id AND v2.is_active = TRUE AND v2.deleted_at IS NULL ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
			  AND f.code = 'premium' AND public.vehicle_premium_eligible(v.registration_ocr_year, v.type, NOW())
		)`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{"pet_friendly"}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		if c != "pet_friendly" {
			out = append(out, c)
		}
	}
	return out, rows.Err()
}

// ---------- recargas (driver_wallet_movements) ----------

type RechargeSummary struct {
	Balance   float64         `json:"balance"`
	Recharges []RechargeEntry `json:"recharges"`
}

type RechargeEntry struct {
	ID        string  `json:"id"`
	DriverID  string  `json:"driverId,omitempty"`
	Type      string  `json:"type"`
	Source    string  `json:"source"`
	Amount    float64 `json:"amount"`
	Status    string  `json:"status"`
	Reference *string `json:"externalReference,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

// RechargeSummary — getDriverRechargeFundsSummary v1.
func (s *Service) RechargeSummary(ctx context.Context, uid string, limit int) (*RechargeSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	out := &RechargeSummary{Recharges: []RechargeEntry{}}
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(current_recharge_balance, 0) FROM public.drivers WHERE user_id = $1`,
		uid).Scan(&out.Balance); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(404, "driver not found")
		}
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, movement_type, source, amount, status,
		       external_reference, created_at::text
		FROM public.driver_wallet_movements
		WHERE driver_id = $1 ORDER BY created_at DESC LIMIT $2`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var e RechargeEntry
		if err := rows.Scan(&e.ID, &e.Type, &e.Source, &e.Amount,
			&e.Status, &e.Reference, &e.CreatedAt); err != nil {
			return nil, err
		}
		out.Recharges = append(out.Recharges, e)
	}
	return out, rows.Err()
}

// CreateRecharge — createDriverRechargeManual v1 (admin registra recarga):
// inserta con balance_before/after y actualiza drivers.current_recharge_balance
// en la misma TX.
func (s *Service) CreateRecharge(ctx context.Context, driverUID string, amount float64, reference, requestID string) (*RechargeEntry, error) {
	if amount <= 0 {
		return nil, apperr.New(400, "amount debe ser > 0")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var before float64
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(current_recharge_balance, 0) FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE`, driverUID).Scan(&before)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "driver not found")
	}
	if err != nil {
		return nil, err
	}
	after := before + amount
	var e RechargeEntry
	err = tx.QueryRow(ctx, `
		INSERT INTO public.driver_wallet_movements
			(driver_id, movement_type, source, amount, balance_before, balance_after, external_reference)
		VALUES ($1, 'recharge', 'manual', $2, $3, $4, NULLIF($5,''))
		RETURNING id::text, movement_type, source, amount, status, external_reference, created_at::text`,
		driverUID, amount, before, after, reference,
	).Scan(&e.ID, &e.Type, &e.Source, &e.Amount, &e.Status, &e.Reference, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE public.drivers SET current_recharge_balance = $2 WHERE user_id = $1`,
		driverUID, after); err != nil {
		return nil, err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "driver.recharge", AggregateType: "driver", AggregateID: driverUID,
		RequestID: requestID,
		Payload: map[string]any{
			"driverId": driverUID, "amount": amount,
			"balance": after, "rechargeId": e.ID,
		},
	}); err != nil {
		return nil, err
	}
	return &e, tx.Commit(ctx)
}

// RequestRecharge — createDriverRechargeManual v1 (driver declara recarga):
// INSERT con status='pending' y balance_before=balance_after (sin acreditar)
// hasta que un admin la confirme (ConfirmRecharge) contra el estado de cuenta.
// Idempotente por external_transaction_id (constraint unique).
func (s *Service) RequestRecharge(ctx context.Context, uid string, amount float64, reference, txnID, method, requestID string) (*RechargeEntry, float64, bool, error) {
	if amount <= 0 {
		return nil, 0, false, apperr.New(400, "amount debe ser > 0")
	}
	if txnID != "" {
		var e RechargeEntry
		var before float64
		err := s.pool.QueryRow(ctx, `
			SELECT w.id::text, w.driver_id, w.movement_type, w.source, w.amount, w.status,
			       w.external_reference, w.created_at::text,
			       COALESCE(d.current_recharge_balance, 0)
			FROM public.driver_wallet_movements w
			JOIN public.drivers d ON d.user_id = w.driver_id
			WHERE w.external_transaction_id = $1`, txnID).
			Scan(&e.ID, &e.DriverID, &e.Type, &e.Source, &e.Amount, &e.Status,
				&e.Reference, &e.CreatedAt, &before)
		if err == nil {
			return &e, before, true, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, false, err
		}
	}
	var before float64
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(current_recharge_balance, 0) FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL`, uid).Scan(&before)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, false, apperr.New(404, "driver not found")
	}
	if err != nil {
		return nil, 0, false, err
	}
	if method == "" {
		method = "manual"
	}
	// TX: el insert y el outbox van juntos para que la recarga pendiente se
	// proyecte a REALTIME_driver_wallet sin esperar al confirm admin.
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, 0, false, err
	}
	defer tx.Rollback(ctx)
	var e RechargeEntry
	err = tx.QueryRow(ctx, `
		INSERT INTO public.driver_wallet_movements
			(driver_id, movement_type, source, amount, balance_before, balance_after,
			 external_reference, external_transaction_id, metadata, status)
		VALUES ($1, 'recharge', 'manual', $2, $3, $3,
		        NULLIF($4,''), NULLIF($5,''), $6, 'pending')
		RETURNING id::text, driver_id, movement_type, source, amount, status,
		          external_reference, created_at::text`,
		uid, amount, before, reference, txnID,
		map[string]string{"method": method}).
		Scan(&e.ID, &e.DriverID, &e.Type, &e.Source, &e.Amount, &e.Status,
			&e.Reference, &e.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			// Carrera de duplicados por external_transaction_id: ya existe.
			var e2 RechargeEntry
			if err2 := s.pool.QueryRow(ctx, `
				SELECT id::text, driver_id, movement_type, source, amount, status,
				       external_reference, created_at::text
				FROM public.driver_wallet_movements WHERE external_transaction_id = $1`,
				txnID).Scan(&e2.ID, &e2.DriverID, &e2.Type, &e2.Source, &e2.Amount,
				&e2.Status, &e2.Reference, &e2.CreatedAt); err2 == nil {
				return &e2, before, true, nil
			}
		}
		return nil, 0, false, err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "driver.recharge", AggregateType: "driver", AggregateID: uid,
		RequestID: requestID,
		Payload: map[string]any{
			"driverId": uid, "amount": amount,
			"balance": before, "rechargeId": e.ID, "status": "pending",
		},
	}); err != nil {
		return nil, 0, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, false, err
	}
	return &e, before, false, nil
}

// ConfirmRecharge — RPC confirm_driver_recharge v1 (panel CMS): pending→
// confirmed reescribiendo balance_before/after y acreditando drivers.
// current_recharge_balance en la misma TX + outbox para la proyección wallet.
func (s *Service) ConfirmRecharge(ctx context.Context, movementID, requestID string) (*RechargeEntry, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var e RechargeEntry
	var before float64
	err = tx.QueryRow(ctx, `
		SELECT id::text, driver_id, movement_type::text, source::text, amount, status::text
		FROM public.driver_wallet_movements
		WHERE id = $1::uuid FOR UPDATE`, movementID).
		Scan(&e.ID, &e.DriverID, &e.Type, &e.Source, &e.Amount, &e.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "recharge not found")
	}
	if err != nil {
		return nil, err
	}
	if e.Type != "recharge" || e.Status != "pending" {
		return nil, apperr.New(409, "recharge is not pending")
	}
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(current_recharge_balance, 0) FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE`, e.DriverID).Scan(&before)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "driver not found")
	}
	if err != nil {
		return nil, err
	}
	after := before + e.Amount
	err = tx.QueryRow(ctx, `
		UPDATE public.driver_wallet_movements SET
			status = 'confirmed', balance_before = $2, balance_after = $3,
			updated_at = NOW()
		WHERE id = $1::uuid
		RETURNING external_reference, created_at::text`, movementID, before, after).
		Scan(&e.Reference, &e.CreatedAt)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE public.drivers SET current_recharge_balance = $2 WHERE user_id = $1`,
		e.DriverID, after); err != nil {
		return nil, err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "driver.recharge", AggregateType: "driver", AggregateID: e.DriverID,
		RequestID: requestID,
		Payload: map[string]any{
			"driverId": e.DriverID, "amount": e.Amount,
			"balance": after, "rechargeId": e.ID,
		},
	}); err != nil {
		return nil, err
	}
	e.Status = "confirmed"
	return &e, tx.Commit(ctx)
}

// ListRecharges — panel admin: movimientos de wallet filtrables por status
// (p.ej. status='pending' para revisar solicitudes del conductor).
func (s *Service) ListRecharges(ctx context.Context, status string, limit int) ([]RechargeEntry, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	q := `SELECT id::text, driver_id, movement_type::text, source::text, amount,
		status::text, external_reference, created_at::text
		FROM public.driver_wallet_movements`
	args := []any{}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(` WHERE status = $%d::wallet_movement_status`, len(args))
	}
	args = append(args, limit)
	q += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RechargeEntry{}
	for rows.Next() {
		var e RechargeEntry
		if err := rows.Scan(&e.ID, &e.DriverID, &e.Type, &e.Source, &e.Amount,
			&e.Status, &e.Reference, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ---------- consultas públicas (auth, no admin) ----------

// ListDrivers — getDriversByRating/getDriversByDepartment v1 (cualquier
// autenticado): conductores activos filtrados.
func (s *Service) ListDrivers(ctx context.Context, minRating float64, department string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := `SELECT d.user_id, COALESCE(u.name,''), COALESCE(d.average_rating,0),
		d.total_rides, d.department, d.municipality, d.profile_photo
		FROM public.drivers d
		LEFT JOIN public.users u ON u.id = d.user_id
		WHERE d.deleted_at IS NULL AND d.account_status = 'active'`
	args := []any{}
	if minRating > 0 {
		args = append(args, minRating)
		q += fmt.Sprintf(` AND d.average_rating >= $%d`, len(args))
	}
	if department != "" {
		args = append(args, department)
		q += fmt.Sprintf(` AND d.department = $%d`, len(args))
	}
	args = append(args, limit)
	q += fmt.Sprintf(` ORDER BY d.average_rating DESC NULLS LAST LIMIT $%d`, len(args))
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var uid, name, dept, muni string
		var rating float64
		var total *int
		var photo *string
		if err := rows.Scan(&uid, &name, &rating, &total, &dept, &muni, &photo); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"userId": uid, "name": name, "averageRating": rating,
			"totalRides": total, "department": dept, "municipality": muni,
			"profilePhoto": photo,
		})
	}
	return out, rows.Err()
}

// GetVehicle — getVehicleById v1: un vehículo propio por id. Devuelve el
// mismo shape que ListMyVehicles para que la vista de detalle no vea nulls.
func (s *Service) GetVehicle(ctx context.Context, uid, vehicleID string) (map[string]any, error) {
	var id, plate string
	var vtype, brand, model, color, photo *string
	var year *int
	var is4x4, active *bool
	var createdAt time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT v.id::text, v.plate, v.type, v.brand, v.model, v.color,
		       v.year, v.is_4x4, v.is_active, v.vehicle_photo, v.created_at
		FROM public.vehicles v JOIN public.drivers d ON d.id = v.driver_id
		WHERE v.id = $1::uuid AND d.user_id = $2 AND v.deleted_at IS NULL`,
		vehicleID, uid).Scan(&id, &plate, &vtype, &brand, &model, &color,
		&year, &is4x4, &active, &photo, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "vehicle not found")
	}
	if err != nil {
		return nil, err
	}
	m := map[string]any{"id": id, "plate": plate, "createdAt": createdAt}
	if vtype != nil {
		m["type"] = *vtype
	}
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
	if is4x4 != nil {
		m["is4x4"] = *is4x4
	}
	if active != nil {
		m["isActive"] = *active
	}
	if photo != nil {
		m["vehiclePhoto"] = *photo
	}
	return m, nil
}
