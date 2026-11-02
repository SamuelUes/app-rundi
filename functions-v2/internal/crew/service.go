package crew

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

// IsEligible — criterio v1: designated_role_status='verified' && account_status='active'.
func (s *Service) IsEligible(ctx context.Context, uid string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `
		SELECT designated_role_status = 'verified' AND account_status = 'active'
		FROM public.drivers WHERE user_id = $1`, uid).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return ok, err
}

// memberSnapshot — snapshot mínimo del integrante embebido en los docs de
// crew (el frontend lo muestra sin lookups extra).
func (s *Service) memberSnapshot(ctx context.Context, uid string) map[string]any {
	snap := map[string]any{"driverId": uid}
	if u, err := s.fs.Collection(fs.ColUsers).Doc(uid).Get(ctx); err == nil && u.Exists() {
		if n, _ := u.Data()["name"].(string); n != "" {
			snap["name"] = n
		}
		if ph, _ := u.Data()["profilePhoto"].(string); ph != "" {
			snap["photoURL"] = ph
		}
	}
	if d, err := s.fs.Collection(fs.ColDrivers).Doc(uid).Get(ctx); err == nil && d.Exists() {
		if r, ok := d.Data()["averageRating"].(float64); ok {
			snap["rating"] = r
		}
	}
	return snap
}

// Invite — capitán invita a un seguidor elegible (backend escribe el doc).
// expiresAt es epoch-ms numérico: el gate del frontend lo compara con
// Date.now() (TTL 2 min, igual que INVITE_TTL_MS de v1).
func (s *Service) Invite(ctx context.Context, captainUID, followerUID string) error {
	if captainUID == followerUID {
		return apperr.New(400, "captain and follower must differ")
	}
	ok, err := s.IsEligible(ctx, followerUID)
	if err != nil {
		return err
	}
	if !ok {
		return apperr.New(409, "follower not eligible for designated driver")
	}
	now := time.Now()
	_, err = s.fs.Collection(fs.ColCrewInvites).Doc(followerUID).Set(ctx, map[string]any{
		"captainId":  captainUID,
		"followerId": followerUID,
		"captain":    s.memberSnapshot(ctx, captainUID),
		"follower":   s.memberSnapshot(ctx, followerUID),
		"status":     "pending",
		"createdAt":  now.UnixMilli(),
		"expiresAt":  now.Add(2 * time.Minute).UnixMilli(),
	})
	return err
}

// AcceptInvite — seguidor acepta: crea crew + membresías, borra la invitación.
func (s *Service) AcceptInvite(ctx context.Context, followerUID string) error {
	invRef := s.fs.Collection(fs.ColCrewInvites).Doc(followerUID)
	snap, err := invRef.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}
	captainUID, _ := snap.Data()["captainId"].(string)
	if captainUID == "" {
		return apperr.New(409, "invite has no captain")
	}

	batch := s.fs.BulkWriter(ctx)
	if _, err := batch.Set(
		s.fs.Collection(fs.ColDriverCrews).Doc(captainUID),
		map[string]any{
			"captainId":  captainUID,
			"followerId": followerUID,
			"captain":    s.memberSnapshot(ctx, captainUID),
			"follower":   s.memberSnapshot(ctx, followerUID),
			"status":     "active",
			"createdAt":  time.Now().UnixMilli(),
			"joinedAt":   firestore.ServerTimestamp,
		}); err != nil {
		return err
	}
	for uid, data := range map[string]map[string]any{
		captainUID:  {"captainId": captainUID, "role": "captain", "partnerId": followerUID, "currentRideId": nil},
		followerUID: {"captainId": captainUID, "role": "follower", "partnerId": captainUID, "currentRideId": nil},
	} {
		data["updatedAt"] = firestore.ServerTimestamp
		if _, err := batch.Set(
			s.fs.Collection(fs.ColCrewMembership).Doc(uid), data); err != nil {
			return err
		}
	}
	if _, err := batch.Delete(invRef); err != nil {
		return err
	}
	batch.End()
	return nil
}

// LeaveCrew — cualquiera de los dos abandona: borra crew + membresías.
func (s *Service) LeaveCrew(ctx context.Context, uid string) error {
	mRef := s.fs.Collection(fs.ColCrewMembership).Doc(uid)
	snap, err := mRef.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}
	captainUID, _ := snap.Data()["captainId"].(string)
	if captainUID == "" {
		return apperr.New(409, "membership has no captain")
	}
	followerUID := uid
	if uid == captainUID {
		crewSnap, err := s.fs.Collection(fs.ColDriverCrews).Doc(captainUID).Get(ctx)
		if err == nil {
			followerUID, _ = crewSnap.Data()["followerId"].(string)
		}
	}
	batch := s.fs.BulkWriter(ctx)
	_, _ = batch.Delete(s.fs.Collection(fs.ColDriverCrews).Doc(captainUID))
	_, _ = batch.Delete(mRef)
	if followerUID != "" && followerUID != uid {
		_, _ = batch.Delete(s.fs.Collection(fs.ColCrewMembership).Doc(followerUID))
	}
	batch.End()
	return nil
}

// AttachFollower — adjunta el seguidor del crew al viaje del capitán.
// SQL TX: follower_driver_id + follower_status='active' + joined_at, donde
// driver_id=capitán, sin follower previo y viaje no terminal. Outbox en la TX;
// el consumidor proyecta follower a trips_live y currentRideId a membership.
func (s *Service) AttachFollower(ctx context.Context, rideID, captainUID, requestID string) error {
	crewSnap, err := s.fs.Collection(fs.ColDriverCrews).Doc(captainUID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return apperr.New(409, "captain has no active crew")
	}
	if err != nil {
		return err
	}
	followerUID, _ := crewSnap.Data()["followerId"].(string)
	if followerUID == "" {
		return apperr.New(409, "crew has no follower")
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE public.rides
		SET follower_driver_id = $3, follower_status = 'active',
		    follower_joined_at = NOW(), version = version + 1
		WHERE id = $1
		  AND driver_id = $2
		  AND follower_driver_id IS NULL
		  AND status NOT IN ('completed', 'canceled', 'rating_completed', 'rating_skipped')`,
		rideID, captainUID, followerUID)
	if err != nil {
		return fmt.Errorf("attach follower: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return apperr.New(409, "ride not attachable (not captain, has follower, or terminal)")
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "ride.follower_attached",
		AggregateType: "ride",
		AggregateID:   rideID,
		RequestID:     requestID,
		Payload: map[string]any{
			"rideId": rideID, "driverId": captainUID,
			"followerDriverId": followerUID, "followerStatus": "active",
		},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ReleaseFollower — libera al seguidor (completed|canceled|abandoned).
// Actor: capitán del viaje o el propio seguidor.
func (s *Service) ReleaseFollower(ctx context.Context, rideID, actorUID, reason, requestID string) error {
	var final FollowerStatus
	switch reason {
	case "abandoned":
		final = FollowerAbandoned
	case "canceled":
		final = FollowerCanceled
	default:
		final = FollowerCompleted
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var followerUID string
	err = tx.QueryRow(ctx, `
		UPDATE public.rides
		SET follower_status = $3, follower_left_at = NOW(), version = version + 1
		WHERE id = $1
		  AND follower_status = 'active'
		  AND (driver_id = $2 OR follower_driver_id = $2)
		RETURNING follower_driver_id`,
		rideID, actorUID, string(final)).Scan(&followerUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(409, "no active follower on this ride for actor")
	}
	if err != nil {
		return fmt.Errorf("release follower: %w", err)
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "ride.follower_released",
		AggregateType: "ride",
		AggregateID:   rideID,
		RequestID:     requestID,
		Payload: map[string]any{
			"rideId": rideID, "followerDriverId": followerUID,
			"followerStatus": string(final),
		},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// MarkFollowerAbandoned — equivalente a driverOffline de v1: si el seguidor se
// cae con un viaje activo, marcar 'abandoned' (llamado por scheduler/consumer).
func (s *Service) MarkFollowerAbandoned(ctx context.Context, followerUID string) error {
	mSnap, err := s.fs.Collection(fs.ColCrewMembership).Doc(followerUID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return nil
	}
	if err != nil {
		return err
	}
	rideID, _ := mSnap.Data()["currentRideId"].(string)
	if rideID == "" {
		return nil
	}
	return s.ReleaseFollower(ctx, rideID, followerUID, "abandoned", "scheduler")
}
