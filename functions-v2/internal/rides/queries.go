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
	ID                 string     `json:"id"`
	FirebaseRideID     *string    `json:"firebaseRideId,omitempty"`
	ClientID           string     `json:"clientId"`
	DriverID           *string    `json:"driverId,omitempty"`
	FollowerID         *string    `json:"followerDriverId,omitempty"`
	Status             string     `json:"status"`
	RideType           *string    `json:"rideType,omitempty"`
	VehicleType        *string    `json:"vehicleType,omitempty"`
	PaymentType        *string    `json:"paymentType,omitempty"`
	EstimatedPrice     *float64   `json:"estimatedPrice,omitempty"`
	FinalFare          *float64   `json:"finalFare,omitempty"`
	EstimatedDistance  *int       `json:"estimatedDistance,omitempty"`
	Passengers         *int       `json:"passengers,omitempty"`
	HasMultipleStops   bool       `json:"hasMultipleStops"`
	WaypointsCount     *int       `json:"waypointsCount,omitempty"`
	OriginAddress      *string    `json:"originAddress,omitempty"`
	DestinationAddress *string    `json:"destinationAddress,omitempty"`
	AllAddresses       []string   `json:"allAddresses,omitempty"`
	ClientName         *string    `json:"clientName,omitempty"`
	DriverName         *string    `json:"driverName,omitempty"`
	DriverRating       *float64   `json:"driverRating,omitempty"`
	MyRating           *int       `json:"rating,omitempty"`
	RequestedAt        time.Time  `json:"requestedAt"`
	CompletedAt        *time.Time `json:"completedAt,omitempty"`
}

const summaryCols = `r.id, r.firebase_ride_id, r.client_id, r.driver_id, r.follower_driver_id,
	r.status::text, r.ride_type, r.vehicle_type, r.payment_type,
	r.estimated_price, r.final_fare, r.estimated_distance, r.passengers,
	r.has_multiple_stops, r.waypoints_count,
	ol.address, dl.address,
	(SELECT array_agg(l2.address ORDER BY l2.location_order)
	   FROM public.ride_locations l2
	  WHERE l2.ride_id = r.id AND NULLIF(l2.address, '') IS NOT NULL),
	cu.name, du.name, d.average_rating,
	(SELECT rt.rating FROM public.ratings rt
	  WHERE rt.ride_id = r.id AND rt.from_user_id = $1
	    AND rt.deleted_at IS NULL LIMIT 1),
	r.requested_at, r.completed_at`

const summaryJoins = `
	LEFT JOIN public.ride_locations ol ON ol.id = r.origin_location_id
	LEFT JOIN public.ride_locations dl ON dl.id = r.destination_location_id
	LEFT JOIN public.users cu ON cu.id = r.client_id
	LEFT JOIN public.drivers d ON d.user_id = r.driver_id
	LEFT JOIN public.users du ON du.id = r.driver_id`

// ListMyRides — historial del actor (client|driver|follower según ?role).
func (s *Service) ListMyRides(ctx context.Context, uid, role, status string, limit int) ([]RideSummary, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var where string
	switch role {
	case "driver":
		where = "r.driver_id = $1"
	case "follower":
		where = "r.follower_driver_id = $1"
	default:
		role = "client"
		where = "r.client_id = $1"
	}
	q := `SELECT ` + summaryCols + ` FROM public.rides r` + summaryJoins + `
		WHERE ` + where + ` AND r.deleted_at IS NULL`
	args := []any{uid}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(` AND r.status = $%d::ride_status`, len(args))
	}
	args = append(args, limit)
	q += fmt.Sprintf(` ORDER BY r.requested_at DESC LIMIT $%d`, len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSummaries(rows)
}

// RideDetailLocation — parada de la ruta contratada (ride_locations).
type RideDetailLocation struct {
	Type      string   `json:"type"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
	Address   *string  `json:"address,omitempty"`
	Order     int      `json:"order"`
}

// RideDetailParticipant — cliente o conductor del viaje (datos públicos del otro).
type RideDetailParticipant struct {
	ID            string   `json:"id"`
	Name          *string  `json:"name,omitempty"`
	Email         *string  `json:"email,omitempty"`
	Phone         *string  `json:"phone,omitempty"`
	LicenseNumber *string  `json:"licenseNumber,omitempty"`
	Rating        *float64 `json:"rating,omitempty"`
}

// RideDetailVehicle — vehículo activo del conductor asignado.
type RideDetailVehicle struct {
	Brand              *string `json:"brand,omitempty"`
	Model              *string `json:"model,omitempty"`
	Year               *int    `json:"year,omitempty"`
	Color              *string `json:"color,omitempty"`
	Plate              *string `json:"plate,omitempty"`
	RegistrationNumber *string `json:"registrationNumber,omitempty"`
}

// RideDetailPayment — pago del viaje (más reciente primero).
type RideDetailPayment struct {
	ID            string     `json:"id"`
	Status        string     `json:"status"`
	Amount        *float64   `json:"amount,omitempty"`
	Tip           *float64   `json:"tip,omitempty"`
	Commission    *float64   `json:"commission,omitempty"`
	Total         *float64   `json:"total,omitempty"`
	FinalAmount   *float64   `json:"finalAmount,omitempty"`
	PaymentMethod *string    `json:"paymentMethod,omitempty"`
	PaidAt        *time.Time `json:"paidAt,omitempty"`
}

// RideDetail — detalle completo para la pantalla de historial.
type RideDetail struct {
	RideSummary
	EstimatedDuration    *int                   `json:"estimatedDuration,omitempty"`
	ActualDistance       *int                   `json:"actualDistance,omitempty"`
	ActualDuration       *int                   `json:"actualDuration,omitempty"`
	ClientSuggestedPrice *float64               `json:"clientSuggestedPrice,omitempty"`
	DriverOfferedPrice   *float64               `json:"driverOfferedPrice,omitempty"`
	Notes                *string                `json:"notes,omitempty"`
	AcceptedAt           *time.Time             `json:"acceptedAt,omitempty"`
	StartedAt            *time.Time             `json:"startedAt,omitempty"`
	CanceledAt           *time.Time             `json:"canceledAt,omitempty"`
	CancelReason         *string                `json:"cancelReason,omitempty"`
	CanceledBy           *string                `json:"canceledBy,omitempty"`
	Locations            []RideDetailLocation   `json:"locations"`
	Client               *RideDetailParticipant `json:"client,omitempty"`
	Driver               *RideDetailParticipant `json:"driver,omitempty"`
	Vehicle              *RideDetailVehicle     `json:"vehicle,omitempty"`
	Payment              *RideDetailPayment     `json:"payment,omitempty"`
	Payments             []RideDetailPayment    `json:"payments,omitempty"`
	PrimaryPayment       *RideDetailPayment     `json:"primaryPayment,omitempty"`
}

// GetRideDetail — detalle si el actor participa (o es admin). Devuelve la
// fila completa + ruta contratada + participantes + vehículo + pagos. Un
// conductor con oferta (aún no participante) ve ruta/precio pero no los
// datos personales ni el pago.
func (s *Service) GetRideDetail(ctx context.Context, rideID, uid, role string) (*RideDetail, error) {
	var d RideDetail
	err := s.pool.QueryRow(ctx, `
		SELECT `+summaryCols+`,
			r.estimated_duration, r.actual_distance, r.actual_duration,
			r.client_suggested_price, r.driver_offered_price,
			r.notes, r.accepted_at, r.started_at, r.canceled_at,
			r.cancel_reason, r.canceled_by::text
		FROM public.rides r`+summaryJoins+`
		WHERE r.id = $2::uuid AND r.deleted_at IS NULL`, uid, rideID).
		Scan(&d.ID, &d.FirebaseRideID, &d.ClientID, &d.DriverID, &d.FollowerID,
			&d.Status, &d.RideType, &d.VehicleType, &d.PaymentType,
			&d.EstimatedPrice, &d.FinalFare, &d.EstimatedDistance, &d.Passengers,
			&d.HasMultipleStops, &d.WaypointsCount,
			&d.OriginAddress, &d.DestinationAddress, &d.AllAddresses,
			&d.ClientName, &d.DriverName, &d.DriverRating, &d.MyRating,
			&d.RequestedAt, &d.CompletedAt,
			&d.EstimatedDuration, &d.ActualDistance, &d.ActualDuration,
			&d.ClientSuggestedPrice, &d.DriverOfferedPrice,
			&d.Notes, &d.AcceptedAt, &d.StartedAt, &d.CanceledAt,
			&d.CancelReason, &d.CanceledBy)
	if err != nil {
		return nil, apperr.New(404, "ride not found")
	}
	isParticipant := d.ClientID == uid ||
		(d.DriverID != nil && *d.DriverID == uid) ||
		(d.FollowerID != nil && *d.FollowerID == uid)
	if !isParticipant && role != "admin" && role != "operator" {
		// Un conductor con oferta pendiente/aceptada puede leer el detalle:
		// es su única vía de ver la ruta/precio antes de aceptar.
		offerRef := s.fs.Collection(fs.ColDriverOffers).Doc(rideID + "_" + uid)
		if snap, err := offerRef.Get(ctx); err != nil || !snap.Exists() {
			return nil, apperr.ErrForbidden
		}
	}

	d.Locations = []RideDetailLocation{}
	locRows, err := s.pool.Query(ctx, `
		SELECT location_type, latitude, longitude, address, location_order
		FROM public.ride_locations
		WHERE ride_id = $1::uuid
		ORDER BY location_order`, rideID)
	if err != nil {
		return nil, err
	}
	for locRows.Next() {
		var loc RideDetailLocation
		if err := locRows.Scan(&loc.Type, &loc.Latitude, &loc.Longitude, &loc.Address, &loc.Order); err != nil {
			locRows.Close()
			return nil, err
		}
		d.Locations = append(d.Locations, loc)
	}
	locRows.Close()
	if err := locRows.Err(); err != nil {
		return nil, err
	}

	// Datos personales y pago solo para participantes (o admin/operator): un
	// conductor con oferta sin asignar ve la ruta pero no contactos ni cobros.
	if !isParticipant && role != "admin" && role != "operator" {
		return &d, nil
	}

	var client RideDetailParticipant
	if err := s.pool.QueryRow(ctx, `
		SELECT id, name, email, phone FROM public.users WHERE id = $1`, d.ClientID).
		Scan(&client.ID, &client.Name, &client.Email, &client.Phone); err == nil {
		d.Client = &client
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	if d.DriverID != nil && *d.DriverID != "" {
		var drv RideDetailParticipant
		var driverUUID *string
		if err := s.pool.QueryRow(ctx, `
			SELECT d.id::text, u.id, u.name, u.email, u.phone,
			       d.license_number, d.average_rating
			FROM public.drivers d
			JOIN public.users u ON u.id = d.user_id
			WHERE d.user_id = $1 AND d.deleted_at IS NULL`, *d.DriverID).
			Scan(&driverUUID, &drv.ID, &drv.Name, &drv.Email, &drv.Phone,
				&drv.LicenseNumber, &drv.Rating); err == nil {
			d.Driver = &drv
			if driverUUID != nil {
				var v RideDetailVehicle
				if err := s.pool.QueryRow(ctx, `
					SELECT brand, model, year, color, plate, registration_number
					FROM public.vehicles
					WHERE driver_id = $1::uuid AND is_active = TRUE AND deleted_at IS NULL
					ORDER BY updated_at DESC LIMIT 1`, *driverUUID).
					Scan(&v.Brand, &v.Model, &v.Year, &v.Color, &v.Plate, &v.RegistrationNumber); err == nil {
					d.Vehicle = &v
				} else if !errors.Is(err, pgx.ErrNoRows) {
					return nil, err
				}
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	d.Payments = []RideDetailPayment{}
	payRows, err := s.pool.Query(ctx, `
		SELECT id::text, status::text, amount, tip, commission, total,
		       payment_method::text, paid_at
		FROM public.payments
		WHERE ride_id = $1::uuid
		ORDER BY created_at DESC`, rideID)
	if err != nil {
		return nil, err
	}
	for payRows.Next() {
		var p RideDetailPayment
		if err := payRows.Scan(&p.ID, &p.Status, &p.Amount, &p.Tip, &p.Commission,
			&p.Total, &p.PaymentMethod, &p.PaidAt); err != nil {
			payRows.Close()
			return nil, err
		}
		p.FinalAmount = p.Total
		d.Payments = append(d.Payments, p)
	}
	payRows.Close()
	if err := payRows.Err(); err != nil {
		return nil, err
	}
	if len(d.Payments) > 0 {
		primary := d.Payments[0]
		d.PrimaryPayment = &primary
		d.Payment = &primary
	}

	return &d, nil
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
		  AND r.completed_at >= NOW() - $2 * INTERVAL '1 day'`,
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
		  AND r.completed_at >= NOW() - $2 * INTERVAL '1 day'
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
		&r.EstimatedPrice, &r.FinalFare, &r.EstimatedDistance, &r.Passengers,
		&r.HasMultipleStops, &r.WaypointsCount,
		&r.OriginAddress, &r.DestinationAddress, &r.AllAddresses,
		&r.ClientName, &r.DriverName, &r.DriverRating, &r.MyRating,
		&r.RequestedAt, &r.CompletedAt)
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

	// featureCodes requeridos ⊆ grants del conductor (driver+vehicle). Solo los
	// features con elegibilidad (senior/premium/pet_friendly) exigen grant:
	// los de ajuste temporal (p.ej. 'night') son de pricing, no del conductor.
	if snapshotRaw != nil {
		var snap struct {
			FeatureCodes []string `json:"featureCodes"`
		}
		if json.Unmarshal([]byte(*snapshotRaw), &snap) == nil && len(snap.FeatureCodes) > 0 {
			required := map[string]bool{}
			reqRows, err := s.pool.Query(ctx, `
				SELECT code FROM public.features
				WHERE code = ANY($1) AND eligibility_subject <> 'none'`, snap.FeatureCodes)
			if err != nil {
				return err
			}
			for reqRows.Next() {
				var c string
				_ = reqRows.Scan(&c)
				required[c] = true
			}
			reqRows.Close()
			rows, err := s.pool.Query(ctx, `
				SELECT f.code FROM public.features f WHERE f.id IN (
					SELECT a.feature_id FROM public.driver_feature_assignments a
					JOIN public.drivers d ON d.id = a.driver_id
					WHERE d.user_id = $1 AND a.is_active = TRUE AND f.code <> 'premium'
					UNION
					SELECT a.feature_id FROM public.vehicle_feature_assignments a
					JOIN public.vehicles v ON v.id = a.vehicle_id
					JOIN public.drivers d ON d.id = v.driver_id
					WHERE d.user_id = $1 AND a.is_active = TRUE AND v.is_active = TRUE
					  AND v.deleted_at IS NULL AND f.code <> 'premium'
					  AND v.id = (SELECT v2.id FROM public.vehicles v2 WHERE v2.driver_id = d.id AND v2.is_active = TRUE AND v2.deleted_at IS NULL ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
					UNION
					SELECT f.id FROM public.vehicles v
					JOIN public.drivers d ON d.id = v.driver_id
					WHERE d.user_id = $1 AND v.is_active = TRUE AND v.deleted_at IS NULL
					  AND v.id = (SELECT v2.id FROM public.vehicles v2 WHERE v2.driver_id = d.id AND v2.is_active = TRUE AND v2.deleted_at IS NULL ORDER BY v2.created_at DESC, v2.id DESC LIMIT 1)
					  AND f.code = 'premium' AND public.vehicle_premium_eligible(v.registration_ocr_year, v.type, NOW())
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
			for need := range required {
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
