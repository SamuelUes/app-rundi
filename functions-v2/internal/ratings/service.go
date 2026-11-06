package ratings

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/outbox"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// Submit — inserta la calificación validando que el actor participe en el
// viaje y que to_user coincida con el rol calificado (captain→driver_id,
// follower→follower_driver_id, client→client_id). finalize/skipped actualizan
// el estado del viaje. Una sola calificación por (ride, from, to).
func (s *Service) Submit(ctx context.Context, fromUID, requestID string, in SubmitRatingRequest) (*Rating, error) {
	if in.Skip {
		return nil, s.skip(ctx, in.RideID, fromUID, requestID)
	}
	if in.Rating < 1 || in.Rating > 5 {
		return nil, apperr.New(400, "rating must be 1-5")
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Resolver to_user según rol calificado contra los actores reales del viaje.
	var expected string
	switch in.RatedRole {
	case "captain", "driver":
		expected = "driver_id"
	case "follower":
		expected = "follower_driver_id"
	case "client":
		expected = "client_id"
	default:
		return nil, apperr.New(400, "ratedRole must be driver|captain|follower|client")
	}
	var actualTo string
	err = tx.QueryRow(ctx, fmt.Sprintf(`
		SELECT %s FROM public.rides
		WHERE id = $1 AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2)`,
		expected), in.RideID, fromUID).Scan(&actualTo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(403, "not a participant of this ride")
	}
	if err != nil {
		return nil, err
	}
	if actualTo == "" || actualTo != in.ToUserID {
		return nil, apperr.New(409, "toUserId does not match the role on this ride")
	}

	var r Rating
	err = tx.QueryRow(ctx, `
		INSERT INTO public.ratings (
			ride_id, from_user_id, to_user_id, rating, comment, rated_role,
			punctuality, cleanliness, communication, driving, safety, friendliness
		) VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT DO NOTHING
		RETURNING id, ride_id, from_user_id, to_user_id, rating, comment,
		          rated_role, created_at`,
		in.RideID, fromUID, in.ToUserID, in.Rating, in.Comment, in.RatedRole,
		in.Punctuality, in.Cleanliness, in.Communication, in.Driving,
		in.Safety, in.Friendliness,
	).Scan(&r.ID, &r.RideID, &r.FromUserID, &r.ToUserID, &r.Rating,
		&r.Comment, &r.RatedRole, &r.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(409, "rating already submitted")
	}
	if err != nil {
		return nil, fmt.Errorf("rating insert: %w", err)
	}

	// updateDriverStats v1: recomputa agregados del conductor calificado
	// (solo si el target es driver/captain/follower — no aplica a 'client').
	if in.RatedRole != "client" {
		if _, err := tx.Exec(ctx, `
			UPDATE public.drivers d SET
				average_rating = COALESCE((
					SELECT ROUND(AVG(r.rating), 2) FROM public.ratings r
					WHERE r.to_user_id = d.user_id AND r.deleted_at IS NULL), 0),
				total_rides = (
					SELECT COUNT(*) FROM public.rides ri
					WHERE (ri.driver_id = d.user_id OR ri.follower_driver_id = d.user_id)
					  AND ri.status IN ('completed','rating_completed','rating_skipped')
					  AND ri.deleted_at IS NULL)
			WHERE d.user_id = $1`, in.ToUserID); err != nil {
			return nil, err
		}
	}

	if in.Finalize {
		if _, err := tx.Exec(ctx, `
			UPDATE public.rides SET status = 'rating_completed', version = version + 1
			WHERE id = $1 AND status IN ('pending_payment', 'completed')`, in.RideID); err != nil {
			return nil, err
		}
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "rating.submitted",
		AggregateType: "rating",
		AggregateID:   r.ID,
		RequestID:     requestID,
		Payload: map[string]any{
			"ratingId": r.ID, "rideId": r.RideID, "fromUserId": r.FromUserID,
			"toUserId": r.ToUserID, "ratedRole": r.RatedRole, "rating": r.Rating,
			"finalize": in.Finalize,
		},
	}); err != nil {
		return nil, err
	}
	return &r, tx.Commit(ctx)
}

// skip — el actor omite la calificación: status='rating_skipped' + outbox.
func (s *Service) skip(ctx context.Context, rideID, fromUID, requestID string) error {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE public.rides SET status = 'rating_skipped', version = version + 1
		WHERE id = $1 AND status IN ('pending_payment', 'completed')
		  AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2)`,
		rideID, fromUID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return apperr.New(409, "ride not skippable by this actor")
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "rating.skipped",
		AggregateType: "ride",
		AggregateID:   rideID,
		RequestID:     requestID,
		Payload:       map[string]any{"rideId": rideID, "actor": fromUID},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ListDriverRatings — getDriverRatings v1: ratings recibidas por un driver.
func (s *Service) ListDriverRatings(ctx context.Context, driverUID string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, rating, comment, rated_role, created_at
		FROM public.ratings
		WHERE to_user_id = $1 AND deleted_at IS NULL
		ORDER BY created_at DESC LIMIT $2`, driverUID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id string
		var comment, role *string
		var createdAt *time.Time
		var rating int
		if err := rows.Scan(&id, &rating, &comment, &role, &createdAt); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "rating": rating,
			"comment": comment, "ratedRole": role, "createdAt": createdAt,
		})
	}
	return out, rows.Err()
}

// PublicInsights — getDriverPublicInsights v1: promedio + comentarios
// recientes + datos públicos del conductor (sin PII sensible).
func (s *Service) PublicInsights(ctx context.Context, driverUID string, limit int) (map[string]any, error) {
	if limit <= 0 || limit > 30 {
		limit = 10
	}
	out := map[string]any{}
	var name, dept, muni string
	var rating float64
	var total *int
	var photo *string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(u.name,''), COALESCE(d.average_rating,0), d.total_rides,
		       COALESCE(d.department,''), COALESCE(d.municipality,''), d.profile_photo
		FROM public.drivers d LEFT JOIN public.users u ON u.id = d.user_id
		WHERE d.user_id = $1 AND d.deleted_at IS NULL`, driverUID,
	).Scan(&name, &rating, &total, &dept, &muni, &photo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "driver not found")
	}
	if err != nil {
		return nil, err
	}
	out["driver"] = map[string]any{
		"userId": driverUID, "name": name, "averageRating": rating,
		"totalRides": total, "department": dept, "municipality": muni,
		"profilePhoto": photo,
	}
	rows, err := s.pool.Query(ctx, `
		SELECT r.rating, r.comment, r.created_at
		FROM public.ratings r
		WHERE r.to_user_id = $1 AND r.comment IS NOT NULL AND r.comment <> ''
		  AND r.deleted_at IS NULL
		ORDER BY r.created_at DESC LIMIT $2`, driverUID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := []map[string]any{}
	for rows.Next() {
		var rt int
		var c string
		var at *time.Time
		if err := rows.Scan(&rt, &c, &at); err != nil {
			return nil, err
		}
		comments = append(comments, map[string]any{
			"rating": rt, "comment": c, "createdAt": at,
		})
	}
	out["recentComments"] = comments
	return out, rows.Err()
}
