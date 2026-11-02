// Package projections — proyección versionada de agregados SQL → Firestore.
// Extraído de cmd/consumer para reutilización por el reconciliador
// (internal/reconcile): mismo código, misma idempotencia (versión
// estrictamente mayor, compare-and-set en transacción Firestore, doc §5.3).
package projections

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

// Event — equivalente a una fila de public.outbox_events.
type Event struct {
	EventID       string
	EventType     string
	AggregateType string
	AggregateID   string
	Payload       json.RawMessage
}

// Publish proyecta el evento al dominio Firestore correspondiente.
// Versionado: solo aplica si event.version > doc.appliedVersion.
// Para catálogo (service/feature/pricing) se RE-LEE la fila SQL vigente y se
// proyecta el estado completo — el payload solo actúa de disparador/versión.
func Publish(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, ev Event) error {
	var p map[string]any
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}

	switch ev.AggregateType {
	case "ride":
		if err := projectRide(ctx, pool, c, ev, p); err != nil {
			return err
		}
		// Efectos de crew membership (currentRideId) tras proyectar el viaje.
		return crewSideEffects(ctx, c, ev, p)

	case "payment":
		return projectPayment(ctx, pool, c, ev, p)

	case "driver":
		// Whitelist: nunca proyectar campos de compliance/licencias (reglas §8).
		data := map[string]any{
			"driverId":       ev.AggregateID,
			"appliedVersion": p["version"],
			"updatedAt":      firestore.ServerTimestamp,
			"lastEventId":    ev.EventID,
		}
		for _, k := range []string{
			"userId", "accountStatus", "averageRating", "totalRides",
			"department", "municipality", "displayName", "photoUrl",
		} {
			if v, ok := p[k]; ok {
				data[k] = v
			}
		}
		mainRef := c.Collection(fs.ColDrivers).Doc(ev.AggregateID)
		if err := applyVersioned(ctx, c, mainRef, p, data); err != nil {
			return err
		}
		// Perfil público: lo mínimo para que un cliente identifique a su
		// oferente/conductor asignado (nombre, foto, rating, conteo de viajes).
		public := map[string]any{
			"driverId":       ev.AggregateID,
			"appliedVersion": p["version"],
			"updatedAt":      firestore.ServerTimestamp,
			"lastEventId":    ev.EventID,
		}
		for _, k := range []string{"displayName", "photoUrl", "averageRating", "totalRides"} {
			if v, ok := p[k]; ok {
				public[k] = v
			}
		}
		publicRef := c.Collection(fs.ColDriverPublic).Doc(ev.AggregateID)
		return applyVersioned(ctx, c, publicRef, p, public)

	case "vehicle":
		data := map[string]any{
			"vehicleId":      ev.AggregateID,
			"appliedVersion": p["version"],
			"updatedAt":      firestore.ServerTimestamp,
			"lastEventId":    ev.EventID,
		}
		for _, k := range []string{
			"driverUid", "plate", "brand", "model", "year", "color",
			"type", "is4x4", "isActive", "vehiclePhoto",
		} {
			if v, ok := p[k]; ok {
				data[k] = v
			}
		}
		ref := c.Collection(fs.ColVehicles).Doc(ev.AggregateID)
		return applyVersioned(ctx, c, ref, p, data)

	case "user":
		// Firestore-first: la API ya escribió el doc operativo; esta proyección
		// es autocorrección idempotente (whitelist = campos editables + role).
		data := map[string]any{
			"appliedVersion": p["version"],
			"updatedAt":      firestore.ServerTimestamp,
			"lastEventId":    ev.EventID,
		}
		for _, k := range []string{
			"name", "email", "phone", "role", "authProvider",
			"birthDate", "profilePhoto", "notificationsEnabled",
		} {
			if v, ok := p[k]; ok {
				data[k] = v
			}
		}
		ref := c.Collection(fs.ColUsers).Doc(ev.AggregateID)
		return applyVersioned(ctx, c, ref, p, data)

	case "service":
		return ProjectService(ctx, pool, c, ev)

	case "feature":
		return ProjectFeature(ctx, pool, c, ev)

	case "pricing":
		return ProjectSurgeRules(ctx, pool, c, ev)

	default:
		slog.Warn("unhandled aggregate", "type", ev.AggregateType, "event", ev.EventID)
		return nil
	}
}

// projectRide — re-lee la fila SQL autoritativa (vista rides_with_complete_route
// + joins a users) y proyecta el estado completo a REALTIME_trips_live.
// El payload solo aporta serviceAreaId/serviceCode (viven en el request, no en
// SQL) y la versión. Campos ausentes en la fila se omiten — nunca se borran.
func projectRide(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, ev Event, p map[string]any) error {
	var (
		fbID, clientID, driverID, followerID, followerSt      *string
		statusV, rideType, vehicleType, paymentType, desigVeh *string
		estPrice, finalFare, clientSug, driverOff             *float64
		estDist, estDur, actDist, actDur, passengers, waypCnt *int64
		notes, clientPhoto, cancelReason, canceledBy          *string
		multiStops                                            *bool
		pricingSnap                                           json.RawMessage
		reqAt, accAt, startAt, compAt, cancAt                 *time.Time
		version                                               *int64
		oLat, oLng, dLat, dLng                                *float64
		oAddr, dAddr                                          *string
		waypoints                                             json.RawMessage
		svcArea                                               *string
		clientName, clientPhone, driverName                   *string
	)
	err := pool.QueryRow(ctx, `
		SELECT v.firebase_ride_id, v.client_id, v.driver_id, v.follower_driver_id,
		       v.follower_status::text, v.status::text, v.ride_type, v.vehicle_type,
		       v.payment_type, v.designated_driver_vehicle,
		       v.estimated_price, v.final_fare, v.client_suggested_price, v.driver_offered_price,
		       v.estimated_distance, v.estimated_duration, v.actual_distance, v.actual_duration,
		       v.passengers, v.notes, v.client_vehicle_photo, v.waypoints_count, v.has_multiple_stops,
		       v.cancel_reason, v.canceled_by, v.pricing_snapshot,
		       v.requested_at, v.accepted_at, v.started_at, v.completed_at, v.canceled_at, v.version,
		       v.origin_latitude, v.origin_longitude, v.origin_address,
		       v.destination_latitude, v.destination_longitude, v.destination_address, v.waypoints,
		       v.service_area_id,
		       uc.name, uc.phone, ud.name
		FROM public.rides_with_complete_route v
		LEFT JOIN public.users uc ON uc.id = v.client_id
		LEFT JOIN public.users ud ON ud.id = v.driver_id
		WHERE v.id = $1::uuid`, ev.AggregateID).Scan(
		&fbID, &clientID, &driverID, &followerID, &followerSt,
		&statusV, &rideType, &vehicleType, &paymentType, &desigVeh,
		&estPrice, &finalFare, &clientSug, &driverOff,
		&estDist, &estDur, &actDist, &actDur,
		&passengers, &notes, &clientPhoto, &waypCnt, &multiStops,
		&cancelReason, &canceledBy, &pricingSnap,
		&reqAt, &accAt, &startAt, &compAt, &cancAt, &version,
		&oLat, &oLng, &oAddr, &dLat, &dLng, &dAddr, &waypoints,
		&svcArea, &clientName, &clientPhone, &driverName)
	if err != nil {
		return fmt.Errorf("projectRide read %s: %w", ev.AggregateID, err)
	}

	liveID := ev.AggregateID
	if fbID != nil && *fbID != "" {
		liveID = *fbID
	} else if s, _ := p["firebaseRideId"].(string); s != "" {
		liveID = s
	}

	data := map[string]any{
		"rideId":      ev.AggregateID,
		"updatedAt":   firestore.ServerTimestamp,
		"lastEventId": ev.EventID,
	}
	put := func(key string, v *string) {
		if v != nil {
			data[key] = *v
		}
	}
	put("firebaseRideId", fbID)
	put("clientId", clientID)
	put("driverId", driverID)
	put("followerDriverId", followerID)
	put("followerStatus", followerSt)
	put("status", statusV)
	put("rideType", rideType)
	put("vehicleType", vehicleType)
	put("paymentType", paymentType)
	put("designatedDriverVehicle", desigVeh)
	put("notes", notes)
	put("clientVehiclePhoto", clientPhoto)
	put("cancelReason", cancelReason)
	put("canceledBy", canceledBy)
	put("clientName", clientName)
	put("clientPhone", clientPhone)
	put("driverName", driverName)
	num := func(key string, v *float64) {
		if v != nil {
			data[key] = *v
		}
	}
	num("estimatedPrice", estPrice)
	num("finalFare", finalFare)
	num("clientSuggestedPrice", clientSug)
	num("driverOfferedPrice", driverOff)
	inum := func(key string, v *int64) {
		if v != nil {
			data[key] = *v
		}
	}
	inum("estimatedDistance", estDist)
	inum("estimatedDuration", estDur)
	inum("actualDistance", actDist)
	inum("actualDuration", actDur)
	inum("passengers", passengers)
	inum("waypointsCount", waypCnt)
	if multiStops != nil {
		data["hasMultipleStops"] = *multiStops
	}
	// Alias camelCase consumido por el frontend junto a paymentType.
	if paymentType != nil {
		data["paymentMethod"] = *paymentType
	}
	for _, t := range []struct {
		key string
		v   *time.Time
	}{{"requestedAt", reqAt}, {"acceptedAt", accAt}, {"startedAt", startAt},
		{"completedAt", compAt}, {"canceledAt", cancAt}} {
		if t.v != nil {
			data[t.key] = *t.v
		}
	}
	if version != nil {
		data["version"] = *version
	}
	if oLat != nil && oLng != nil {
		origin := map[string]any{"latitude": *oLat, "longitude": *oLng}
		if oAddr != nil {
			origin["address"] = *oAddr
		}
		data["origin"] = origin
	}
	if dLat != nil && dLng != nil {
		dest := map[string]any{"latitude": *dLat, "longitude": *dLng}
		if dAddr != nil {
			dest["address"] = *dAddr
		}
		data["destination"] = dest
	}
	if len(waypoints) > 0 {
		var wps []map[string]any
		if json.Unmarshal(waypoints, &wps) == nil && len(wps) > 0 {
			extra := make([]map[string]any, 0, len(wps))
			for _, w := range wps {
				e := map[string]any{"lat": w["lat"], "lng": w["lng"]}
				if a, ok := w["address"].(string); ok {
					e["address"] = a
				}
				extra = append(extra, e)
			}
			data["extraDestinations"] = extra
		}
	}
	if len(pricingSnap) > 0 {
		var snap map[string]any
		if json.Unmarshal(pricingSnap, &snap) == nil {
			data["pricingSnapshot"] = snap
			if fc, ok := snap["featureCodes"]; ok {
				data["featureCodes"] = fc
			}
		}
	}
	// serviceAreaId persistido en SQL desde v2 (fallback: payload del evento).
	if svcArea != nil && *svcArea != "" {
		data["serviceAreaId"] = *svcArea
	} else if v, ok := p["serviceAreaId"]; ok && v != nil {
		data["serviceAreaId"] = v
	}
	if v, ok := p["serviceCode"]; ok && v != nil {
		data["serviceCode"] = v
	}
	if v, ok := p["version"]; ok && v != nil {
		data["appliedVersion"] = v
	}

	liveRef := c.Collection(fs.ColTripsLive).Doc(liveID)
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(liveRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			if av, ok := snap.Data()["appliedVersion"].(int64); ok {
				if v, ok2 := p["version"].(float64); ok2 && int64(v) <= av {
					return nil // duplicado/fuera de orden: ya aplicado
				}
			}
		}
		return tx.Set(liveRef, data, firestore.MergeAll)
	})
}

// projectPayment — re-lee payments+rides y proyecta completo a
// REALTIME_payments_live/{firebase_ride_id} (mismo id que trips_live) y
// DATA-MAIN_payments/{paymentId}. Unifica el doc id que antes se partía en
// firebaseRideId (created) vs rideId SQL (resto de eventos).
func projectPayment(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, ev Event, p map[string]any) error {
	var (
		rideID, fbID, clientID, driverID, statusV, method, provider *string
		amount, tip, commission, total                              *float64
	)
	err := pool.QueryRow(ctx, `
		SELECT pay.ride_id::text, r.firebase_ride_id, r.client_id, r.driver_id,
		       pay.status::text, pay.payment_method, pay.payment_provider,
		       pay.amount, pay.tip, pay.commission, pay.total
		FROM public.payments pay
		LEFT JOIN public.rides r ON r.id = pay.ride_id
		WHERE pay.id = $1::uuid`, ev.AggregateID).Scan(
		&rideID, &fbID, &clientID, &driverID, &statusV, &method, &provider,
		&amount, &tip, &commission, &total)
	if err != nil {
		return fmt.Errorf("projectPayment read %s: %w", ev.AggregateID, err)
	}

	base := map[string]any{
		"paymentId":   ev.AggregateID,
		"updatedAt":   firestore.ServerTimestamp,
		"lastEventId": ev.EventID,
	}
	put := func(key string, v *string) {
		if v != nil {
			base[key] = *v
		}
	}
	put("rideId", rideID)
	put("clientId", clientID)
	put("driverId", driverID)
	put("status", statusV)
	put("paymentMethod", method)
	put("paymentProvider", provider)
	num := func(key string, v *float64) {
		if v != nil {
			base[key] = *v
		}
	}
	num("amount", amount)
	num("tip", tip)
	num("commission", commission)
	num("total", total)
	if v, ok := p["version"]; ok && v != nil {
		base["appliedVersion"] = v
	}
	if v, ok := p["cancelReason"]; ok && v != nil {
		base["cancelReason"] = v
	}

	// payments_live keyed por viaje vivo (firebaseRideId) — mismo id que
	// trips_live para que los listeners del cliente/driver converjan.
	liveID := ""
	if fbID != nil {
		liveID = *fbID
	}
	if liveID == "" {
		liveID, _ = p["firebaseRideId"].(string)
	}
	if liveID == "" && rideID != nil {
		liveID = *rideID
	}
	if liveID != "" {
		liveRef := c.Collection(fs.ColPaymentsLive).Doc(liveID)
		if err := applyVersioned(ctx, c, liveRef, p, base); err != nil {
			return err
		}
	}
	mainRef := c.Collection(fs.ColPayments).Doc(ev.AggregateID)
	return applyVersioned(ctx, c, mainRef, p, base)
}

// ProjectService — re-lee public.services + feature codes habilitados y
// proyecta el doc completo a DATA-MAIN_services/{code}.
func ProjectService(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, ev Event) error {
	var p map[string]any
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}
	var (
		name, code                   string
		desc, icon, color            *string
		commission, base, minFare    float64
		perKm, perMin, maxKm         *float64
		vehicleTypes, availHours     json.RawMessage
		reqLicense, active, featured bool
		displayOrder                 int
	)
	err := pool.QueryRow(ctx, `
		SELECT code, name, description, commission_rate, base_price,
		       price_per_km, price_per_minute, minimum_fare, max_distance_km,
		       vehicle_types, requires_special_license, available_hours,
		       icon, color, display_order, is_active, is_featured
		FROM public.services WHERE code = $1`, ev.AggregateID).
		Scan(&code, &name, &desc, &commission, &base, &perKm, &perMin, &minFare,
			&maxKm, &vehicleTypes, &reqLicense, &availHours, &icon, &color,
			&displayOrder, &active, &featured)
	if err != nil {
		return err
	}

	featureRows, err := pool.Query(ctx, `
		SELECT f.code FROM public.service_feature_assignments a
		JOIN public.features f ON f.id = a.feature_id
		JOIN public.services s ON s.id = a.service_id
		WHERE s.code = $1 AND a.enabled = TRUE`, ev.AggregateID)
	if err != nil {
		return err
	}
	featureCodes := []string{}
	for featureRows.Next() {
		var c string
		if err := featureRows.Scan(&c); err != nil {
			featureRows.Close()
			return err
		}
		featureCodes = append(featureCodes, c)
	}
	featureRows.Close()

	data := map[string]any{
		"code":                   code,
		"name":                   name,
		"commissionRate":         commission,
		"basePrice":              base,
		"minimumFare":            minFare,
		"requiresSpecialLicense": reqLicense,
		"displayOrder":           displayOrder,
		"isActive":               active,
		"isFeatured":             featured,
		"featureCodes":           featureCodes,
		"appliedVersion":         p["version"],
		"updatedAt":              firestore.ServerTimestamp,
		"lastEventId":            ev.EventID,
	}
	if desc != nil {
		data["description"] = *desc
	}
	if perKm != nil {
		data["pricePerKm"] = *perKm
	}
	if perMin != nil {
		data["pricePerMinute"] = *perMin
	}
	if maxKm != nil {
		data["maxDistanceKm"] = *maxKm
	}
	if icon != nil {
		data["icon"] = *icon
	}
	if color != nil {
		data["color"] = *color
	}
	if vehicleTypes != nil {
		var vt []string
		if json.Unmarshal(vehicleTypes, &vt) == nil {
			data["vehicleTypes"] = vt
		}
	}
	if availHours != nil {
		var ah any
		if json.Unmarshal(availHours, &ah) == nil {
			data["availableHours"] = ah
		}
	}
	ref := c.Collection(fs.ColServices).Doc(ev.AggregateID)
	return applyVersioned(ctx, c, ref, p, data)
}

// ProjectFeature — re-lee public.features → DATA-MAIN_features/{code}.
func ProjectFeature(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, ev Event) error {
	var p map[string]any
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}
	var (
		code, name, tz, pricingType, eligSubj, eligMode string
		desc                                            *string
		enabled, stackable                              bool
		pricingValue                                    float64
		priority                                        int
		startsAt, endsAt                                *time.Time
		startTime, endTime                              *string
		metadata                                        json.RawMessage
	)
	err := pool.QueryRow(ctx, `
		SELECT code, name, description, enabled, starts_at, ends_at,
		       start_time::text, end_time::text, timezone, pricing_type,
		       pricing_value, priority, stackable, eligibility_subject,
		       eligibility_mode, metadata
		FROM public.features WHERE code = $1`, ev.AggregateID).
		Scan(&code, &name, &desc, &enabled, &startsAt, &endsAt,
			&startTime, &endTime, &tz, &pricingType, &pricingValue,
			&priority, &stackable, &eligSubj, &eligMode, &metadata)
	if err != nil {
		return err
	}

	data := map[string]any{
		"code":               code,
		"name":               name,
		"enabled":            enabled,
		"timezone":           tz,
		"pricingType":        pricingType,
		"pricingValue":       pricingValue,
		"priority":           priority,
		"stackable":          stackable,
		"eligibilitySubject": eligSubj,
		"eligibilityMode":    eligMode,
		"appliedVersion":     p["version"],
		"updatedAt":          firestore.ServerTimestamp,
		"lastEventId":        ev.EventID,
	}
	if desc != nil {
		data["description"] = *desc
	}
	if startsAt != nil {
		data["startsAt"] = *startsAt
	}
	if endsAt != nil {
		data["endsAt"] = *endsAt
	}
	if startTime != nil {
		data["startTime"] = *startTime
	}
	if endTime != nil {
		data["endTime"] = *endTime
	}
	if metadata != nil {
		var m any
		if json.Unmarshal(metadata, &m) == nil {
			data["metadata"] = m
		}
	}
	ref := c.Collection(fs.ColFeatures).Doc(ev.AggregateID)
	return applyVersioned(ctx, c, ref, p, data)
}

// ProjectSurgeRules — lista completa de reglas habilitadas →
// DATA-MAIN_pricing/surge (doc único; la app lo lee en una consulta).
func ProjectSurgeRules(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, ev Event) error {
	var p map[string]any
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}
	rows, err := pool.Query(ctx, `
		SELECT min_demand_supply_ratio, max_demand_supply_ratio, multiplier, priority
		FROM public.pricing_surge_rules
		WHERE enabled = TRUE
		ORDER BY min_demand_supply_ratio`)
	if err != nil {
		return err
	}
	rules := []map[string]any{}
	for rows.Next() {
		var minR, mult float64
		var maxR *float64
		var prio int
		if err := rows.Scan(&minR, &maxR, &mult, &prio); err != nil {
			rows.Close()
			return err
		}
		r := map[string]any{"minRatio": minR, "multiplier": mult, "priority": prio}
		if maxR != nil {
			r["maxRatio"] = *maxR
		}
		rules = append(rules, r)
	}
	rows.Close()

	ref := c.Collection(fs.ColPricing).Doc("surge")
	return applyVersioned(ctx, c, ref, p, map[string]any{
		"rules":          rules,
		"appliedVersion": p["version"],
		"updatedAt":      firestore.ServerTimestamp,
		"lastEventId":    ev.EventID,
	})
}

// crewSideEffects — follower_attached/released actualizan currentRideId en
// REALTIME_driver_crew_membership/{uid} (equivalente a v1 driverCrewMembership).
func crewSideEffects(ctx context.Context, c *firestore.Client, ev Event, p map[string]any) error {
	followerUID, _ := p["followerDriverId"].(string)
	if followerUID == "" {
		return nil
	}
	var update map[string]any
	switch ev.EventType {
	case "ride.follower_attached":
		update = map[string]any{"currentRideId": ev.AggregateID}
	case "ride.follower_released":
		update = map[string]any{"currentRideId": nil}
	default:
		return nil
	}
	update["updatedAt"] = firestore.ServerTimestamp
	_, err := c.Collection(fs.ColCrewMembership).Doc(followerUID).
		Set(ctx, update, firestore.MergeAll)
	return err
}

// applyVersioned — compare-and-set: solo aplica si payload.version estrictamente
// mayor que doc.appliedVersion (idempotencia/out-of-order, doc §5.3).
func applyVersioned(ctx context.Context, c *firestore.Client, ref *firestore.DocumentRef, p map[string]any, data map[string]any) error {
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			if av, ok := snap.Data()["appliedVersion"].(int64); ok {
				if v, ok2 := p["version"].(float64); ok2 && int64(v) <= av {
					return nil
				}
			}
		}
		return tx.Set(ref, data, firestore.MergeAll)
	})
}
