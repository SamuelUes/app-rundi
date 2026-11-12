package projections

import (
	"context"
	"errors"
	"fmt"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/fs"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func projectPickupCode(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID string) error {
	var firebaseID *string
	var clientID, rideStatus string
	var code *string
	var version int64
	err := pool.QueryRow(ctx, `
		SELECT r.firebase_ride_id, r.client_id, r.status::text, r.version, p.code
		FROM public.rides r LEFT JOIN public.ride_pickup_codes p ON p.ride_id=r.id
		WHERE r.id=$1::uuid`, rideID).Scan(&firebaseID, &clientID, &rideStatus, &version, &code)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read pickup projection: %w", err)
	}
	if code == nil {
		return nil
	}
	liveID := rideID
	if firebaseID != nil && *firebaseID != "" {
		liveID = *firebaseID
	}
	data := map[string]any{"clientId": clientID, "version": version, "code": nil}
	if rideStatus == "accepted" || rideStatus == "driver_on_route" || rideStatus == "driver_arrived" {
		data["code"] = *code
	}
	ref := c.Collection(fs.ColTripsLive).Doc(liveID).Collection("private").Doc("pickup")
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			if previous, ok := snap.Data()["version"].(int64); ok && previous >= version {
				return nil
			}
		}
		return tx.Set(ref, data)
	})
}
