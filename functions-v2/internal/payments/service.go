package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	firestore "cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/cashcode"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// resolveRideID — los clientes mandan indistintamente rides.id (uuid SQL) o
// firebase_ride_id (doc vivo REALTIME_trips_live/{id}); normaliza al uuid SQL
// como rides.ResolveRideID. Sin esto el cast $1::uuid da 500 con un live id.
func (s *Service) resolveRideID(ctx context.Context, rideID string) (string, error) {
	if uuidRe.MatchString(rideID) {
		return rideID, nil
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM public.rides WHERE firebase_ride_id = $1`, rideID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", apperr.ErrNotFound
	}
	return id, err
}

// ConfirmCash — el conductor confirma recepción del efectivo (antes: callable
// confirmCashPayment). Solo el conductor asignado; solo pagos 'pending'.
// Doc §7.1: trip completed ≠ payment settled — esto liquida la obligación.
// El código de payment_cash_codes es OPCIONAL (paridad v1, que nunca lo
// exigió): si el conductor lo digita se verifica con la misma política de
// intentos/bloqueo del pickup code; confirmar sin código liquida igual.
func (s *Service) ConfirmCash(ctx context.Context, rideID, driverUID, code, requestID string) (*Payment, error) {
	var err error
	if rideID, err = s.resolveRideID(ctx, rideID); err != nil {
		return nil, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var assignedDriver *string
	var walletCommissionEnabled bool
	if err := tx.QueryRow(ctx, `SELECT driver_id, wallet_commission_enabled FROM public.rides WHERE id=$1::uuid FOR UPDATE`, rideID).Scan(&assignedDriver, &walletCommissionEnabled); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ErrNotFound
		}
		return nil, err
	}
	if assignedDriver == nil || *assignedDriver != driverUID {
		return nil, apperr.ErrForbidden
	}

	var expected *string
	var lockedUntil *time.Time
	err = tx.QueryRow(ctx,
		`SELECT code, locked_until FROM public.payment_cash_codes WHERE ride_id=$1::uuid FOR UPDATE`,
		rideID).Scan(&expected, &lockedUntil)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if expected != nil && code != "" {
		if lockedUntil != nil && lockedUntil.After(time.Now()) {
			return nil, apperr.New(429, "cash code temporarily locked")
		}
		if code != *expected {
			if _, err := tx.Exec(ctx, `
				UPDATE public.payment_cash_codes
				SET failed_attempts = CASE WHEN locked_until <= NOW() THEN 1 ELSE failed_attempts + 1 END,
				    locked_until = CASE WHEN (CASE WHEN locked_until <= NOW() THEN 1 ELSE failed_attempts + 1 END) >= 5
				                        THEN NOW() + interval '5 minutes' ELSE NULL END
				WHERE ride_id=$1::uuid`, rideID); err != nil {
				return nil, err
			}
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
			return nil, apperr.New(400, "incorrect cash code")
		}
	}

	var p Payment
	err = tx.QueryRow(ctx, `
		UPDATE public.payments p
		SET status = 'confirmed', paid_at = NOW()
		FROM public.rides r
		WHERE p.ride_id = $1
		  AND p.ride_id = r.id
		  AND r.driver_id = $2
		  AND p.payment_method = 'cash'
		  AND p.status IN ('pending', 'pending_confirmation')
		RETURNING p.id, p.ride_id, p.amount, p.tip, p.commission,
		          p.commission_rate_applied, p.total, p.payment_method,
		          p.payment_provider, p.status, p.commission_status, p.paid_at`,
		rideID, driverUID,
	).Scan(&p.ID, &p.RideID, &p.Amount, &p.Tip, &p.Commission,
		&p.CommissionRateApplied, &p.Total, &p.PaymentMethod,
		&p.PaymentProvider, &p.Status, &p.CommissionStatus, &p.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "no pending cash payment for this ride/driver")
	}
	if err != nil {
		return nil, fmt.Errorf("confirm cash: %w", err)
	}

	// Acumulado de ganancias del conductor (earnings v1): neto = total-comisión.
	if _, err := tx.Exec(ctx, `
		UPDATE public.drivers
		SET total_earnings = COALESCE(total_earnings, 0) + ($2::numeric - $3::numeric)
		WHERE user_id = $1`, driverUID, p.Total, p.Commission); err != nil {
		return nil, err
	}

	if walletCommissionEnabled {
		if p.Commission > 0 {
			var movementID string
			err = tx.QueryRow(ctx, `
				WITH balance AS (
					UPDATE public.drivers
					SET current_recharge_balance = current_recharge_balance - $2::numeric
					WHERE user_id = $1 AND deleted_at IS NULL
					RETURNING current_recharge_balance
				)
				INSERT INTO public.driver_wallet_movements
					(driver_id, ride_id, movement_type, source, amount, balance_before, balance_after, external_transaction_id)
				SELECT $1, $3::uuid, 'commission_deduction', 'ride_payment_completion',
				       -$2::numeric, current_recharge_balance + $2::numeric, current_recharge_balance, 'deduction-' || $4
				FROM balance RETURNING id::text`, driverUID, p.Commission, rideID, p.ID).Scan(&movementID)
			if err != nil {
				return nil, fmt.Errorf("commission deduction: %w", err)
			}
			if err := outbox.Insert(ctx, tx, outbox.Event{
				Type: "driver.wallet_debited", AggregateType: "driver", AggregateID: driverUID,
				RequestID: requestID,
				Payload:   map[string]any{"driverId": driverUID, "rideId": rideID, "rechargeId": movementID},
			}); err != nil {
				return nil, err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE public.payments SET commission_status='paid', commission_paid_at=NOW() WHERE id=$1`, p.ID); err != nil {
			return nil, err
		}
		p.CommissionStatus = "paid"
	}

	p.DriverID = driverUID
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "payment.confirmed",
		AggregateType: "payment",
		AggregateID:   p.ID,
		RequestID:     requestID,
		Payload: map[string]any{
			"paymentId": p.ID, "rideId": p.RideID, "driverId": driverUID,
			"status": p.Status, "amount": p.Amount, "total": p.Total,
			"paidAt": p.PaidAt,
		},
	}); err != nil {
		return nil, err
	}
	return &p, tx.Commit(ctx)
}

// RegisterCash — participante declara pago en efectivo (registerCashPayment
// v1): status 'pending' → 'pending_confirmation' + tip (≤1000 C$ como v1) +
// evidencia de autenticación del cobro (paridad v1: authentication_method,
// biometric_authenticated, biometric_type).
func (s *Service) RegisterCash(ctx context.Context, rideID, uid string, tip float64, auth CashAuth, requestID string) (*Payment, error) {
	if tip < 0 || tip > 1000 {
		return nil, apperr.New(400, "tip debe ser 0..1000")
	}
	var err error
	if rideID, err = s.resolveRideID(ctx, rideID); err != nil {
		return nil, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var p Payment
	var clientID, driverID *string
	err = tx.QueryRow(ctx, `
		UPDATE public.payments p
		SET status = 'pending_confirmation', tip = $3,
			authentication_method = COALESCE($4::public.payment_auth_method, p.authentication_method),
			biometric_authenticated = p.biometric_authenticated OR $5,
			biometric_type = COALESCE(NULLIF($6, '')::public.biometric_type, p.biometric_type)
		FROM public.rides r
		WHERE p.ride_id = $1
		  AND p.ride_id = r.id
		  AND (r.client_id = $2 OR r.driver_id = $2 OR r.follower_driver_id = $2)
		  AND p.payment_method = 'cash'
		  AND p.status = 'pending'
		RETURNING p.id, p.ride_id, p.amount, p.tip, p.commission,
		          p.commission_rate_applied, p.total, p.payment_method,
		          p.payment_provider, p.status, p.commission_status, p.paid_at,
		          r.client_id, r.driver_id`,
		rideID, uid, tip, auth.authMethodPtr(), auth.BiometricAuthenticated, auth.bioType(),
	).Scan(&p.ID, &p.RideID, &p.Amount, &p.Tip, &p.Commission,
		&p.CommissionRateApplied, &p.Total, &p.PaymentMethod,
		&p.PaymentProvider, &p.Status, &p.CommissionStatus, &p.PaidAt,
		&clientID, &driverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "no pending cash payment for this ride/actor")
	}
	if err != nil {
		return nil, err
	}
	if clientID != nil {
		p.ClientID = *clientID
	}
	if driverID != nil {
		p.DriverID = *driverID
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "payment.registered", AggregateType: "payment", AggregateID: p.ID,
		RequestID: requestID,
		Payload: map[string]any{
			"paymentId": p.ID, "rideId": p.RideID, "status": p.Status,
			"clientId": clientID, "driverId": driverID,
			"amount": p.Amount, "tip": p.Tip, "total": p.Total,
		},
	}); err != nil {
		return nil, err
	}
	return &p, tx.Commit(ctx)
}

// GenerateCashCode — conductor (re)genera el código de 4 dígitos. El código
// NO se devuelve al conductor: se guarda en payment_cash_codes y se proyecta
// a REALTIME_payments_live/{liveId}/private/cash, legible solo por el cliente
// (el cliente lo dicta al conductor, que lo digita para confirmar).
func (s *Service) GenerateCashCode(ctx context.Context, rideID, driverUID, requestID string) error {
	var err error
	if rideID, err = s.resolveRideID(ctx, rideID); err != nil {
		return err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var paymentID string
	var driverID *string
	err = tx.QueryRow(ctx, `
		SELECT p.id::text, r.driver_id
		FROM public.rides r
		JOIN public.payments p ON p.ride_id = r.id
		WHERE r.id = $1::uuid
		  AND p.payment_method = 'cash'
		  AND p.status IN ('pending', 'pending_confirmation')`, rideID).
		Scan(&paymentID, &driverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(409, "no pending cash payment for this ride")
	}
	if err != nil {
		return err
	}
	if driverID == nil || *driverID != driverUID {
		return apperr.ErrForbidden
	}
	if _, err := tx.Exec(ctx,
		`UPDATE public.payments SET authentication_method = 'code' WHERE id = $1::uuid`,
		paymentID); err != nil {
		return err
	}
	if err := cashcode.Regenerate(ctx, tx, rideID); err != nil {
		return err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "payment.cash_code", AggregateType: "payment", AggregateID: paymentID,
		RequestID: requestID,
		Payload:   map[string]any{"paymentId": paymentID, "rideId": rideID, "driverId": driverUID},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// CancelCash — participante cancela el pago pendiente (cancelCashPayment v1).
func (s *Service) CancelCash(ctx context.Context, rideID, uid, reason, requestID string) (*Payment, error) {
	var err error
	if rideID, err = s.resolveRideID(ctx, rideID); err != nil {
		return nil, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var p Payment
	var clientID, driverID *string
	err = tx.QueryRow(ctx, `
		UPDATE public.payments p
		SET status = 'canceled', cancel_reason = NULLIF($3, '')
		FROM public.rides r
		WHERE p.ride_id = $1
		  AND p.ride_id = r.id
		  AND (r.client_id = $2 OR r.driver_id = $2)
		  AND p.status IN ('pending', 'pending_confirmation')
		RETURNING p.id, p.ride_id, p.amount, p.tip, p.commission,
		          p.commission_rate_applied, p.total, p.payment_method,
		          p.payment_provider, p.status, p.commission_status, p.paid_at,
		          r.client_id, r.driver_id`,
		rideID, uid, reason,
	).Scan(&p.ID, &p.RideID, &p.Amount, &p.Tip, &p.Commission,
		&p.CommissionRateApplied, &p.Total, &p.PaymentMethod,
		&p.PaymentProvider, &p.Status, &p.CommissionStatus, &p.PaidAt,
		&clientID, &driverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "no pending payment to cancel")
	}
	if err != nil {
		return nil, err
	}
	if clientID != nil {
		p.ClientID = *clientID
	}
	if driverID != nil {
		p.DriverID = *driverID
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "payment.canceled", AggregateType: "payment", AggregateID: p.ID,
		RequestID: requestID,
		Payload: map[string]any{
			"paymentId": p.ID, "rideId": p.RideID, "status": p.Status,
			"clientId": clientID, "driverId": driverID, "reason": reason,
		},
	}); err != nil {
		return nil, err
	}
	return &p, tx.Commit(ctx)
}

// PendingDebt — deuda pendiente del cliente (getPendingPayments v1).
type PendingDebt struct {
	RideID        string    `json:"rideId"`
	PaymentID     string    `json:"paymentId"`
	DriverID      string    `json:"driverId"`
	DriverName    string    `json:"driverName"`
	DriverPhoto   string    `json:"driverPhoto"`
	PaymentMethod string    `json:"paymentMethod"`
	Amount        float64   `json:"amount"`
	Tip           float64   `json:"tip"`
	Total         float64   `json:"total"`
	Origin        string    `json:"origin"`
	Destination   string    `json:"destination"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
}

func (s *Service) ListPending(ctx context.Context, uid string) ([]PendingDebt, float64, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.ride_id::text, p.id::text, COALESCE(r.driver_id, ''), COALESCE(u.name, ''),
		       COALESCE(d.profile_photo, u.profile_photo, ''),
		       COALESCE(p.payment_method::text, 'cash'), p.amount, p.tip, p.total,
		       COALESCE(lo.address, ''), COALESCE(ld.address, ''),
		       p.status::text, p.created_at
		FROM public.payments p
		JOIN public.rides r ON r.id = p.ride_id
		LEFT JOIN public.users u ON u.id = r.driver_id
		LEFT JOIN public.drivers d ON d.user_id = r.driver_id AND d.deleted_at IS NULL
		LEFT JOIN public.ride_locations lo ON lo.ride_id = p.ride_id AND lo.location_type = 'origin'
		LEFT JOIN public.ride_locations ld ON ld.ride_id = p.ride_id AND ld.location_type = 'destination'
		WHERE r.client_id = $1
		  AND p.status IN ('pending', 'pending_confirmation', 'payment_in_progress')
		  AND p.deleted_at IS NULL
		ORDER BY p.created_at DESC`, uid)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []PendingDebt{}
	var total float64
	for rows.Next() {
		var d PendingDebt
		if err := rows.Scan(&d.RideID, &d.PaymentID, &d.DriverID, &d.DriverName, &d.DriverPhoto,
			&d.PaymentMethod, &d.Amount, &d.Tip, &d.Total, &d.Origin, &d.Destination,
			&d.Status, &d.CreatedAt); err != nil {
			return nil, 0, err
		}
		total += d.Total
		out = append(out, d)
	}
	return out, total, rows.Err()
}

// PuntoExpressWebhook — puntoExpressRechargeWebhookHttp v1: recarga externa.
// Idempotente por external_transaction_id (unique). Balance en TX + outbox +
// proyección de wallet a DATA-MAIN_drivers (syncRealtimeWallet v1).
func (s *Service) PuntoExpressWebhook(ctx context.Context, driverUID string, amount float64, reference, txnID string, metadata json.RawMessage) (already bool, err error) {
	if driverUID == "" {
		return false, apperr.New(400, "driverId-required")
	}
	if amount <= 0 {
		return false, apperr.New(400, "invalid-amount")
	}
	// Idempotencia: si la txn externa ya existe, ya fue procesada.
	if txnID != "" {
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM public.driver_wallet_movements WHERE external_transaction_id = $1)`,
			txnID).Scan(&exists); err != nil {
			return false, err
		}
		if exists {
			return true, nil
		}
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var before float64
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(current_recharge_balance, 0) FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL FOR UPDATE`, driverUID).Scan(&before)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, apperr.New(404, "driver not found")
	}
	if err != nil {
		return false, err
	}
	after := before + amount
	if _, err := tx.Exec(ctx, `
		INSERT INTO public.driver_wallet_movements
			(driver_id, movement_type, source, amount, balance_before, balance_after,
			 external_reference, external_transaction_id, metadata)
		VALUES ($1, 'recharge', 'puntoexpress_webhook', $2, $3, $4,
		        NULLIF($5,''), NULLIF($6,''), $7)`,
		driverUID, amount, before, after, reference, txnID, metadata); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE public.drivers SET current_recharge_balance = $2 WHERE user_id = $1`,
		driverUID, after); err != nil {
		return false, err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "driver.recharge", AggregateType: "driver", AggregateID: driverUID,
		Payload: map[string]any{
			"driverId": driverUID, "amount": amount, "balance": after,
			"source": "puntoexpress_webhook", "externalTransactionId": txnID,
		},
	}); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	// Proyección wallet (syncRealtimeWallet v1 → DATA-MAIN_drivers).
	if s.fs != nil {
		_, _ = s.fs.Collection(fs.ColDrivers).Doc(driverUID).Set(ctx, map[string]any{
			"rechargeBalance":    after,
			"lastMovementType":   "recharge",
			"lastMovementAmount": amount,
			"walletUpdatedAt":    firestore.ServerTimestamp,
		}, firestore.MergeAll)
	}
	return false, nil
}

// ChangePaymentMethod — changePaymentMethod v1: cliente cambia cash↔card
// sobre el pago pendiente del viaje (antes de liquidarlo).
func (s *Service) ChangePaymentMethod(ctx context.Context, rideID, uid, method, requestID string) (*Payment, error) {
	switch method {
	case "cash", "card":
	default:
		return nil, apperr.New(400, "paymentMethod debe ser cash|card")
	}
	var err error
	if rideID, err = s.resolveRideID(ctx, rideID); err != nil {
		return nil, err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var pay Payment
	err = tx.QueryRow(ctx, `
		UPDATE public.payments p
		SET payment_method = $3,
		    payment_provider = CASE WHEN $3 = 'cash' THEN 'cash' ELSE p.payment_provider END,
		    updated_at = NOW()
		FROM public.rides r
		WHERE p.ride_id = r.id AND r.id = $1::uuid AND r.client_id = $2
		  AND p.status IN ('pending', 'pending_confirmation', 'payment_in_progress', 'in_progress')
		  AND p.deleted_at IS NULL
		RETURNING p.id, p.ride_id, p.amount, p.tip, p.commission,
		          p.commission_rate_applied, p.total, p.payment_method,
		          p.payment_provider, p.status, p.commission_status, p.paid_at`,
		rideID, uid, method,
	).Scan(&pay.ID, &pay.RideID, &pay.Amount, &pay.Tip, &pay.Commission,
		&pay.CommissionRateApplied, &pay.Total, &pay.PaymentMethod,
		&pay.PaymentProvider, &pay.Status, &pay.CommissionStatus, &pay.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "no pending payment for this ride")
	}
	if err != nil {
		return nil, err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "payment.method_changed", AggregateType: "payment", AggregateID: pay.ID,
		RequestID: requestID,
		Payload:   map[string]any{"rideId": rideID, "paymentMethod": method, "uid": uid},
	}); err != nil {
		return nil, err
	}
	return &pay, tx.Commit(ctx)
}

// GetByRide — getPaymentDetails v1: último pago del viaje (participante).
func (s *Service) GetByRide(ctx context.Context, rideID, uid, role string) (*Payment, error) {
	staff := role == "admin" || role == "operator"
	resolvedID, err := s.resolveRideID(ctx, rideID)
	if err != nil {
		return nil, err
	}
	var p Payment
	err = s.pool.QueryRow(ctx, `
		SELECT p.id, p.ride_id, p.amount, p.tip, p.commission,
		       p.commission_rate_applied, p.total, p.payment_method,
		       p.payment_provider, p.status, p.commission_status, p.paid_at
		FROM public.payments p
		JOIN public.rides r ON r.id = p.ride_id
		WHERE p.ride_id = $1::uuid AND p.deleted_at IS NULL
		  AND ($3 OR r.client_id = $2 OR r.driver_id = $2 OR r.follower_driver_id = $2)
		ORDER BY p.created_at DESC LIMIT 1`, resolvedID, uid, staff,
	).Scan(&p.ID, &p.RideID, &p.Amount, &p.Tip, &p.Commission,
		&p.CommissionRateApplied, &p.Total, &p.PaymentMethod,
		&p.PaymentProvider, &p.Status, &p.CommissionStatus, &p.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "payment not found")
	}
	return &p, err
}
