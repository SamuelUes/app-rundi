package ratings

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PendingRating struct {
	RideID        string    `json:"rideId"`
	FirebaseID    string    `json:"firebaseRideId"`
	DriverID      string    `json:"driverId"`
	FollowerID    *string   `json:"followerDriverId,omitempty"`
	CompletedAt   time.Time `json:"completedAt"`
	Version       int64     `json:"version"`
	Status        string    `json:"status"`
	CaptainRated  bool      `json:"captainRated"`
	FollowerRated bool      `json:"followerRated"`
}

func LatestClientRating(ctx context.Context, pool *pgxpool.Pool, uid string) (*PendingRating, error) {
	var result PendingRating
	err := pool.QueryRow(ctx, `
		SELECT r.id::text, COALESCE(r.firebase_ride_id, ''), COALESCE(r.driver_id, ''),
		       r.follower_driver_id, r.completed_at, r.version, COALESCE(d.decision, 'pending'),
		       EXISTS (SELECT 1 FROM public.ratings rt WHERE rt.ride_id=r.id AND rt.from_user_id=r.client_id AND rt.to_user_id=r.driver_id AND rt.deleted_at IS NULL),
		       EXISTS (SELECT 1 FROM public.ratings rt WHERE rt.ride_id=r.id AND rt.from_user_id=r.client_id AND rt.to_user_id=r.follower_driver_id AND rt.deleted_at IS NULL)
		FROM public.rides r
		LEFT JOIN public.ride_rating_decisions d ON d.ride_id=r.id AND d.actor_id=r.client_id
		WHERE r.client_id=$1 AND r.completed_at IS NOT NULL AND r.deleted_at IS NULL
		ORDER BY r.completed_at DESC, r.id DESC LIMIT 1`, uid).Scan(
		&result.RideID, &result.FirebaseID, &result.DriverID, &result.FollowerID,
		&result.CompletedAt, &result.Version, &result.Status, &result.CaptainRated, &result.FollowerRated,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &result, err
}
