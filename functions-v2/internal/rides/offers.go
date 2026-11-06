package rides

import (
	"context"
	"errors"
	"fmt"
	"math"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

// ConfirmDriver — cliente confirma un conductor entre los que tienen oferta
// (port de confirmDriver de v1). Requiere:
//   - ride.client_id == uid, status en (requested, driver_offered)
//   - oferta viva en REALTIME_driver_offers/{rideId}_{driverUID} con
//     status pending/accepted, o contraoferta activa de ese conductor en SQL
//   - conductor no 'busy' en REALTIME_drivers_live
//
// Asigna driver_id + status='accepted' + final_fare en TX + outbox ride.accepted.
// Idempotente si ya está asignado al mismo conductor.
func (s *Service) ConfirmDriver(ctx context.Context, rideID, clientUID, driverUID, requestID string) (*Ride, error) {
	// 1. Oferta del conductor (validación previa — fuera de TX).
	offerRef := s.fs.Collection(fs.ColDriverOffers).Doc(rideID + "_" + driverUID)
	offerSnap, offerErr := offerRef.Get(ctx)
	var offerPrice *float64
	hasOffer := false
	if offerErr == nil && offerSnap.Exists() {
		st, _ := offerSnap.Data()["status"].(string)
		hasOffer = st == "pending" || st == "accepted"
		if p, ok := offerSnap.Data()["offeredPrice"].(float64); ok && p > 0 {
			offerPrice = &p
		}
	}

	// 2. Busy check (drivers_live). El frontend marca ocupado como 'on_ride';
	// 'busy' era el nombre v1 — aceptar ambos por tokens/datos en transición.
	if liveSnap, err := s.fs.Collection(fs.ColDriversLive).Doc(driverUID).Get(ctx); err == nil && liveSnap.Exists() {
		if st, _ := liveSnap.Data()["status"].(string); st == "busy" || st == "on_ride" {
			return nil, apperr.New(409, "DRIVER_BUSY")
		}
	}

	// La contraoferta y su precio pertenecen al conductor seleccionado, no al viaje global.
	var negotiated *float64
	err := s.pool.QueryRow(ctx,
		`SELECT offered_price FROM public.ride_offers
		 WHERE ride_id = $1::uuid AND driver_id = $2 AND kind = 'counter_offer' AND status = 'sent'
		 ORDER BY created_at DESC, id DESC LIMIT 1`, rideID, driverUID,
	).Scan(&negotiated)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if !hasOffer && negotiated == nil {
		return nil, apperr.New(409, "driver has no active offer for this ride")
	}
	if negotiated != nil {
		offerPrice = negotiated
	}

	// 4. Idempotencia: ya asignado al mismo driver con estado estable.
	var curDriver *string
	var curStatus string
	_ = s.pool.QueryRow(ctx,
		`SELECT driver_id, status::text FROM public.rides WHERE id = $1::uuid`, rideID,
	).Scan(&curDriver, &curStatus)
	if curDriver != nil && *curDriver == driverUID {
		switch RideStatus(curStatus) {
		case StatusAccepted, StatusDriverOnRoute, StatusDriverArrived,
			StatusInProgress, StatusPendingPayment, StatusCompleted:
			r, err := s.getRide(ctx, rideID)
			return r, err
		}
	}

	// 5. Asignación atómica + tarifa final (misma prioridad que v1:
	//    driverOfferedPrice > clientSuggestedPrice > estimatedPrice).
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Cerco de autorización: el conductor elegido debe seguir con sesión viva
	// dentro de la misma tx que asigna el viaje (coordinado con el barrido de
	// medianoche, que toma el mismo candado del control del conductor).
	if err := requireDriverSession(ctx, tx, driverUID, "driver has no active availability session"); err != nil {
		return nil, err
	}

	r, err := scanRide(tx.QueryRow(ctx, `
		UPDATE public.rides
		SET driver_id = $3,
		    status = 'accepted',
		    driver_offered_price = COALESCE($4, driver_offered_price),
		    final_fare = COALESCE($4, driver_offered_price, client_suggested_price, estimated_price),
		    accepted_at = NOW(),
		    version = version + 1
		WHERE id = $1
		  AND client_id = $2
		  AND status IN ('requested', 'driver_offered')
		  AND (driver_id IS NULL OR driver_id = $3)
		  AND (NOT COALESCE(pricing_snapshot->'featureCodes' ? 'premium', FALSE)
		       OR EXISTS (
		         SELECT 1 FROM public.vehicles v
		         JOIN public.drivers d ON d.id = v.driver_id
		         WHERE d.user_id = $3 AND v.is_active = TRUE AND v.deleted_at IS NULL
		           AND v.id = (SELECT v2.id FROM public.vehicles v2 WHERE v2.driver_id = d.id AND v2.is_active = TRUE AND v2.deleted_at IS NULL ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
		           AND public.vehicle_premium_eligible(v.registration_ocr_year, v.type, NOW())
		       ))
		RETURNING `+rideCols,
		rideID, clientUID, driverUID, offerPrice,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "ride not confirmable (not yours, assigned, or wrong status)")
	}
	if err != nil {
		return nil, fmt.Errorf("confirm update: %w", err)
	}

	// Oferta ganadora → 'accepted' en auditoría (upsert: cubre aceptación sin
	// oferta despachada y la counter_offer 'sent' que pudo originarse).
	if _, err := tx.Exec(ctx, `
		INSERT INTO public.ride_offers (ride_id, driver_id, kind, status, responded_at)
		VALUES ($1::uuid, $2, 'offer', 'accepted', NOW())
		ON CONFLICT (ride_id, driver_id) WHERE kind = 'offer'
		DO UPDATE SET status = 'accepted', responded_at = NOW()`,
		rideID, driverUID); err != nil {
		return nil, fmt.Errorf("confirm offer audit: %w", err)
	}
	if err := cancelOtherOffers(ctx, tx, rideID, driverUID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE public.ride_offers
		SET status = 'accepted', responded_at = NOW()
		WHERE ride_id = $1::uuid AND driver_id = $2
		  AND kind = 'counter_offer' AND status = 'sent'`,
		rideID, driverUID); err != nil {
		return nil, fmt.Errorf("confirm counter_offer audit: %w", err)
	}

	payload := map[string]any{
		"rideId": r.ID, "firebaseRideId": r.FirebaseRideID,
		"clientId": r.ClientID, "driverId": driverUID,
		"status": r.Status, "version": r.Version,
		"acceptedAt": r.AcceptedAt, "finalFare": r.FinalFare,
		"confirmedBy": "client",
	}
	evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type:          "ride.accepted",
		AggregateType: "ride",
		AggregateID:   r.ID,
		RequestID:     requestID,
		Payload:       payload,
	})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	s.publishFastPath(ctx, "ride.accepted", r.ID, evID, payload)

	// 6. Marcar la oferta ganadora (post-commit, no bloqueante).
	_, _ = offerRef.Set(ctx, map[string]any{
		"status":    "accepted",
		"updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return r, nil
}

// RejectRide — conductor rechaza/retira su oferta (port de rejectRide de v1).
// Las contraofertas se cierran en SQL y se proyectan mediante el outbox.
func (s *Service) RejectRide(ctx context.Context, rideID, driverUID, reason string) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Precio de referencia para el registro (cliente > estimado).
	var clientSuggested, estimated *float64
	var version int64
	err = tx.QueryRow(ctx, `
		UPDATE public.rides SET version = version + 1
		WHERE id = $1::uuid
		RETURNING client_suggested_price, estimated_price, version`, rideID,
	).Scan(&clientSuggested, &estimated, &version)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.New(404, "ride not found")
		}
		return err
	}
	priceAtRejection := clientSuggested
	if priceAtRejection == nil || *priceAtRejection <= 0 {
		priceAtRejection = estimated
	}
	if reason == "" {
		reason = "not_interested"
	}
	var hasCounterOffer bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.ride_offers
			WHERE ride_id = $1::uuid AND driver_id = $2 AND kind = 'counter_offer')`,
		rideID, driverUID).Scan(&hasCounterOffer); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE public.ride_offers
		SET status = 'rejected', responded_at = NOW()
		WHERE ride_id = $1::uuid AND driver_id = $2 AND status = 'sent'`,
		rideID, driverUID); err != nil {
		return err
	}
	payload := map[string]any{"rideId": rideID, "version": version}
	evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type: "ride.offer_rejected", AggregateType: "ride", AggregateID: rideID, Payload: payload,
	})
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	s.publishFastPath(ctx, "ride.offer_rejected", rideID, evID, payload)
	if hasCounterOffer {
		return nil
	}
	_, err = s.fs.Collection(fs.ColDriverOffers).Doc(rideID+"_"+driverUID).Set(ctx, map[string]any{
		"rideId": rideID, "driverId": driverUID, "status": "rejected", "reason": reason,
		"priceAtRejection": priceAtRejection, "rejectedAt": firestore.ServerTimestamp,
		"updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err
}

func (s *Service) getRide(ctx context.Context, rideID string) (*Ride, error) {
	return scanRide(s.pool.QueryRow(ctx,
		`SELECT `+rideCols+` FROM public.rides WHERE id = $1::uuid`, rideID))
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const r = 6371.0
	toRad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat, dLon := toRad(lat2-lat1), toRad(lon2-lon1)
	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * r * math.Asin(math.Sqrt(h))
}
