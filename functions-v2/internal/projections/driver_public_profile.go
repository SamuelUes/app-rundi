package projections

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/drivers"
	"github.com/rundi/functions-v2/internal/fs"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Read SQL after the Firestore transaction's read: a concurrent projector
// forces a retry, so an older snapshot cannot overwrite a newer one.
func projectPublicDriver(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, uid string) error {
	if uid == "" {
		return nil
	}
	ref := c.Collection(fs.ColDriverPublic).Doc(uid)
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		if _, err := tx.Get(ref); err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		var name, photo *string
		var rating *float64
		var totalRides, totalRatings int64
		var vehicleJSON, reviewsJSON, complimentsJSON []byte
		err := pool.QueryRow(ctx, `
			WITH driver_ratings AS (
				SELECT * FROM public.ratings
				WHERE to_user_id = $1 AND deleted_at IS NULL
				  AND (rated_role IN ('driver', 'captain', 'follower') OR rated_role IS NULL)
			)
			SELECT u.name, d.profile_photo,
			       (SELECT ROUND(AVG(rating), 2) FROM driver_ratings),
			       (SELECT COUNT(*) FROM driver_ratings),
			       (SELECT COUNT(*) FROM public.rides r
			        WHERE (r.driver_id = $1 OR r.follower_driver_id = $1)
			          AND r.status IN ('completed','rating_completed','rating_skipped') AND r.deleted_at IS NULL),
			       (SELECT jsonb_build_object('plate', v.plate, 'type', v.type,
			                                 'brand', v.brand, 'model', v.model, 'color', v.color)
			        FROM public.vehicles v WHERE v.driver_id = d.id AND v.is_active = TRUE AND v.deleted_at IS NULL
			        ORDER BY v.created_at DESC, v.id DESC LIMIT 1),
			       COALESCE((SELECT jsonb_agg(jsonb_build_object('rating', r.rating, 'comment', r.comment,
			                                                    'createdAt', r.created_at) ORDER BY r.created_at DESC, r.id DESC)
			                 FROM (SELECT id, rating, LEFT(comment, 500) AS comment, created_at FROM driver_ratings
			                       WHERE comment IS NOT NULL AND BTRIM(comment) <> ''
			                       ORDER BY created_at DESC, id DESC LIMIT 5) r), '[]'::jsonb),
			       (SELECT jsonb_build_object(
			           'punctuality', COUNT(*) FILTER (WHERE punctuality > 0),
			           'cleanliness', COUNT(*) FILTER (WHERE cleanliness > 0),
			           'communication', COUNT(*) FILTER (WHERE communication > 0),
			           'driving', COUNT(*) FILTER (WHERE driving > 0),
			           'safety', COUNT(*) FILTER (WHERE safety > 0),
			           'friendliness', COUNT(*) FILTER (WHERE friendliness > 0))
			        FROM driver_ratings)
			FROM public.drivers d LEFT JOIN public.users u ON u.id = d.user_id
			WHERE d.user_id = $1 AND d.deleted_at IS NULL`, uid).
			Scan(&name, &photo, &rating, &totalRatings, &totalRides, &vehicleJSON, &reviewsJSON, &complimentsJSON)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read public driver profile: %w", err)
		}
		var vehicle any
		var reviews []any
		var compliments map[string]any
		if vehicleJSON != nil {
			if err := json.Unmarshal(vehicleJSON, &vehicle); err != nil {
				return err
			}
		}
		if err := json.Unmarshal(reviewsJSON, &reviews); err != nil {
			return err
		}
		if err := json.Unmarshal(complimentsJSON, &compliments); err != nil {
			return err
		}
		features, err := drivers.NewService(pool, nil).MyFeatureCapabilities(ctx, uid)
		if err != nil {
			return err
		}
		return tx.Set(ref, map[string]any{
			"driverId": uid, "displayName": name, "photoUrl": photo,
			"averageRating": rating, "totalRatings": totalRatings, "totalRides": totalRides,
			"vehicle": vehicle, "reviews": reviews, "compliments": compliments,
			"features": features, "updatedAt": firestore.ServerTimestamp,
		}, firestore.MergeAll)
	})
}

func projectRideDriverProfiles(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID string) error {
	var driver, follower *string
	err := pool.QueryRow(ctx, `SELECT driver_id, follower_driver_id FROM public.rides WHERE id = $1::uuid`, rideID).Scan(&driver, &follower)
	if err != nil {
		return err
	}
	for _, uid := range []*string{driver, follower} {
		if uid != nil {
			if err := projectPublicDriver(ctx, pool, c, *uid); err != nil {
				return err
			}
		}
	}
	return nil
}
