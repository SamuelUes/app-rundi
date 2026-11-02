package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	firestore "cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
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

// ConfirmCash — el conductor confirma recepción del efectivo (antes: callable
// confirmCashPayment). Solo el conductor asignado; solo pagos 'pending'.
// Doc §7.1: trip completed ≠ payment settled — esto liquida la obligación.
func (s *Service) ConfirmCash(ctx context.Context, rideID, driverUID, requestID string) (*Payment, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

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
		SET total_earnings = COALESCE(total_earnings, 0) + ($2 - $3)
		WHERE user_id = $1`, driverUID, p.Total, p.Commission); err != nil {
		return nil, err
	}

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
// v1): status 'pending' → 'pending_confirmation' + tip (≤1000 C$ como v1).
func (s *Service) RegisterCash(ctx context.Context, rideID, uid string, tip float64, requestID string) (*Payment, error) {
	if tip < 0 || tip > 1000 {
		return nil, apperr.New(400, "tip debe ser 0..1000")
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
		SET status = 'pending_confirmation', tip = $3
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
		rideID, uid, tip,
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

// GenerateCashCode — conductor genera código de 4 dígitos (generateCashCode
// v1): marca authentication_method='code' y publica el código en
// REALTIME_payments_live/{rideId} (el cliente lo lee del doc vivo).
func (s *Service) GenerateCashCode(ctx context.Context, rideID, driverUID, code string, writeLive func(map[string]any) error) (string, error) {
	var driverID *string
	err := s.pool.QueryRow(ctx,
		`SELECT driver_id FROM public.rides WHERE id = $1::uuid`, rideID).Scan(&driverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", apperr.New(404, "ride not found")
		}
		return "", err
	}
	if driverID == nil || *driverID != driverUID {
		return "", apperr.ErrForbidden
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE public.payments SET authentication_method = 'code'
		WHERE ride_id = $1 AND status IN ('pending', 'pending_confirmation')`,
		rideID); err != nil {
		return "", err
	}
	if err := writeLive(map[string]any{
		"code":              code,
		"codeGeneratedAt":   time.Now().UnixMilli(),
		"codeGeneratedBy":   "driver",
		"codeGeneratedById": driverUID,
	}); err != nil {
		return "", err
	}
	return code, nil
}

// CancelCash — participante cancela el pago pendiente (cancelCashPayment v1).
func (s *Service) CancelCash(ctx context.Context, rideID, uid, reason, requestID string) (*Payment, error) {
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
	RideID    string    `json:"rideId"`
	PaymentID string    `json:"paymentId"`
	Amount    float64   `json:"amount"`
	Tip       float64   `json:"tip"`
	Total     float64   `json:"total"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *Service) ListPending(ctx context.Context, uid string) ([]PendingDebt, float64, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.ride_id::text, p.id::text, p.amount, p.tip, p.total,
		       p.status::text, p.created_at
		FROM public.payments p
		JOIN public.rides r ON r.id = p.ride_id
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
		if err := rows.Scan(&d.RideID, &d.PaymentID, &d.Amount, &d.Tip,
			&d.Total, &d.Status, &d.CreatedAt); err != nil {
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
	var p Payment
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.ride_id, p.amount, p.tip, p.commission,
		       p.commission_rate_applied, p.total, p.payment_method,
		       p.payment_provider, p.status, p.commission_status, p.paid_at
		FROM public.payments p
		JOIN public.rides r ON r.id = p.ride_id
		WHERE p.ride_id = $1::uuid AND p.deleted_at IS NULL
		  AND ($3 OR r.client_id = $2 OR r.driver_id = $2 OR r.follower_driver_id = $2)
		ORDER BY p.created_at DESC LIMIT 1`, rideID, uid, staff,
	).Scan(&p.ID, &p.RideID, &p.Amount, &p.Tip, &p.Commission,
		&p.CommissionRateApplied, &p.Total, &p.PaymentMethod,
		&p.PaymentProvider, &p.Status, &p.CommissionStatus, &p.PaidAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "payment not found")
	}
	return &p, err
}
