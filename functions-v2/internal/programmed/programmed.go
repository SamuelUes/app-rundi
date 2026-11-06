// Package programmed — viajes programados (port de programmedRides v1).
// Firestore-first como en v1: el doc vive en REALTIME_programmed_rides hasta
// que el scheduler lo promueve a una fila SQL rides + outbox (ride.requested,
// o requested+accepted si el conductor ya estaba confirmado).
package programmed

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

// Ventanas de v1 (processProgrammedRides).
const (
	ConfirmWindow  = 10 * time.Minute // cliente confirma desde scheduledAt-10m
	PromotionGrace = 2 * time.Minute  // promoción hasta scheduledAt+2m
	OrphanWindow   = time.Hour        // scheduledAt < now-1h sin procesar → cancel
)

const col = fs.ColProgrammed

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
	// Agendado por task en lugar de polling por minuto (opcional; el tick
	// programado sigue de respaldo si no se instala o si el enqueue falla).
	schedulePromotion func(ctx context.Context, rideID string, at time.Time) error
	cancelPromotion   func(ctx context.Context, rideID string) error
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

// SetPromotionScheduler instala el agendado/cancel best-effort del task de
// promoción (Cloud Tasks → job rundi-programmed con ScheduleTime=scheduledAt).
func (s *Service) SetPromotionScheduler(
	schedule func(ctx context.Context, rideID string, at time.Time) error,
	cancel func(ctx context.Context, rideID string) error,
) {
	s.schedulePromotion = schedule
	s.cancelPromotion = cancel
}

// Create — cliente crea el doc (backend lo escribe: valida + fija clientId).
// Todos los campos operativos viajan en el doc (se copian a rides/trips_live
// al promover, igual que buildActiveRidePayload de v1).
func (s *Service) Create(ctx context.Context, uid string, in map[string]any) (string, string, error) {
	scheduledMs, ok := numField(in["scheduledAt"])
	if !ok || scheduledMs <= time.Now().UnixMilli() {
		return "", "", apperr.New(400, "scheduledAt debe ser futuro (epoch ms)")
	}
	id := uuid.NewString()
	doc := map[string]any{
		"clientId":        uid,
		"status":          "scheduled",
		"scheduledAt":     scheduledMs,
		"clientConfirmed": false,
		"driverConfirmed": false,
		"createdAt":       firestore.ServerTimestamp,
		"updatedAt":       firestore.ServerTimestamp,
	}
	// Copiar solo keys operativas permitidas (anti-inyección de campos).
	for _, k := range []string{
		"origin", "destination", "extraDestinations", "estimatedPrice",
		"clientSuggestedPrice", "pricingSnapshot", "featureCodes", "serviceCode",
		"surgeMultiplier", "estimatedDistance", "estimatedDuration", "rideType",
		"vehicleType", "designatedDriverVehicle", "passengers", "paymentMethod",
		"serviceId", "serviceAreaId", "clientVehiclePhoto", "clientName",
		"clientPhone", "shareCode", "notes",
	} {
		if v, ok := in[k]; ok {
			doc[k] = v
		}
	}
	sc, _ := doc["shareCode"].(string)
	if sc == "" {
		sc = shareCode()
		doc["shareCode"] = sc
	}
	_, err := s.fs.Collection(col).Doc(id).Set(ctx, doc)
	if err != nil {
		return "", "", err
	}
	if s.schedulePromotion != nil {
		sCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		if serr := s.schedulePromotion(sCtx, id, time.UnixMilli(scheduledMs)); serr != nil {
			slog.Warn("programmed promotion task failed; tick de respaldo cubre", "ride", id, "err", serr)
		}
	}
	return id, sc, nil
}

// Assign — cliente asigna un conductor específico (pendiente de confirmación).
func (s *Service) Assign(ctx context.Context, uid, rideID, driverID string) error {
	return s.updateOwn(ctx, uid, rideID, map[string]any{
		"driverId": driverID, "updatedAt": firestore.ServerTimestamp,
	}, []string{"scheduled", "client_confirmed"})
}

// Claim — conductor toma el viaje por shareCode o id directo. Un shareCode
// (6 dígitos, no es doc id) se resuelve server-side: las reglas no permiten al
// driver consultar docs ajenos por shareCode desde el cliente.
func (s *Service) Claim(ctx context.Context, uid, rideID string) error {
	ref := s.fs.Collection(col).Doc(rideID)
	snap, err := ref.Get(ctx)
	if err != nil || !snap.Exists() {
		docs, qerr := s.fs.Collection(col).Where("shareCode", "==", rideID).Limit(1).Documents(ctx).GetAll()
		if qerr != nil || len(docs) == 0 {
			return apperr.New(404, "programmed ride not found")
		}
		snap = docs[0]
		ref = snap.Ref
	}
	st, _ := snap.Data()["status"].(string)
	if st != "scheduled" && st != "client_confirmed" {
		return apperr.New(409, "ride no longer claimable")
	}
	if cid, _ := snap.Data()["clientId"].(string); cid == uid {
		return apperr.New(400, "no puedes tomar tu propio viaje")
	}
	_, err = ref.Set(ctx, map[string]any{
		"driverId":  uid,
		"updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err
}

// Confirm — clientConfirmed/driverConfirmed (v1: confirmProgrammedRide*).
func (s *Service) Confirm(ctx context.Context, uid, rideID, who string) error {
	snap, err := s.fs.Collection(col).Doc(rideID).Get(ctx)
	if err != nil || !snap.Exists() {
		return apperr.New(404, "programmed ride not found")
	}
	d := snap.Data()
	st, _ := d["status"].(string)
	if st == "canceled" || st == "promoted" {
		return apperr.New(409, "ride already "+st)
	}
	field := "clientConfirmed"
	if who == "driver" {
		field = "driverConfirmed"
		if did, _ := d["driverId"].(string); did != uid {
			return apperr.ErrForbidden
		}
	} else {
		if cid, _ := d["clientId"].(string); cid != uid {
			return apperr.ErrForbidden
		}
	}
	updates := map[string]any{field: true, "updatedAt": firestore.ServerTimestamp}
	if who == "client" && st == "scheduled" {
		updates["status"] = "client_confirmed"
	}
	_, err = snap.Ref.Set(ctx, updates, firestore.MergeAll)
	return err
}

// Cancel — cliente o conductor asignado cancela (motivo opcional).
func (s *Service) Cancel(ctx context.Context, uid, rideID, reason string) error {
	snap, err := s.fs.Collection(col).Doc(rideID).Get(ctx)
	if err != nil || !snap.Exists() {
		return apperr.New(404, "programmed ride not found")
	}
	d := snap.Data()
	cid, _ := d["clientId"].(string)
	did, _ := d["driverId"].(string)
	if uid != cid && uid != did {
		return apperr.ErrForbidden
	}
	_, err = snap.Ref.Set(ctx, map[string]any{
		"status":       "canceled",
		"cancelReason": reason,
		"canceledAt":   firestore.ServerTimestamp,
		"updatedAt":    firestore.ServerTimestamp,
	}, firestore.MergeAll)
	if err != nil {
		return err
	}
	if s.cancelPromotion != nil {
		sCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		if cerr := s.cancelPromotion(sCtx, rideID); cerr != nil {
			slog.Warn("programmed promotion cancel failed", "ride", rideID, "err", cerr)
		}
	}
	return nil
}

// ListMine — programados del actor (como cliente o conductor asignado).
func (s *Service) ListMine(ctx context.Context, uid, role string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	field := "clientId"
	if role == "driver" {
		field = "driverId"
	}
	snaps, err := s.fs.Collection(col).
		Where(field, "==", uid).
		OrderBy("scheduledAt", firestore.Asc).
		Limit(limit).
		Documents(ctx).GetAll()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, s := range snaps {
		d := s.Data()
		d["id"] = s.Ref.ID
		out = append(out, d)
	}
	return out, nil
}

func (s *Service) updateOwn(ctx context.Context, uid, rideID string, updates map[string]any, allowed []string) error {
	snap, err := s.fs.Collection(col).Doc(rideID).Get(ctx)
	if err != nil || !snap.Exists() {
		return apperr.New(404, "programmed ride not found")
	}
	d := snap.Data()
	if cid, _ := d["clientId"].(string); cid != uid {
		return apperr.ErrForbidden
	}
	st, _ := d["status"].(string)
	ok := false
	for _, a := range allowed {
		if st == a {
			ok = true
		}
	}
	if !ok {
		return apperr.New(409, "ride status "+st+" no permite la operación")
	}
	_, err = snap.Ref.Set(ctx, updates, firestore.MergeAll)
	return err
}

// Process — sweep del scheduler (port de processProgrammedRides):
//   - huérfanos (scheduledAt < now-1h) no terminales → canceled 'orphan'
//   - ventana de confirmación sin clientConfirmed → canceled 'client_not_confirmed'
//   - scheduledAt alcanzado → promueve: SQL ride + outbox (+accepted si driver confirmado)
func (s *Service) Process(ctx context.Context, requestID string) (promoted, canceled int, err error) {
	now := time.Now()
	upper := now.Add(PromotionGrace).Add(OrphanWindow).UnixMilli()
	snaps, err := s.fs.Collection(col).
		Where("scheduledAt", "<=", upper).
		Where("status", "in", []string{"scheduled", "client_confirmed"}).
		Limit(200).
		Documents(ctx).GetAll()
	if err != nil {
		return 0, 0, err
	}
	for _, snap := range snaps {
		d := snap.Data()
		scheduledMs, _ := numField(d["scheduledAt"])
		scheduled := time.UnixMilli(scheduledMs)
		clientConfirmed, _ := d["clientConfirmed"].(bool)
		driverConfirmed, _ := d["driverConfirmed"].(bool)
		driverID, _ := d["driverId"].(string)

		// Huérfano: su ventana de procesamiento ya cerró hace >1h.
		if scheduled.Before(now.Add(-OrphanWindow - ConfirmWindow)) {
			if s.cancelDoc(ctx, snap.Ref, "orphan") {
				canceled++
			}
			continue
		}
		inConfirm := !now.Before(scheduled.Add(-ConfirmWindow))
		// Cliente no confirmó dentro de la ventana → cancel (sin tope superior:
		// el check de huérfano ya acota el extremo; un ride sin confirmar que
		// pase la gracia no debe caer a promote).
		if inConfirm && !clientConfirmed {
			if s.cancelDoc(ctx, snap.Ref, "client_not_confirmed") {
				canceled++
			}
			continue
		}
		// Aún no llega la hora de promoción.
		if now.Before(scheduled) {
			continue
		}
		if err := s.promote(ctx, snap.Ref, d, driverID != "" && driverConfirmed, requestID); err != nil {
			return promoted, canceled, err
		}
		promoted++
	}
	return promoted, canceled, nil
}

func (s *Service) cancelDoc(ctx context.Context, ref *firestore.DocumentRef, reason string) bool {
	_, err := ref.Set(ctx, map[string]any{
		"status":       "canceled",
		"cancelReason": reason,
		"canceledAt":   firestore.ServerTimestamp,
		"updatedAt":    firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err == nil
}

// promote — crea la fila rides (requested o accepted) + outbox + marca doc.
func (s *Service) promote(ctx context.Context, ref *firestore.DocumentRef, d map[string]any, withDriver bool, requestID string) error {
	clientID, _ := d["clientId"].(string)
	driverID, _ := d["driverId"].(string)
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var rideID string
	var status string
	if withDriver && driverID != "" {
		status = "accepted"
	} else {
		status = "requested"
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO public.rides (
			firebase_ride_id, client_id, driver_id, ride_type, vehicle_type,
			designated_driver_vehicle, estimated_distance, estimated_duration,
			estimated_price, client_suggested_price, pricing_snapshot,
			passengers, notes, payment_type, service_id, client_vehicle_photo,
			service_area_id, status, accepted_at
		) VALUES (
			$1, $2, $3, COALESCE(NULLIF($4,'')::public.ride_type,'normal'), COALESCE(NULLIF($5,''),'auto'),
			NULLIF($6,'')::public.designated_driver_vehicle, $7, $8, $9, $10, $11, COALESCE($12,1), NULLIF($13,''),
			COALESCE(NULLIF($14,'')::public.ride_payment_type,'cash'),
			COALESCE((SELECT id FROM public.services WHERE code = NULLIF($15, '')),
				CASE WHEN NULLIF($15, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
					THEN NULLIF($15, '')::uuid END),
			NULLIF($16,''), NULLIF($18,''),
			$17::ride_status, CASE WHEN $17 = 'accepted' THEN NOW() ELSE NULL END
		) RETURNING id::text`,
		ref.ID, clientID, strOrNil(withDriver, driverID),
		str(d["rideType"]), str(d["vehicleType"]), str(d["designatedDriverVehicle"]),
		intOrNil(d["estimatedDistance"]), intOrNil(d["estimatedDuration"]),
		numOrNil(d["estimatedPrice"]), numOrNil(d["clientSuggestedPrice"]),
		jsonOrNil(d["pricingSnapshot"]), intOrNil(d["passengers"]),
		str(d["notes"]), str(d["paymentMethod"]), str(d["serviceId"]),
		str(d["clientVehiclePhoto"]), status, str(d["serviceAreaId"]),
	).Scan(&rideID)
	if err != nil {
		return fmt.Errorf("promote insert: %w", err)
	}

	// Ruta contratada desde el doc programado: origin order 0, waypoints,
	// destination; puebla origin_location_id/destination_location_id para ETA
	// e historial de ruta (misma forma que POST /rides).
	loc := func(key string) (lat, lng float64, addr string, ok bool) {
		m, ok := d[key].(map[string]any)
		if !ok {
			return 0, 0, "", false
		}
		la, _ := numField(m["lat"])
		lo, _ := numField(m["lng"])
		lat, lng = float64(la), float64(lo)
		addr, _ = m["address"].(string)
		return lat, lng, addr, lat != 0 || lng != 0
	}
	var originLocID, destLocID *string
	if olat, olng, oaddr, ok := loc("origin"); ok {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'origin', 0, $2, $3, NULLIF($4, ''))
			RETURNING id::text`, rideID, olat, olng, oaddr).Scan(&id); err != nil {
			return fmt.Errorf("promote origin location: %w", err)
		}
		originLocID = &id
	}
	extraN := 0
	if extras, ok := d["extraDestinations"].([]any); ok {
		for i, e := range extras {
			m, ok := e.(map[string]any)
			if !ok {
				continue
			}
			elat, _ := numField(m["lat"])
			elng, _ := numField(m["lng"])
			eaddr, _ := m["address"].(string)
			if _, err := tx.Exec(ctx, `
				INSERT INTO public.ride_locations
					(ride_id, location_type, location_order, latitude, longitude, address)
				VALUES ($1::uuid, 'waypoint', $2, $3, $4, NULLIF($5, ''))`,
				rideID, i+1, float64(elat), float64(elng), eaddr); err != nil {
				return fmt.Errorf("promote waypoint location: %w", err)
			}
			extraN = i + 1
		}
	}
	if dlat, dlng, daddr, ok := loc("destination"); ok {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'destination', $2, $3, $4, NULLIF($5, ''))
			RETURNING id::text`, rideID, extraN+1, dlat, dlng, daddr).Scan(&id); err != nil {
			return fmt.Errorf("promote destination location: %w", err)
		}
		destLocID = &id
	}
	if originLocID != nil || destLocID != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE public.rides
			SET origin_location_id = COALESCE($2::uuid, origin_location_id),
			    destination_location_id = COALESCE($3::uuid, destination_location_id)
			WHERE id = $1::uuid`, rideID, originLocID, destLocID); err != nil {
			return fmt.Errorf("promote link locations: %w", err)
		}
	}

	payload := map[string]any{
		"rideId": rideID, "firebaseRideId": ref.ID,
		"clientId": clientID, "status": status, "version": 1,
		"rideType": d["rideType"], "vehicleType": d["vehicleType"],
		"estimatedPrice": d["estimatedPrice"], "paymentType": d["paymentMethod"],
		"requestedAt":  time.Now().Format(time.RFC3339),
		"isProgrammed": true,
	}
	if org, ok := d["origin"].(map[string]any); ok {
		payload["originLat"], _ = numField(org["lat"])
		payload["originLng"], _ = numField(org["lng"])
	}
	payload["serviceAreaId"], _ = d["serviceAreaId"].(string)
	payload["serviceCode"], _ = d["serviceCode"].(string)
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "ride.requested", AggregateType: "ride", AggregateID: rideID,
		RequestID: requestID, Payload: payload,
	}); err != nil {
		return err
	}
	if status == "accepted" {
		if err := outbox.Insert(ctx, tx, outbox.Event{
			Type: "ride.accepted", AggregateType: "ride", AggregateID: rideID,
			RequestID: requestID,
			Payload: map[string]any{
				"rideId": rideID, "firebaseRideId": ref.ID,
				"clientId": clientID, "driverId": driverID,
				"status": status, "version": 1,
				"acceptedAt":   time.Now().Format(time.RFC3339),
				"isProgrammed": true,
			},
		}); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	_, err = ref.Set(ctx, map[string]any{
		"status":     "promoted",
		"rideId":     rideID,
		"promotedAt": firestore.ServerTimestamp,
		"updatedAt":  firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err
}

// Cleanup — docs terminales (canceled/promoted) >7d (cleanupProgrammedRides).
func (s *Service) Cleanup(ctx context.Context) (int, error) {
	cut := time.Now().Add(-7 * 24 * time.Hour)
	snaps, err := s.fs.Collection(col).
		Where("status", "in", []string{"canceled", "promoted"}).
		Where("updatedAt", "<", cut).
		Limit(500).
		Documents(ctx).GetAll()
	if err != nil {
		return 0, err
	}
	for _, s := range snaps {
		_, _ = s.Ref.Delete(ctx)
	}
	return len(snaps), nil
}

// ---------- helpers ----------
func numField(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case int64:
		return n, true
	case int:
		return int64(n), true
	}
	return 0, false
}
func str(v any) string {
	s, _ := v.(string)
	return s
}
func strOrNil(ok bool, s string) any {
	if ok && s != "" {
		return s
	}
	return nil
}
func numOrNil(v any) any {
	if n, ok := numField(v); ok {
		return n
	}
	return nil
}
func intOrNil(v any) any {
	return numOrNil(v)
}
func jsonOrNil(v any) any {
	if v == nil {
		return nil
	}
	if s, ok := v.(string); ok && s == "" {
		return nil
	}
	return v
}
func shareCode() string {
	return fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
}
