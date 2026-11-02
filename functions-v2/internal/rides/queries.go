package rides

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
)

// RideSummary — fila de historial (getMyRides/getClientRides/getDriverRides).
type RideSummary struct {
	ID             string     `json:"id"`
	FirebaseRideID *string    `json:"firebaseRideId,omitempty"`
	ClientID       string     `json:"clientId"`
	DriverID       *string    `json:"driverId,omitempty"`
	FollowerID     *string    `json:"followerDriverId,omitempty"`
	Status         string     `json:"status"`
	RideType       *string    `json:"rideType,omitempty"`
	VehicleType    *string    `json:"vehicleType,omitempty"`
	PaymentType    *string    `json:"paymentType,omitempty"`
	EstimatedPrice *float64   `json:"estimatedPrice,omitempty"`
	FinalFare      *float64   `json:"finalFare,omitempty"`
	RequestedAt    time.Time  `json:"requestedAt"`
	CompletedAt    *time.Time `json:"completedAt,omitempty"`
}

const summaryCols = `id, firebase_ride_id, client_id, driver_id, follower_driver_id,
	status::text, ride_type, vehicle_type, payment_type,
	estimated_price, final_fare, requested_at, completed_at`

// ListMyRides — historial del actor (client|driver|follower según ?role).
func (s *Service) ListMyRides(ctx context.Context, uid, role, status string, limit int) ([]RideSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var where string
	switch role {
	case "driver":
		where = "driver_id = $1"
	case "follower":
		where = "follower_driver_id = $1"
	default:
		role = "client"
		where = "client_id = $1"
	}
	q := `SELECT ` + summaryCols + ` FROM public.rides
		WHERE ` + where + ` AND deleted_at IS NULL`
	args := []any{uid}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(` AND status = $%d::ride_status`, len(args))
	}
	args = append(args, limit)
	q += fmt.Sprintf(` ORDER BY requested_at DESC LIMIT $%d`, len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSummaries(rows)
}

// GetRideDetail — detalle si el actor participa (o es admin).
func (s *Service) GetRideDetail(ctx context.Context, rideID, uid, role string) (*RideSummary, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT `+summaryCols+` FROM public.rides
		WHERE id = $1::uuid AND deleted_at IS NULL`, rideID)
	r, err := scanSummary(row)
	if err != nil {
		return nil, apperr.New(404, "ride not found")
	}
	isParticipant := r.ClientID == uid ||
		(r.DriverID != nil && *r.DriverID == uid) ||
		(r.FollowerID != nil && *r.FollowerID == uid)
	if !isParticipant && role != "admin" && role != "operator" {
		// Un conductor con oferta pendiente/aceptada puede leer el detalle:
		// es su única vía de ver la ruta/precio antes de aceptar.
		offerRef := s.fs.Collection(fs.ColDriverOffers).Doc(rideID + "_" + uid)
		if snap, err := offerRef.Get(ctx); err != nil || !snap.Exists() {
			return nil, apperr.ErrForbidden
		}
	}
	return r, nil
}

// EarningsSummary — agregado de pagos confirmados del conductor.
type EarningsSummary struct {
	DriverID   string          `json:"driverId"`
	Total      float64         `json:"total"`
	TotalRides int             `json:"totalRides"`
	Commission float64         `json:"commission"`
	Net        float64         `json:"net"`
	ByDay      []EarningsByDay `json:"byDay"`
}

type EarningsByDay struct {
	Date   string  `json:"date"`
	Amount float64 `json:"amount"`
	Rides  int     `json:"rides"`
}

// DriverEarnings — pagos 'confirmed' del conductor (getDriverEarnings/getEarningsByDay).
func (s *Service) DriverEarnings(ctx context.Context, uid string, days int) (*EarningsSummary, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	out := &EarningsSummary{DriverID: uid, ByDay: []EarningsByDay{}}
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(p.total), 0), COUNT(*), COALESCE(SUM(p.commission), 0)
		FROM public.payments p
		JOIN public.rides r ON r.id = p.ride_id
		WHERE r.driver_id = $1
		  AND p.status = 'confirmed'
		  AND r.completed_at >= NOW() - ($2 || ' days')::interval`,
		uid, days).Scan(&out.Total, &out.TotalRides, &out.Commission)
	if err != nil {
		return nil, err
	}
	out.Net = out.Total - out.Commission

	rows, err := s.pool.Query(ctx, `
		SELECT TO_CHAR(r.completed_at::date, 'YYYY-MM-DD'),
		       COALESCE(SUM(p.total), 0), COUNT(*)
		FROM public.payments p
		JOIN public.rides r ON r.id = p.ride_id
		WHERE r.driver_id = $1
		  AND p.status = 'confirmed'
		  AND r.completed_at >= NOW() - ($2 || ' days')::interval
		GROUP BY r.completed_at::date
		ORDER BY r.completed_at::date DESC`, uid, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var d EarningsByDay
		if err := rows.Scan(&d.Date, &d.Amount, &d.Rides); err != nil {
			return nil, err
		}
		out.ByDay = append(out.ByDay, d)
	}
	return out, rows.Err()
}

func scanSummaries(rows pgx.Rows) ([]RideSummary, error) {
	var out []RideSummary
	for rows.Next() {
		r, err := scanSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func scanSummary(row pgx.Row) (*RideSummary, error) {
	var r RideSummary
	err := row.Scan(&r.ID, &r.FirebaseRideID, &r.ClientID, &r.DriverID, &r.FollowerID,
		&r.Status, &r.RideType, &r.VehicleType, &r.PaymentType,
		&r.EstimatedPrice, &r.FinalFare, &r.RequestedAt, &r.CompletedAt)
	return &r, err
}

type LocationPoint struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
	At  int64   `json:"at,omitempty"`
}

// RecordLocations — telemetría GPS del viaje (ride_track_points).
// Solo driver/follower asignado durante viaje activo; batch insert que
// persiste recorded_at (hora real de la muestra en el cliente; NOW() si falta).
func (s *Service) RecordLocations(ctx context.Context, rideID, uid string, pts []LocationPoint) (int, error) {
	if len(pts) == 0 {
		return 0, nil
	}
	if len(pts) > 200 {
		pts = pts[:200]
	}
	var driverID, followerID *string
	var status string
	err := s.pool.QueryRow(ctx,
		`SELECT driver_id, follower_driver_id, status::text FROM public.rides WHERE id = $1::uuid`,
		rideID).Scan(&driverID, &followerID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, apperr.New(404, "ride not found")
		}
		return 0, err
	}
	isDriver := (driverID != nil && *driverID == uid) || (followerID != nil && *followerID == uid)
	if !isDriver {
		return 0, apperr.ErrForbidden
	}
	switch status {
	case "accepted", "driver_on_route", "driver_arrived", "in_progress":
	default:
		return 0, apperr.New(409, "ride not active")
	}
	b := &pgx.Batch{}
	for _, p := range pts {
		at := time.Now()
		if p.At > 0 {
			at = time.UnixMilli(p.At).UTC()
		}
		b.Queue(`INSERT INTO public.ride_track_points
			(ride_id, latitude, longitude, recorded_at)
			VALUES ($1::uuid, $2, $3, $4)`,
			rideID, p.Lat, p.Lng, at)
	}
	res := s.pool.SendBatch(ctx, b)
	if err := res.Close(); err != nil {
		return 0, err
	}
	return len(pts), nil
}

// IntelligentETA — getIntelligentETA v1: Haversine desde posición actual al
// destino del viaje, velocidad promedio 40 km/h.
func (s *Service) IntelligentETA(ctx context.Context, rideID, uid string, lat, lng float64) (map[string]any, error) {
	var ok bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.rides WHERE id = $1::uuid
			AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2))`,
		rideID, uid).Scan(&ok); err != nil || !ok {
		return nil, apperr.ErrForbidden
	}
	var dLat, dLng float64
	err := s.pool.QueryRow(ctx, `
		SELECT rl.latitude, rl.longitude
		FROM public.rides r
		JOIN public.ride_locations rl ON rl.id = r.destination_location_id
		WHERE r.id = $1::uuid`, rideID).Scan(&dLat, &dLng)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(400, "el viaje no tiene destino")
	}
	if err != nil {
		return nil, err
	}
	const avgSpeedKmh = 40.0 // mismo valor v1 (ciudad)
	dKm := haversineKm(lat, lng, dLat, dLng)
	etaMin := int(dKm/avgSpeedKmh*60 + 0.5)
	if etaMin < 1 {
		etaMin = 1
	}
	return map[string]any{
		"etaMinutes":        etaMin,
		"etaTimestamp":      time.Now().Add(time.Duration(etaMin) * time.Minute).UTC().Format(time.RFC3339),
		"distanceRemaining": int(dKm * 1000),
	}, nil
}

// DiagnosticRides — diagnosticRides v1: conteos de viajes del propio usuario
// (debug del cliente, sin datos ajenos).
func (s *Service) DiagnosticRides(ctx context.Context, uid string) (map[string]any, error) {
	var asClient, asDriver, asFollower, total int
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM public.rides WHERE client_id = $1 AND deleted_at IS NULL),
		  (SELECT COUNT(*) FROM public.rides WHERE driver_id = $1 AND deleted_at IS NULL),
		  (SELECT COUNT(*) FROM public.rides WHERE follower_driver_id = $1 AND deleted_at IS NULL),
		  (SELECT COUNT(*) FROM public.rides WHERE deleted_at IS NULL)`,
		uid).Scan(&asClient, &asDriver, &asFollower, &total)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"asClient": asClient, "asDriver": asDriver,
		"asFollower": asFollower, "totalRides": total,
	}, nil
}

// RideStats — getRideStats v1 (admin): agregados por estado + revenue.
func (s *Service) RideStats(ctx context.Context) (map[string]any, error) {
	out := map[string]any{"byStatus": map[string]int{}}
	rows, err := s.pool.Query(ctx,
		`SELECT status::text, COUNT(*) FROM public.rides WHERE deleted_at IS NULL GROUP BY status`)
	if err != nil {
		return nil, err
	}
	byStatus := map[string]int{}
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			rows.Close()
			return nil, err
		}
		byStatus[st] = n
	}
	rows.Close()
	out["byStatus"] = byStatus
	var revenue float64
	var rides int
	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(total), 0), COUNT(*)
		FROM public.payments WHERE status = 'confirmed' AND deleted_at IS NULL`,
	).Scan(&revenue, &rides); err != nil {
		return nil, err
	}
	out["confirmedPayments"] = rides
	out["confirmedRevenue"] = revenue
	return out, nil
}

// NotifyProximity — notifyProximityRide v1: el conductor avisa al cliente que
// está cerca. Valida viaje 'requested' sin driver, compatibilidad moto↔moto,
// modo designado verificado, y feature codes del snapshot ⊆ grants del driver.
// El push lo dispara el consumer (pending event 'proximity_notify').
func (s *Service) NotifyProximity(ctx context.Context, rideID, driverUID string) error {
	var clientID, rideType, rideVeh string
	var designatedVeh, snapshotRaw *string
	err := s.pool.QueryRow(ctx, `
		SELECT client_id, COALESCE(ride_type,'normal'), COALESCE(vehicle_type,'auto'),
		       designated_driver_vehicle::text, pricing_snapshot::text
		FROM public.rides
		WHERE id = $1::uuid AND status = 'requested' AND driver_id IS NULL
		  AND deleted_at IS NULL`, rideID,
	).Scan(&clientID, &rideType, &rideVeh, &designatedVeh, &snapshotRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(409, "ride no disponible")
	}
	if err != nil {
		return err
	}

	// Designated: solo conductores con rol designado verificado.
	var desStatus string
	var driverVehType string
	err = s.pool.QueryRow(ctx, `
		SELECT d.designated_role_status::text,
		       COALESCE((SELECT v.type FROM public.vehicles v
		                 WHERE v.driver_id = d.id AND v.is_active = TRUE
		                   AND v.deleted_at IS NULL LIMIT 1), 'auto')
		FROM public.drivers d
		WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.account_status = 'active'`,
		driverUID).Scan(&desStatus, &driverVehType)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(403, "driver no elegible")
	}
	if err != nil {
		return err
	}
	rideIsDesignated := rideType == "designated_driver"
	if rideIsDesignated && desStatus != "verified" {
		return apperr.New(409, "ride requiere conductor designado verificado")
	}
	effectiveVeh := rideVeh
	if rideIsDesignated && designatedVeh != nil && *designatedVeh != "" {
		effectiveVeh = *designatedVeh
	}
	if strings.Contains(strings.ToLower(effectiveVeh), "moto") !=
		strings.Contains(strings.ToLower(driverVehType), "moto") {
		return apperr.New(409, "tipo de vehículo incompatible")
	}

	// featureCodes requeridos ⊆ grants del conductor (driver+vehicle).
	if snapshotRaw != nil {
		var snap struct {
			FeatureCodes []string `json:"featureCodes"`
		}
		if json.Unmarshal([]byte(*snapshotRaw), &snap) == nil && len(snap.FeatureCodes) > 0 {
			rows, err := s.pool.Query(ctx, `
				SELECT f.code FROM public.features f WHERE f.id IN (
					SELECT a.feature_id FROM public.driver_feature_assignments a
					JOIN public.drivers d ON d.id = a.driver_id
					WHERE d.user_id = $1 AND a.is_active = TRUE
					UNION
					SELECT a.feature_id FROM public.vehicle_feature_assignments a
					JOIN public.vehicles v ON v.id = a.vehicle_id
					JOIN public.drivers d ON d.id = v.driver_id
					WHERE d.user_id = $1 AND a.is_active = TRUE
				)`, driverUID)
			if err != nil {
				return err
			}
			granted := map[string]bool{}
			for rows.Next() {
				var c string
				_ = rows.Scan(&c)
				granted[c] = true
			}
			rows.Close()
			for _, need := range snap.FeatureCodes {
				if !granted[need] {
					return apperr.New(409, "features del viaje no cubiertos por el conductor")
				}
			}
		}
	}

	// Evento backend → consumer hace push al cliente (RideDriverOffered).
	_, err = s.fs.Collection(fs.ColPendingEvents).Doc("proximity-"+rideID+"-"+driverUID).Set(ctx, map[string]any{
		"eventType":     "proximity_notify",
		"aggregateType": "ride",
		"aggregateId":   rideID,
		"payload": map[string]any{
			"rideId": rideID, "driverId": driverUID, "clientId": clientID,
		},
		"status":    "pending",
		"source":    "backend",
		"createdAt": firestore.ServerTimestamp,
	})
	return err
}

// ListLocations — getRideLocations v1: ruta contratada (ride_locations) +
// telemetría (ride_track_points) del viaje (participante). Mismo shape que
// v1: los puntos GPS salen con type='tracking' ordenados por recorded_at.
func (s *Service) ListLocations(ctx context.Context, rideID, uid, role string) ([]map[string]any, error) {
	staff := role == "admin" || role == "operator"
	if !staff {
		var ok bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM public.rides WHERE id = $1::uuid
				AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2))`,
			rideID, uid).Scan(&ok); err != nil || !ok {
			return nil, apperr.ErrForbidden
		}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, location_type, location_order, latitude, longitude,
		       address, created_at::text
		FROM public.ride_locations WHERE ride_id = $1::uuid
		ORDER BY location_order`, rideID)
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for rows.Next() {
		var id, lt, addr, at string
		var order int
		var lat, lng float64
		if err := rows.Scan(&id, &lt, &order, &lat, &lng, &addr, &at); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "type": lt, "order": order, "lat": lat, "lng": lng,
			"address": addr, "createdAt": at,
		})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	tps, err := s.pool.Query(ctx, `
		SELECT id::text, latitude, longitude, recorded_at::text
		FROM public.ride_track_points WHERE ride_id = $1::uuid
		ORDER BY recorded_at`, rideID)
	if err != nil {
		return nil, err
	}
	defer tps.Close()
	for tps.Next() {
		var id, at string
		var lat, lng float64
		if err := tps.Scan(&id, &lat, &lng, &at); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "type": "tracking", "lat": lat, "lng": lng,
			"createdAt": at,
		})
	}
	return out, tps.Err()
}
