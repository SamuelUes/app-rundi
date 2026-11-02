// Package inspections — designated_driver_inspections (evidencia fotográfica
// del vehículo del conductor designado). Port de
// api/designated_driver_inspections_sequelize.ts.
package inspections

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

type Inspection struct {
	ID                 string    `json:"id"`
	RideID             string    `json:"rideId"`
	DriverID           string    `json:"driverId"`
	VehicleFrontPhoto  *string   `json:"vehicleFrontPhoto,omitempty"`
	VehicleRearPhoto   *string   `json:"vehicleRearPhoto,omitempty"`
	InteriorFrontPhoto *string   `json:"interiorFrontPhoto,omitempty"`
	InteriorRearPhoto  *string   `json:"interiorRearPhoto,omitempty"`
	Status             string    `json:"status"`
	InspectedAt        time.Time `json:"inspectedAt"`
}

const cols = `id::text, ride_id::text, driver_id, vehicle_front_photo,
	vehicle_rear_photo, interior_front_photo, interior_rear_photo,
	status::text, inspected_at`

type SubmitRequest struct {
	RideID             string `json:"rideId"`
	VehicleFrontPhoto  string `json:"vehicleFrontPhoto,omitempty"`
	VehicleRearPhoto   string `json:"vehicleRearPhoto,omitempty"`
	InteriorFrontPhoto string `json:"interiorFrontPhoto,omitempty"`
	InteriorRearPhoto  string `json:"interiorRearPhoto,omitempty"`
}

// Submit — solo el driver asignado del viaje puede subir la inspección.
func (s *Service) Submit(ctx context.Context, uid string, in SubmitRequest) (*Inspection, error) {
	if in.RideID == "" {
		return nil, apperr.New(400, "rideId requerido")
	}
	var driverID *string
	err := s.pool.QueryRow(ctx,
		`SELECT driver_id FROM public.rides WHERE id = $1::uuid`, in.RideID).Scan(&driverID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(404, "ride not found")
		}
		return nil, err
	}
	if driverID == nil || *driverID != uid {
		return nil, apperr.ErrForbidden
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO public.designated_driver_inspections
			(ride_id, driver_id, vehicle_front_photo, vehicle_rear_photo,
			 interior_front_photo, interior_rear_photo)
		VALUES ($1::uuid, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''))
		RETURNING `+cols,
		in.RideID, uid, in.VehicleFrontPhoto, in.VehicleRearPhoto,
		in.InteriorFrontPhoto, in.InteriorRearPhoto)
	return scan(row)
}

// GetByRide — inspección del viaje (participante o staff).
func (s *Service) GetByRide(ctx context.Context, rideID, uid, role string) (*Inspection, error) {
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
	row := s.pool.QueryRow(ctx, `
		SELECT `+cols+` FROM public.designated_driver_inspections
		WHERE ride_id = $1::uuid ORDER BY inspected_at DESC LIMIT 1`, rideID)
	i, err := scan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "inspection not found")
	}
	return i, err
}

// Update — el driver actualiza fotos/status de su inspección.
func (s *Service) Update(ctx context.Context, id, uid string, in SubmitRequest) (*Inspection, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE public.designated_driver_inspections
		SET vehicle_front_photo = COALESCE(NULLIF($3,''), vehicle_front_photo),
		    vehicle_rear_photo = COALESCE(NULLIF($4,''), vehicle_rear_photo),
		    interior_front_photo = COALESCE(NULLIF($5,''), interior_front_photo),
		    interior_rear_photo = COALESCE(NULLIF($6,''), interior_rear_photo)
		WHERE id = $1::uuid AND driver_id = $2
		RETURNING `+cols,
		id, uid, in.VehicleFrontPhoto, in.VehicleRearPhoto,
		in.InteriorFrontPhoto, in.InteriorRearPhoto)
	i, err := scan(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "inspection not found or not yours")
	}
	return i, err
}

func scan(row pgx.Row) (*Inspection, error) {
	var i Inspection
	err := row.Scan(&i.ID, &i.RideID, &i.DriverID, &i.VehicleFrontPhoto,
		&i.VehicleRearPhoto, &i.InteriorFrontPhoto, &i.InteriorRearPhoto,
		&i.Status, &i.InspectedAt)
	return &i, err
}
