// Package emergency — emergency_calls (SOS durante viaje/fuera).
// Port de api/emergency_calls_sequelize.ts: create/getUser/updateStatus.
package emergency

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

type EmergencyCall struct {
	ID              string    `json:"id"`
	UserID          string    `json:"userId"`
	UserRole        string    `json:"userRole"`
	EmergencyType   string    `json:"emergencyType"`
	EmergencyNumber string    `json:"emergencyNumber"`
	Lat             *float64  `json:"lat,omitempty"`
	Lng             *float64  `json:"lng,omitempty"`
	Address         *string   `json:"address,omitempty"`
	RideID          *string   `json:"rideId,omitempty"`
	Notes           *string   `json:"notes,omitempty"`
	CallStatus      string    `json:"callStatus"`
	CalledAt        time.Time `json:"calledAt"`
}

const cols = `id::text, user_id, user_role, emergency_type, emergency_number,
	lat, lng, address, ride_id::text, notes, call_status, called_at`

type CreateRequest struct {
	EmergencyType   string   `json:"emergencyType"` // police | ambulance | fire | other
	EmergencyNumber string   `json:"emergencyNumber"`
	Lat             *float64 `json:"lat,omitempty"`
	Lng             *float64 `json:"lng,omitempty"`
	Address         string   `json:"address,omitempty"`
	RideID          *string  `json:"rideId,omitempty"`
	Notes           string   `json:"notes,omitempty"`
}

func (s *Service) Create(ctx context.Context, uid, role string, in CreateRequest) (*EmergencyCall, error) {
	if in.EmergencyType == "" || in.EmergencyNumber == "" {
		return nil, apperr.New(400, "emergencyType y emergencyNumber requeridos")
	}
	switch role {
	case "client", "driver", "operator", "admin":
	default:
		role = "client"
	}
	var addr, notes *string
	if in.Address != "" {
		addr = &in.Address
	}
	if in.Notes != "" {
		notes = &in.Notes
	}
	var rideID any
	if in.RideID != nil && *in.RideID != "" {
		// Solo si el actor participa del viaje (no confiar en el payload).
		var ok bool
		err := s.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM public.rides
				WHERE id = $1::uuid AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2))`,
			*in.RideID, uid).Scan(&ok)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, apperr.ErrForbidden
		}
		rideID = *in.RideID
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO public.emergency_calls
			(user_id, user_role, emergency_type, emergency_number,
			 lat, lng, address, ride_id, notes)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9)
		RETURNING `+cols,
		uid, role, in.EmergencyType, in.EmergencyNumber,
		in.Lat, in.Lng, addr, rideID, notes)
	var c EmergencyCall
	if err := row.Scan(&c.ID, &c.UserID, &c.UserRole, &c.EmergencyType,
		&c.EmergencyNumber, &c.Lat, &c.Lng, &c.Address, &c.RideID, &c.Notes,
		&c.CallStatus, &c.CalledAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Service) ListMine(ctx context.Context, uid string, limit int) ([]EmergencyCall, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT `+cols+` FROM public.emergency_calls
		WHERE user_id = $1 ORDER BY called_at DESC LIMIT $2`, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EmergencyCall
	for rows.Next() {
		var c EmergencyCall
		if err := rows.Scan(&c.ID, &c.UserID, &c.UserRole, &c.EmergencyType,
			&c.EmergencyNumber, &c.Lat, &c.Lng, &c.Address, &c.RideID,
			&c.Notes, &c.CallStatus, &c.CalledAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// UpdateStatus — dueño o staff actualiza call_status.
func (s *Service) UpdateStatus(ctx context.Context, id, uid, role, status string) error {
	switch status {
	case "initiated", "in_progress", "completed", "canceled":
	default:
		return apperr.New(400, "status inválido")
	}
	staff := role == "admin" || role == "operator"
	tag, err := s.pool.Exec(ctx, `
		UPDATE public.emergency_calls SET call_status = $3
		WHERE id = $1::uuid AND ($4 OR user_id = $2)`, id, uid, status, staff)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return apperr.ErrForbidden
	}
	return nil
}
