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
	"github.com/rundi/functions-v2/internal/rides"
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
// crew (el frontend lo muestra sin lookups extra). licenseNumber viene de SQL
// (driver_licenses vigente o fallback drivers.license_number) — no está
// proyectado en DATA-MAIN_drivers.
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
	if lic, err := s.currentLicense(ctx, uid); err == nil && lic != "" {
		snap["licenseNumber"] = lic
	}
	return snap
}

func (s *Service) currentLicense(ctx context.Context, uid string) (string, error) {
	var lic string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(dl.license_number, d.license_number, '')
		FROM public.drivers d
		LEFT JOIN public.driver_licenses dl
		  ON dl.driver_id = d.id AND dl.is_current = TRUE AND dl.deleted_at IS NULL
		WHERE d.user_id = $1 AND d.deleted_at IS NULL`, uid).Scan(&lic)
	return lic, err
}

// Invite — capitán invita a un seguidor elegible (backend escribe el doc).
// expiresAt es epoch-ms numérico: el gate del frontend lo compara con
// Date.now() (TTL 2 min, igual que INVITE_TTL_MS de v1).
// Guardas v1: ninguno de los dos puede estar emparejado, y no puede haber
// otra invitación pendiente vigente (ni del propio capitán ni de un tercero).
// Además del doc de invitación (legible solo por el seguidor) deja
// pendingInvite en la membresía del capitán — su fuente realtime para el
// estado "Solicitud enviada" del chip (AcceptInvite lo pisa al aceptar).
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
	nowMs := now.UnixMilli()

	captainSnap, err := s.fs.Collection(fs.ColCrewMembership).Doc(captainUID).Get(ctx)
	if err != nil && status.Code(err) != codes.NotFound {
		return err
	}
	if err == nil && captainSnap.Exists() {
		if p, _ := captainSnap.Data()["partnerId"].(string); p != "" {
			return apperr.New(409, "captain already paired")
		}
		if pi, _ := captainSnap.Data()["pendingInvite"].(map[string]any); pi != nil {
			if exp, _ := pi["expiresAt"].(int64); exp > nowMs {
				return apperr.New(409, "captain already has a pending invite")
			}
		}
	}
	followerSnap, err := s.fs.Collection(fs.ColCrewMembership).Doc(followerUID).Get(ctx)
	if err != nil && status.Code(err) != codes.NotFound {
		return err
	}
	if err == nil && followerSnap.Exists() {
		if p, _ := followerSnap.Data()["partnerId"].(string); p != "" {
			return apperr.New(409, "follower already paired")
		}
	}
	if inv, err := s.fs.Collection(fs.ColCrewInvites).Doc(followerUID).Get(ctx); err == nil && inv.Exists() {
		if exp, _ := inv.Data()["expiresAt"].(int64); exp > nowMs {
			return apperr.New(409, "follower already has a pending invite")
		}
	}

	expiresAt := now.Add(2 * time.Minute).UnixMilli()
	follower := s.memberSnapshot(ctx, followerUID)
	batch := s.fs.BulkWriter(ctx)
	if _, err := batch.Set(
		s.fs.Collection(fs.ColCrewInvites).Doc(followerUID),
		map[string]any{
			"captainId":  captainUID,
			"followerId": followerUID,
			"captain":    s.memberSnapshot(ctx, captainUID),
			"follower":   follower,
			"status":     "pending",
			"createdAt":  nowMs,
			"expiresAt":  expiresAt,
		}); err != nil {
		return err
	}
	pending := map[string]any{
		"followerId": followerUID,
		"createdAt":  nowMs,
		"expiresAt":  expiresAt,
	}
	if name, _ := follower["name"].(string); name != "" {
		pending["name"] = name
	}
	if _, err := batch.Set(
		s.fs.Collection(fs.ColCrewMembership).Doc(captainUID),
		map[string]any{
			"captainId":     captainUID,
			"pendingInvite": pending,
			"updatedAt":     firestore.ServerTimestamp,
		}, firestore.MergeAll); err != nil {
		return err
	}
	batch.End()
	return nil
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

// DeclineInvite — el seguidor rechaza su invitación pendiente (idempotente:
// sin doc → nil). Borra crew_invites/{uid} y limpia el pendingInvite del
// capitán → su chip vuelve a "Agregar colega" sin esperar al expiry.
func (s *Service) DeclineInvite(ctx context.Context, followerUID string) error {
	invRef := s.fs.Collection(fs.ColCrewInvites).Doc(followerUID)
	snap, err := invRef.Get(ctx)
	if status.Code(err) == codes.NotFound {
		return nil
	}
	if err != nil {
		return err
	}
	batch := s.fs.BulkWriter(ctx)
	if _, err := batch.Delete(invRef); err != nil {
		batch.End()
		return err
	}
	if captainUID, _ := snap.Data()["captainId"].(string); captainUID != "" {
		if err := s.clearPendingInvite(ctx, batch, captainUID, followerUID); err != nil {
			batch.End()
			return err
		}
	}
	batch.End()
	return nil
}

// clearPendingInvite — borra pendingInvite de la membresía del capitán solo si
// apunta a followerUID (una invitación posterior a otro seguidor no se toca).
// Sin doc/marker → no-op.
func (s *Service) clearPendingInvite(ctx context.Context, batch *firestore.BulkWriter, captainUID, followerUID string) error {
	mRef := s.fs.Collection(fs.ColCrewMembership).Doc(captainUID)
	mSnap, err := mRef.Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil
		}
		return err
	}
	pi, _ := mSnap.Data()["pendingInvite"].(map[string]any)
	if f, _ := pi["followerId"].(string); f != followerUID {
		return nil
	}
	_, err = batch.Update(mRef, []firestore.Update{
		{Path: "pendingInvite", Value: firestore.Delete},
		{Path: "updatedAt", Value: firestore.ServerTimestamp},
	})
	return err
}

// SweepExpiredInvites — no hay TTL en los docs de invitación: el scheduler
// corre esto cada tick. Borra crew_invites vencidas + el pendingInvite del
// capitán (su chip vuelve a "Agregar colega"), y limpia markers huérfanos
// (invitación ya borrada pero marker vigente-expirado).
func (s *Service) SweepExpiredInvites(ctx context.Context) (int, error) {
	nowMs := time.Now().UnixMilli()
	cleaned := 0
	snaps, err := s.fs.Collection(fs.ColCrewInvites).
		Where("expiresAt", "<", nowMs).
		Documents(ctx).GetAll()
	if err != nil {
		return cleaned, err
	}
	for _, snap := range snaps {
		batch := s.fs.BulkWriter(ctx)
		if _, err := batch.Delete(snap.Ref); err != nil {
			batch.End()
			return cleaned, err
		}
		if captainUID, _ := snap.Data()["captainId"].(string); captainUID != "" {
			if err := s.clearPendingInvite(ctx, batch, captainUID, snap.Ref.ID); err != nil {
				batch.End()
				return cleaned, err
			}
		}
		batch.End()
		cleaned++
	}
	memberships, err := s.fs.Collection(fs.ColCrewMembership).
		Where("pendingInvite.expiresAt", "<", nowMs).
		Documents(ctx).GetAll()
	if err != nil {
		return cleaned, err
	}
	if len(memberships) > 0 {
		batch := s.fs.BulkWriter(ctx)
		for _, m := range memberships {
			if _, err := batch.Update(m.Ref, []firestore.Update{
				{Path: "pendingInvite", Value: firestore.Delete},
				{Path: "updatedAt", Value: firestore.ServerTimestamp},
			}); err != nil {
				batch.End()
				return cleaned, err
			}
		}
		batch.End()
	}
	return cleaned, nil
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
	// partnerId en la membresía propia siempre apunta al OTRO miembro — cubre
	// ambos sentidos (capitán abandona → borra la del seguidor; seguidor
	// abandona → borra la del capitán). Antes solo se borraba la del seguidor:
	// el capitán quedaba con partnerId huérfano y el chip "Colega" pegado.
	partnerUID, _ := snap.Data()["partnerId"].(string)
	batch := s.fs.BulkWriter(ctx)
	_, _ = batch.Delete(s.fs.Collection(fs.ColDriverCrews).Doc(captainUID))
	_, _ = batch.Delete(mRef)
	if partnerUID != "" && partnerUID != uid {
		_, _ = batch.Delete(s.fs.Collection(fs.ColCrewMembership).Doc(partnerUID))
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

	if err := rides.EnsureDriverUnoccupied(ctx, tx, followerUID, rideID); err != nil {
		return err
	}
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
