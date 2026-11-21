package rides

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"regexp"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/cashcode"
	"github.com/rundi/functions-v2/internal/compliance"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
	"github.com/rundi/functions-v2/internal/projections"
)

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

// publishFastPath — proyección inline post-commit: trips_live refleja el
// estado en ~ms en vez de esperar el cold-start del consumer (~15s). El
// outbox sigue siendo la autoridad durable: el consumer re-procesa el mismo
// evento y la dedup por appliedVersion lo deja como no-op.
func (s *Service) publishFastPath(ctx context.Context, evType, aggregateID, eventID string, payload any) {
	if s.fs == nil {
		return
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	go func() {
		pctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		if _, err := projections.Publish(pctx, s.pool, s.fs, projections.Event{
			EventID:       eventID,
			EventType:     evType,
			AggregateType: "ride",
			AggregateID:   aggregateID,
			Payload:       raw,
		}); err != nil {
			slog.Warn("fast-path projection failed; consumer sweep cubre", "ride", aggregateID, "err", err)
		}
	}()
}

// AcceptRide — el conductor acepta el viaje/precio vigente. NO asigna:
// queda como contraoferta vinculante 'sent' al precio acordado y el viaje
// pasa a 'driver_offered'. Solo el cliente asigna (ConfirmDriver →
// accepted), así trips_live/oferta 'accepted' siempre significan
// "cliente confirmó". La asignación directa de v1 dejaba el viaje
// 'accepted' sin confirmación del cliente.
func (s *Service) AcceptRide(ctx context.Context, rideID, driverUID, requestID string, offeredPrice *float64) (*Ride, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Precio acordado: param explícito > sugerencia del cliente > su
	// contraoferta previa > la estimada (el driver acepta la demanda del
	// cliente; ConfirmDriver invierte la prioridad porque el cliente elige
	// la oferta del driver).
	var agreed, estimated, suggested *float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE($2::float8, client_suggested_price, driver_offered_price, estimated_price),
		       estimated_price, client_suggested_price
		FROM public.rides WHERE id = $1::uuid FOR UPDATE`,
		rideID, offeredPrice,
	).Scan(&agreed, &estimated, &suggested); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(404, "ride not found")
		}
		return nil, fmt.Errorf("accept price lookup: %w", err)
	}
	if agreed == nil || *agreed <= 0 {
		return nil, apperr.New(409, "ride has no acceptable price")
	}
	if offeredPrice != nil && (suggested == nil || *offeredPrice != *suggested) &&
		!validNegotiatedPrice(*offeredPrice, estimated) {
		return nil, apperr.New(400, "offeredPrice outside allowed range")
	}
	if err := requireDriverSession(ctx, tx, driverUID, "only drivers may accept a ride"); err != nil {
		return nil, err
	}

	r, evID, payload, err := s.driverOfferTx(ctx, tx, rideID, driverUID, *agreed, requestID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	s.publishFastPath(ctx, "ride.price_offered", r.ID, evID, payload)
	return r, nil
}

// requireDriverSession — cerco SQL de nuevas aceptaciones/asignaciones: el
// conductor debe tener una sesión de disponibilidad viva (autorizada hoy en
// Nicaragua, sin señales de compliance cambiadas). Resuelve drivers.id desde
// el user_id y verifica bajo FOR SHARE dentro de la misma tx del negocio.
// Viajes ya asignados NO pasan por aquí: pueden continuar tras medianoche.
func requireDriverSession(ctx context.Context, tx pgx.Tx, driverUID, notDriverMsg string) error {
	var driverID string
	err := tx.QueryRow(ctx,
		`SELECT id::text FROM public.drivers WHERE user_id = $1 AND deleted_at IS NULL`,
		driverUID).Scan(&driverID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(403, notDriverMsg)
	}
	if err != nil {
		return err
	}
	if _, err := compliance.CheckDriverSession(ctx, tx, driverID); err != nil {
		switch {
		case errors.Is(err, compliance.ErrReactivationRequired),
			errors.Is(err, compliance.ErrSessionNotLive),
			errors.Is(err, compliance.ErrSessionSignalsStale):
			return apperr.New(409, "DRIVER_REACTIVATION_REQUIRED")
		}
		return err
	}
	return nil
}

func cancelOtherOffers(ctx context.Context, tx pgx.Tx, rideID, driverID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE public.ride_offers SET status='canceled', responded_at=NOW()
		WHERE ride_id=$1::uuid AND driver_id<>$2 AND kind='offer' AND status='sent'`,
		rideID, driverID)
	if err != nil {
		return fmt.Errorf("close other offers: %w", err)
	}
	return nil
}

// TransitionRide — patrón para transiciones siguientes (startRide, completeRide...):
// valida máquina de estados + versión esperada + outbox, en una TX.
func (s *Service) TransitionRide(ctx context.Context, rideID, actorUID string, from, to RideStatus, pickupCode, requestID string) (*Ride, error) {
	if !CanTransition(from, to) || !((from == StatusAccepted && to == StatusDriverOnRoute) ||
		(from == StatusDriverOnRoute && to == StatusDriverArrived) ||
		(from == StatusDriverArrived && to == StatusInProgress)) {
		return nil, apperr.New(409, fmt.Sprintf("invalid transition %s→%s", from, to))
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var driverID *string
	var currentStatus RideStatus
	var rideType *string
	err = tx.QueryRow(ctx, `SELECT driver_id, status::text, ride_type::text FROM public.rides WHERE id=$1::uuid FOR UPDATE`, rideID).
		Scan(&driverID, &currentStatus, &rideType)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "ride not found")
	}
	if err != nil {
		return nil, err
	}
	if driverID == nil || *driverID != actorUID {
		return nil, apperr.ErrForbidden
	}
	if currentStatus != from {
		return nil, apperr.New(409, "conflicting state")
	}
	if to == StatusInProgress {
		var expected string
		var lockedUntil *time.Time
		err = tx.QueryRow(ctx, `SELECT code, locked_until FROM public.ride_pickup_codes WHERE ride_id=$1::uuid FOR UPDATE`, rideID).
			Scan(&expected, &lockedUntil)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(409, "pickup code unavailable")
		}
		if err != nil {
			return nil, err
		}
		if lockedUntil != nil && lockedUntil.After(time.Now()) {
			return nil, apperr.New(429, "pickup code temporarily locked")
		}
		if pickupCode != expected {
			if _, err := tx.Exec(ctx, `
				UPDATE public.ride_pickup_codes
				SET failed_attempts = CASE WHEN locked_until <= NOW() THEN 1 ELSE failed_attempts + 1 END,
				    locked_until = CASE WHEN (CASE WHEN locked_until <= NOW() THEN 1 ELSE failed_attempts + 1 END) >= 5
				                        THEN NOW() + interval '5 minutes' ELSE NULL END
				WHERE ride_id=$1::uuid`, rideID); err != nil {
				return nil, err
			}
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
			return nil, apperr.New(400, "incorrect pickup code")
		}
		if rideType != nil && *rideType == "designated_driver" {
			var evidence bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM public.designated_driver_inspections
				WHERE ride_id=$1::uuid AND driver_id=$2 AND status='completed'
				  AND vehicle_front_photo IS NOT NULL AND vehicle_rear_photo IS NOT NULL
				  AND interior_front_photo IS NOT NULL AND interior_rear_photo IS NOT NULL
			)`, rideID, actorUID).Scan(&evidence); err != nil {
				return nil, err
			}
			if !evidence {
				return nil, apperr.New(409, "designated ride evidence required")
			}
		}
	}

	var r Ride
	err = tx.QueryRow(ctx, `
		UPDATE public.rides
		SET status = $3::public.ride_status, version = version + 1,
		    started_at = CASE WHEN $3::public.ride_status = 'in_progress' THEN NOW() ELSE started_at END
		WHERE id = $1 AND status = $2
		RETURNING id, firebase_ride_id, client_id, driver_id, status, version,
		          estimated_price, final_fare, requested_at, accepted_at`,
		rideID, from, to,
	).Scan(&r.ID, &r.FirebaseRideID, &r.ClientID, &r.DriverID, &r.Status,
		&r.Version, &r.EstimatedPrice, &r.FinalFare, &r.RequestedAt, &r.AcceptedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "conflicting state")
	}
	if err != nil {
		return nil, fmt.Errorf("transition update: %w", err)
	}

	payload := map[string]any{
		"rideId":   r.ID,
		"from":     from,
		"to":       to,
		"actor":    actorUID,
		"version":  r.Version,
		"clientId": r.ClientID,
		"driverId": r.DriverID,
	}
	evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type:          "ride.status_changed",
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
	s.publishFastPath(ctx, "ride.status_changed", r.ID, evID, payload)
	return &r, nil
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ResolveRideID — el path param {rideId} puede ser rides.id (uuid SQL) o
// firebase_ride_id (doc vivo REALTIME_trips_live/{id}); normaliza al uuid SQL.
func (s *Service) ResolveRideID(ctx context.Context, rideID string) (string, error) {
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

const rideCols = `id, firebase_ride_id, client_id, driver_id, status, version,
	estimated_price, final_fare, requested_at, accepted_at`

func scanRide(row pgx.Row) (*Ride, error) {
	var r Ride
	err := row.Scan(&r.ID, &r.FirebaseRideID, &r.ClientID, &r.DriverID, &r.Status,
		&r.Version, &r.EstimatedPrice, &r.FinalFare, &r.RequestedAt, &r.AcceptedAt)
	return &r, err
}

// RequestRide — cliente crea viaje (status='requested') + outbox ride.requested.
func (s *Service) RequestRide(ctx context.Context, clientUID, requestID string, in RequestRideRequest) (*Ride, error) {
	if in.ClientSuggestedPrice != nil && !validNegotiatedPrice(*in.ClientSuggestedPrice, in.EstimatedPrice) {
		return nil, apperr.New(400, "client suggested price outside allowed range")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var pricingSnapshot *string
	if len(in.SelectedFeatureCodes) > 0 {
		raw, merr := json.Marshal(map[string]any{"featureCodes": in.SelectedFeatureCodes})
		if merr != nil {
			return nil, fmt.Errorf("pricing snapshot: %w", merr)
		}
		s := string(raw)
		pricingSnapshot = &s
	}

	r, err := scanRide(tx.QueryRow(ctx, `
		INSERT INTO public.rides (
			client_id, firebase_ride_id, ride_type, vehicle_type,
			estimated_distance, estimated_duration, estimated_price,
			client_suggested_price, passengers, notes, payment_type,
			service_id, origin_location_id, destination_location_id,
			client_vehicle_photo, designated_driver_vehicle, pricing_snapshot,
			service_area_id, biometric_acceptance_required, biometric_acceptance_type,
			biometric_acceptance_verified, biometric_acceptance_at, status
		) VALUES (
			$1, $2, COALESCE(NULLIF($3, '')::public.ride_type, 'normal'), COALESCE(NULLIF($4, ''), 'auto'),
			$5, $6, $7, $8, COALESCE($9, 1), NULLIF($10, ''),
			COALESCE(NULLIF($11, '')::public.ride_payment_type, 'cash'),
			COALESCE((SELECT id FROM public.services WHERE code = NULLIF($12, '')),
				CASE WHEN NULLIF($12, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
					THEN NULLIF($12, '')::uuid END),
			$13, $14, NULLIF($15, ''),
			NULLIF($16, '')::public.designated_driver_vehicle, $17::jsonb,
			NULLIF($18, ''),
			$19, NULLIF($20, '')::public.biometric_type, $21, $22,
			'requested'
		) RETURNING `+rideCols,
		clientUID, in.FirebaseRideID, in.RideType, in.VehicleType,
		in.EstimatedDistance, in.EstimatedDuration, in.EstimatedPrice,
		in.ClientSuggestedPrice, in.Passengers, in.Notes, in.PaymentType,
		in.ServiceID, in.OriginLocationID, in.DestinationLocationID,
		in.ClientVehiclePhoto, in.DesignatedDriverVehicle, pricingSnapshot,
		in.ServiceAreaID, in.BiometricAcceptanceRequired,
		NormalizeBiometricType(in.BiometricAcceptanceType),
		in.BiometricAcceptanceVerified, ParseBiometricAt(in.BiometricAcceptanceAt),
	))
	if err != nil {
		return nil, fmt.Errorf("insert ride: %w", err)
	}

	// Ruta contratada: origin order 0, waypoints 1..n, destination last; luego
	// se pueblan origin_location_id/destination_location_id en la misma TX.
	var originLocID, destLocID *string
	if in.Origin != nil {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'origin', 0, $2, $3, NULLIF($4, ''))
			RETURNING id::text`, r.ID, in.Origin.Lat, in.Origin.Lng, in.Origin.Address).Scan(&id); err != nil {
			return nil, fmt.Errorf("insert origin location: %w", err)
		}
		originLocID = &id
	}
	for i, wp := range in.ExtraDestinations {
		if _, err := tx.Exec(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'waypoint', $2, $3, $4, NULLIF($5, ''))`,
			r.ID, i+1, wp.Lat, wp.Lng, wp.Address); err != nil {
			return nil, fmt.Errorf("insert waypoint location: %w", err)
		}
	}
	if in.Destination != nil {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'destination', $2, $3, $4, NULLIF($5, ''))
			RETURNING id::text`, r.ID, len(in.ExtraDestinations)+1,
			in.Destination.Lat, in.Destination.Lng, in.Destination.Address).Scan(&id); err != nil {
			return nil, fmt.Errorf("insert destination location: %w", err)
		}
		destLocID = &id
	}
	if originLocID != nil || destLocID != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE public.rides
			SET origin_location_id = COALESCE($2::uuid, origin_location_id),
			    destination_location_id = COALESCE($3::uuid, destination_location_id)
			WHERE id = $1::uuid`, r.ID, originLocID, destLocID); err != nil {
			return nil, fmt.Errorf("link ride locations: %w", err)
		}
	}

	payload := map[string]any{
		"rideId": r.ID, "firebaseRideId": r.FirebaseRideID,
		"clientId": clientUID, "status": r.Status, "version": r.Version,
		"rideType": in.RideType, "vehicleType": in.VehicleType,
		"estimatedPrice": in.EstimatedPrice, "paymentType": in.PaymentType,
		"requestedAt": r.RequestedAt,
		// contexto de matching para el consumer (dispatch de ofertas)
		"originLat": in.OriginLat, "originLng": in.OriginLng,
		"serviceAreaId": in.ServiceAreaID, "serviceCode": in.ServiceCode,
	}
	evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type:          "ride.requested",
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
	s.publishFastPath(ctx, "ride.requested", r.ID, evID, payload)
	return r, nil
}

// CancelRide — cliente o conductor cancela. canceled_by validado por CHECK.
func (s *Service) CancelRide(ctx context.Context, rideID, actorUID, actorRole, reason, requestID string) (*Ride, error) {
	var canceledBy string
	switch actorRole {
	case "driver", "designated_driver":
		canceledBy = "driver"
	default:
		canceledBy = "client"
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	r, err := scanRide(tx.QueryRow(ctx, `
		UPDATE public.rides
		SET status = 'canceled', cancel_reason = NULLIF($4, ''),
		    canceled_by = $3, canceled_at = NOW(), version = version + 1
		WHERE id = $1
		  AND status NOT IN ('completed', 'canceled', 'rating_completed', 'rating_skipped')
		  AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2)
		RETURNING `+rideCols,
		rideID, actorUID, canceledBy, reason,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		// Cancelación idempotente: si ya está 'canceled' y el actor es
		// participante, responde el estado actual — el retry/doble-tap del
		// cliente no es un error (la proyección a trips_live tarda y la UI
		// puede intentar cancelar dos veces).
		if existing, qerr := scanRide(s.pool.QueryRow(ctx, `
			SELECT `+rideCols+` FROM public.rides
			WHERE id = $1 AND status = 'canceled'
			  AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2)`,
			rideID, actorUID)); qerr == nil {
			return existing, nil
		}
		return nil, apperr.New(409, "ride not cancelable or not a participant")
	}
	if err != nil {
		return nil, fmt.Errorf("cancel: %w", err)
	}

	// Cierra las ofertas vivas como 'canceled' (misma TX que la cancelación).
	if _, err := tx.Exec(ctx, `
		UPDATE public.ride_offers
		SET status = 'canceled', responded_at = NOW()
		WHERE ride_id = $1::uuid AND status = 'sent'`,
		rideID); err != nil {
		return nil, fmt.Errorf("cancel offers: %w", err)
	}

	payload := map[string]any{
		"rideId": r.ID, "firebaseRideId": r.FirebaseRideID,
		"clientId": r.ClientID, "driverId": r.DriverID,
		"status": r.Status, "version": r.Version,
		"canceledBy": canceledBy, "reason": reason,
	}
	evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type:          "ride.canceled",
		AggregateType: "ride",
		AggregateID:   r.ID,
		RequestID:     requestID,
		Payload:       payload,
	})
	if err != nil {
		return nil, err
	}
	if canceledBy == "client" {
		reasonCodes := cancellationReasonCodes(reason)
		if len(reasonCodes) == 0 && strings.TrimSpace(reason) == "" {
			reasonCodes = []string{"skipped"}
		}
		if len(reasonCodes) > 0 {
			if err := outbox.Insert(ctx, tx, outbox.Event{
				Type: "analytics.ride_canceled", AggregateType: "ride", AggregateID: r.ID,
				RequestID: requestID, Payload: map[string]any{"reasonCodes": strings.Join(reasonCodes, ",")},
			}); err != nil {
				return nil, err
			}
		}
	}
	// Si había conductor asignado su ocupación termina: la proyección decide
	// online (sesión aún viva) u offline (vencida/revocada) según drivers_live.
	if r.DriverID != nil && *r.DriverID != "" {
		var driverUUID string
		err := tx.QueryRow(ctx,
			`SELECT id::text FROM public.drivers WHERE user_id = $1 AND deleted_at IS NULL`,
			*r.DriverID).Scan(&driverUUID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		if driverUUID != "" {
			if _, err := outbox.InsertReturning(ctx, tx, outbox.Event{
				Type: "driver.ride_finished", AggregateType: "driver", AggregateID: driverUUID,
				RequestID: requestID,
				Payload: map[string]any{
					"driverUid": *r.DriverID, "driverId": driverUUID, "rideId": r.ID,
				},
			}); err != nil {
				return nil, err
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	s.publishFastPath(ctx, "ride.canceled", r.ID, evID, payload)
	return r, nil
}

// cancellationReasonCodes extrae códigos válidos de `reason` (acepta lista
// separada por comas — el cliente puede seleccionar varias casillas). Deduped,
// orden preservado; texto libre no produce códigos.
func cancellationReasonCodes(reason string) []string {
	var codes []string
	for _, part := range strings.Split(reason, ",") {
		code := strings.TrimSpace(part)
		switch code {
		case "wait_too_long", "price_too_high", "plans_changed", "wrong_details", "other", "skipped":
			for _, seen := range codes {
				if seen == code {
					code = ""
					break
				}
			}
			if code != "" {
				codes = append(codes, code)
			}
		}
	}
	return codes
}

// NegotiatePrice — negociación por rol del caller:
//   - cliente: actualiza client_suggested_price (contraoferta al driver).
//   - conductor: inserta su counter_offer + status driver_offered.
//
// La app del cliente usa el mismo endpoint /negotiate — sin la rama de
// cliente el INSERT en ride_offers violaba la FK driver_id → 500.
func validNegotiatedPrice(price float64, estimated *float64) bool {
	if math.IsNaN(price) || math.IsInf(price, 0) || price < 1 || price > 100000 {
		return false
	}
	if estimated == nil || *estimated <= 0 {
		return true
	}
	return price >= math.Max(1, *estimated)
}

func (s *Service) NegotiatePrice(ctx context.Context, rideID, driverUID string, price float64, requestID string) (*Ride, error) {
	if !validNegotiatedPrice(price, nil) {
		return nil, apperr.New(400, "offeredPrice outside allowed range")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Rol del caller: si uid es el cliente del viaje, ajusta su precio
	// sugerido sin tocar status ni ride_offers (driver_id referencia
	// drivers — la fila del cliente violaría la FK).
	var clientID string
	var estimatedPrice *float64
	if err := tx.QueryRow(ctx,
		`SELECT client_id, estimated_price FROM public.rides WHERE id = $1::uuid FOR UPDATE`, rideID,
	).Scan(&clientID, &estimatedPrice); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(404, "ride not found")
		}
		return nil, err
	}
	if !validNegotiatedPrice(price, estimatedPrice) {
		return nil, apperr.New(400, "offeredPrice outside allowed range")
	}

	if clientID == driverUID {
		r, err := scanRide(tx.QueryRow(ctx, `
			UPDATE public.rides
			SET client_suggested_price = $2, version = version + 1
			WHERE id = $1
			  AND status IN ('requested', 'driver_offered')
			  AND driver_id IS NULL
			RETURNING `+rideCols, rideID, price))
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(409, "ride no longer negotiable")
		}
		if err != nil {
			return nil, fmt.Errorf("negotiate client price: %w", err)
		}
		payload := map[string]any{
			"rideId": r.ID, "firebaseRideId": r.FirebaseRideID,
			"clientId":             r.ClientID,
			"clientSuggestedPrice": price, "status": r.Status, "version": r.Version,
		}
		evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
			Type: "ride.price_suggested", AggregateType: "ride", AggregateID: r.ID,
			RequestID: requestID, Payload: payload,
		})
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		s.publishFastPath(ctx, "ride.price_suggested", r.ID, evID, payload)
		return r, nil
	}

	// Conductor: exige fila drivers — sin ella el INSERT en ride_offers
	// viola la FK con un 500 opaco — y una sesión de disponibilidad viva.
	if err := requireDriverSession(ctx, tx, driverUID, "only ride client or drivers may negotiate"); err != nil {
		return nil, err
	}

	r, evID, payload, err := s.driverOfferTx(ctx, tx, rideID, driverUID, price, requestID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	s.publishFastPath(ctx, "ride.price_offered", r.ID, evID, payload)
	return r, nil
}

// driverOfferTx — UPDATE rides → 'driver_offered' al precio dado (gates de
// features incluidos) + counter_offer 'sent' append + outbox
// ride.price_offered. Comparten NegotiatePrice (precio explícito) y
// AcceptRide (precio resuelto server-side). La asignación NO ocurre aquí:
// solo el cliente asigna vía ConfirmDriver.
func (s *Service) driverOfferTx(ctx context.Context, tx pgx.Tx, rideID, driverUID string, price float64, requestID string) (*Ride, string, map[string]any, error) {
	r, err := scanRide(tx.QueryRow(ctx, `
		UPDATE public.rides
		SET driver_offered_price = $3, status = 'driver_offered',
		    version = version + 1
		WHERE id = $1
		  AND status IN ('requested', 'driver_offered')
		  AND driver_id IS NULL
		  AND (NOT COALESCE(pricing_snapshot->'featureCodes' ? 'senior', FALSE)
		       OR EXISTS (
		         SELECT 1 FROM public.drivers d
		         JOIN public.driver_feature_assignments a ON a.driver_id = d.id
		         JOIN public.features f ON f.id = a.feature_id
		         WHERE d.user_id = $2 AND d.deleted_at IS NULL AND f.code = 'senior'
		           AND a.is_active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW())
		       ))
		  AND (NOT COALESCE(pricing_snapshot->'featureCodes' ? 'premium', FALSE)
		       OR EXISTS (
		         SELECT 1 FROM public.vehicles v
		         JOIN public.drivers d ON d.id = v.driver_id
		         WHERE d.user_id = $2 AND v.is_active = TRUE AND v.deleted_at IS NULL
		           AND v.id = (SELECT v2.id FROM public.vehicles v2 WHERE v2.driver_id = d.id AND v2.is_active = TRUE AND v2.deleted_at IS NULL ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
		           AND public.vehicle_premium_eligible(v.registration_ocr_year, v.type, NOW())
		       ))
		RETURNING `+rideCols,
		rideID, driverUID, price,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", nil, apperr.New(409, "ride no longer negotiable")
	}
	if err != nil {
		return nil, "", nil, fmt.Errorf("negotiate: %w", err)
	}

	// Viaje designado — paridad isRideVehicleCompatible v1: rol designado
	// verificado + clase de vehículo + toggle vivo drivers_live.designatedMode
	// (matching ya lo filtra; esto cubre ofertas que llegaron antes del flag).
	if err := s.requireDesignatedMode(ctx, tx, rideID, driverUID); err != nil {
		return nil, "", nil, err
	}

	// Historial de negociación: cada contraoferta del driver es append libre.
	if _, err := tx.Exec(ctx, `
		INSERT INTO public.ride_offers
			(ride_id, driver_id, kind, status, offered_price, responded_at)
		VALUES ($1::uuid, $2, 'counter_offer', 'sent', $3, NOW())`,
		rideID, driverUID, price); err != nil {
		return nil, "", nil, fmt.Errorf("negotiate offer audit: %w", err)
	}

	payload := map[string]any{
		"rideId": r.ID, "firebaseRideId": r.FirebaseRideID,
		"clientId": r.ClientID, "driverId": driverUID,
		"offeredPrice": price, "status": r.Status, "version": r.Version,
	}
	evID, err := outbox.InsertReturning(ctx, tx, outbox.Event{
		Type:          "ride.price_offered",
		AggregateType: "ride",
		AggregateID:   r.ID,
		RequestID:     requestID,
		Payload:       payload,
	})
	if err != nil {
		return nil, "", nil, err
	}
	return r, evID, payload, nil
}

// requireDesignatedMode — gate dentro de la tx de aceptación/negociación para
// ride_type='designated_driver': designated_role_status verificado + clase de
// vehículo (moto↔moto, misma regla que NotifyProximity) + drivers_live
// .designatedMode=true (el toggle vivo, equivalente a
// driversInfo.isDesignatedDriverMode de v1). Un fallo aborta la tx — el
// UPDATE de driverOfferTx no llega a commit.
func (s *Service) requireDesignatedMode(ctx context.Context, tx pgx.Tx, rideID, driverUID string) error {
	var rideType string
	var desigVeh *string
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(ride_type::text, 'normal'), designated_driver_vehicle::text
		FROM public.rides WHERE id = $1::uuid`, rideID).Scan(&rideType, &desigVeh); err != nil {
		return err
	}
	if rideType != "designated_driver" {
		return nil
	}
	var desStatus, driverVeh string
	err := tx.QueryRow(ctx, `
		SELECT d.designated_role_status::text,
		       COALESCE((SELECT v.type FROM public.vehicles v
		                 WHERE v.driver_id = d.id AND v.is_active = TRUE
		                   AND v.deleted_at IS NULL LIMIT 1), 'auto')
		FROM public.drivers d
		WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.account_status = 'active'`,
		driverUID).Scan(&desStatus, &driverVeh)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(403, "driver no elegible")
	}
	if err != nil {
		return err
	}
	if desStatus != "verified" {
		return apperr.New(409, "ride requiere conductor designado verificado")
	}
	wantVeh := "auto"
	if desigVeh != nil && *desigVeh != "" {
		wantVeh = *desigVeh
	}
	if strings.Contains(strings.ToLower(wantVeh), "moto") !=
		strings.Contains(strings.ToLower(driverVeh), "moto") {
		return apperr.New(409, "tipo de vehículo incompatible")
	}
	if s.fs == nil {
		return nil
	}
	snap, err := s.fs.Collection(fs.ColDriversLive).Doc(driverUID).Get(ctx)
	mode := err == nil && snap.Exists() && snap.Data()["designatedMode"] == true
	if !mode {
		return apperr.New(409, "activa el modo conductor designado para tomar este viaje")
	}
	return nil
}

// CompleteRide — conductor completa: tarifa final + snapshot de comisión +
// obligación de pago (payments row) en UNA transacción (doc §7.1: no confundir
// trip completed con payment settled — el pago queda 'pending').
func (s *Service) CompleteRide(ctx context.Context, rideID, driverUID string, in CompleteRideRequest, requestID string) (*Ride, error) {
	if in.FinalFare < 0 {
		return nil, apperr.New(400, "finalFare must be >= 0")
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	r, err := scanRide(tx.QueryRow(ctx, `
		UPDATE public.rides
		SET status = 'completed', final_fare = $3,
		    actual_distance = COALESCE($4, actual_distance),
		    actual_duration = COALESCE($5, actual_duration),
		    completed_at = NOW(), version = version + 1
		WHERE id = $1
		  AND driver_id = $2
		  AND status IN ('in_progress', 'pending_payment')
		RETURNING `+rideCols,
		rideID, driverUID, in.FinalFare, in.ActualDistance, in.ActualDuration,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "ride not completable by this driver")
	}
	if err != nil {
		return nil, fmt.Errorf("complete: %w", err)
	}

	// Snapshot de comisión: tasa vigente al momento del viaje (doc §7.3).
	var rate float64
	err = tx.QueryRow(ctx, `
		SELECT public.get_driver_commission_rate(
			$1,
			COALESCE((SELECT s.code FROM public.services s
			          JOIN public.rides r ON r.service_id = s.id WHERE r.id = $2), '')
		)`, driverUID, rideID).Scan(&rate)
	if err != nil {
		return nil, fmt.Errorf("commission rate: %w", err)
	}
	commission := in.FinalFare * rate

	var paymentID string
	err = tx.QueryRow(ctx, `
		INSERT INTO public.payments (
			ride_id, amount, tip, commission, commission_rate_applied,
			payment_method, payment_provider, status, commission_status
		)
		SELECT $1, $2, $3, $4, $5,
		       CASE WHEN r.payment_type = 'card_local' THEN 'card'::public.payment_method ELSE 'cash'::public.payment_method END,
		       CASE WHEN r.payment_type = 'card_local' THEN 'local'::public.payment_provider ELSE 'cash'::public.payment_provider END,
		       'pending'::public.payment_status, 'pending'::public.commission_status
		FROM public.rides r WHERE r.id = $1
		RETURNING id`,
		rideID, in.FinalFare, in.Tip, commission, rate,
	).Scan(&paymentID)
	if err != nil {
		return nil, fmt.Errorf("payment insert: %w", err)
	}

	// Código de confirmación de efectivo (solo pagos cash — self-guard dentro):
	// queda en payment_cash_codes y se proyecta a payments_live/private/cash,
	// legible solo por el cliente; el conductor lo digita al confirmar.
	if err := cashcode.Create(ctx, tx, rideID); err != nil {
		return nil, fmt.Errorf("cash code: %w", err)
	}

	// Al terminar cualquier viaje el conductor queda no disponible y debe
	// reactivar explícitamente: revocación durable + intención de offline en
	// la misma tx (el consumer proyecta drivers_live fuera de ella).
	var driverID string
	var sessionSeq int64
	err = tx.QueryRow(ctx,
		`SELECT id::text FROM public.drivers WHERE user_id = $1 AND deleted_at IS NULL`,
		driverUID).Scan(&driverID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if driverID != "" {
		if sessionSeq, err = compliance.RevokeDriverSession(ctx, tx, driverID); err != nil {
			return nil, fmt.Errorf("revoke driver session: %w", err)
		}
	}

	ridePayload := map[string]any{
		"rideId": r.ID, "firebaseRideId": r.FirebaseRideID,
		"clientId": r.ClientID, "driverId": r.DriverID,
		"status": r.Status, "version": r.Version,
		"finalFare": in.FinalFare, "commissionRate": rate,
	}
	var rideEvID string
	events := []outbox.Event{
		{
			Type: "ride.completed", AggregateType: "ride", AggregateID: r.ID,
			RequestID: requestID,
			Payload:   ridePayload,
		},
		{
			Type: "payment.created", AggregateType: "payment", AggregateID: paymentID,
			RequestID: requestID,
			Payload: map[string]any{
				"paymentId": paymentID, "rideId": r.ID,
				"firebaseRideId": r.FirebaseRideID,
				"clientId":       r.ClientID, "driverId": r.DriverID,
				"amount": in.FinalFare, "tip": in.Tip, "commission": commission,
				"status": "pending",
			},
		},
	}
	// Intención durable de offline: el consumer proyecta drivers_live; la seq
	// evita que un evento atrasado apague una activación posterior.
	if driverID != "" {
		events = append(events, outbox.Event{
			Type: "driver.deactivated", AggregateType: "driver", AggregateID: driverID,
			RequestID: requestID,
			Payload: map[string]any{
				"driverUid": driverUID, "driverId": driverID, "rideId": r.ID,
				"sessionSeq": sessionSeq, "reason": "ride_completed",
			},
		})
	}
	for _, ev := range events {
		evID, err := outbox.InsertReturning(ctx, tx, ev)
		if err != nil {
			return nil, err
		}
		if ev.AggregateType == "ride" {
			rideEvID = evID
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	s.publishFastPath(ctx, "ride.completed", r.ID, rideEvID, ridePayload)
	return r, nil
}
