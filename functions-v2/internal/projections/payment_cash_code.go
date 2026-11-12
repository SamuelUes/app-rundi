package projections

import (
	"context"
	"errors"
	"fmt"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/fs"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// projectPaymentCashCode — proyecta el código de efectivo a
// REALTIME_payments_live/{liveId}/private/cash. Solo el cliente lo lee
// (reglas: clientId == uid); el conductor lo digita en confirm-cash. El
// código solo se expone mientras el pago cash siga pendiente.
func projectPaymentCashCode(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, paymentID string) error {
	var rideID, firebaseID, clientID, payStatus, method *string
	var code *string
	var revision int64
	err := pool.QueryRow(ctx, `
		SELECT pay.ride_id::text, r.firebase_ride_id, r.client_id,
		       pay.status::text, pay.payment_method::text, c.code, pay.revision
		FROM public.payments pay
		JOIN public.rides r ON r.id = pay.ride_id
		LEFT JOIN public.payment_cash_codes c ON c.ride_id = pay.ride_id
		WHERE pay.id = $1::uuid`, paymentID).
		Scan(&rideID, &firebaseID, &clientID, &payStatus, &method, &code, &revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read cash code projection: %w", err)
	}
	if rideID == nil || clientID == nil {
		return nil
	}
	liveID := *rideID
	if firebaseID != nil && *firebaseID != "" {
		liveID = *firebaseID
	}
	data := map[string]any{"clientId": *clientID, "version": revision, "code": nil}
	if code != nil && method != nil && *method == "cash" &&
		payStatus != nil && (*payStatus == "pending" || *payStatus == "pending_confirmation") {
		data["code"] = *code
	}
	ref := c.Collection(fs.ColPaymentsLive).Doc(liveID).Collection("private").Doc("cash")
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			if previous, ok := snap.Data()["version"].(int64); ok && previous >= revision {
				return nil
			}
		}
		return tx.Set(ref, data)
	})
}
