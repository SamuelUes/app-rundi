package projections

import (
	"context"
	"errors"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/ratings"
)

func projectPendingRatingForRide(ctx context.Context, pool *pgxpool.Pool, db *firestore.Client, rideID string) error {
	var uid string
	err := pool.QueryRow(ctx, `SELECT client_id FROM public.rides WHERE id=$1`, rideID).Scan(&uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return projectPendingRating(ctx, pool, db, uid)
}

func projectPendingRating(ctx context.Context, pool *pgxpool.Pool, db *firestore.Client, uid string) error {
	result, err := ratings.LatestClientRating(ctx, pool, uid)
	if result == nil && err == nil {
		return nil
	}
	if err != nil {
		return err
	}
	ref := db.Collection(fs.ColUsers).Doc(uid).Collection("pendingActions").Doc("rating")
	return db.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			prev := snap.Data()
			if at, ok := prev["completedAt"].(time.Time); ok {
				prevID, _ := prev["rideId"].(string)
				prevVersion, _ := prev["version"].(int64)
				if at.After(result.CompletedAt) || (at.Equal(result.CompletedAt) && (prevID > result.RideID || (prevID == result.RideID && prevVersion >= result.Version))) {
					return nil
				}
			}
		}
		return tx.Set(ref, map[string]any{
			"rideId": result.RideID, "firebaseRideId": result.FirebaseID, "driverId": result.DriverID,
			"followerDriverId": result.FollowerID, "completedAt": result.CompletedAt,
			"version": result.Version, "status": result.Status, "captainRated": result.CaptainRated, "followerRated": result.FollowerRated,
		})
	})
}
