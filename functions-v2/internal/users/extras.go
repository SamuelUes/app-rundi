package users

import (
	"context"
	"errors"
	"fmt"

	firestore "cloud.google.com/go/firestore"
	firebaseauth "firebase.google.com/go/v4/auth"
	"github.com/jackc/pgx/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/claims"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

// CheckAvailability: deleted emails and inactive phone profiles may be reused.
func (s *Service) CheckAvailability(ctx context.Context, email, phone string) (map[string]bool, error) {
	out := map[string]bool{"emailAvailable": true, "phoneAvailable": true}
	if email != "" {
		var taken bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM public.users WHERE email = $1 AND deleted_at IS NULL)`,
			email).Scan(&taken); err != nil {
			return nil, err
		}
		out["emailAvailable"] = !taken
	}
	if phone != "" {
		var taken bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM public.users WHERE phone = $1 AND is_active = TRUE AND deleted_at IS NULL)`,
			phone).Scan(&taken); err != nil {
			return nil, err
		}
		out["phoneAvailable"] = !taken
	}
	return out, nil
}

// UpgradeToDriver — upgradeClientToDriver v1: rol 'client' → 'driver' en
// Firestore (autoridad operativa) + users.role (histórico). El perfil de
// driver se crea luego vía POST /v1/drivers/register.
func (s *Service) UpgradeToDriver(ctx context.Context, uid, requestID string) error {
	ref := s.fs.Collection(fs.ColUsers).Doc(uid)
	snap, err := ref.Get(ctx)
	if err != nil {
		return apperr.New(404, "user not found")
	}
	role, _ := snap.Data()["role"].(string)
	if role == "driver" {
		return nil // idempotente
	}
	if role == "admin" || role == "operator" {
		return apperr.New(409, "staff users cannot self-upgrade")
	}
	if _, err := ref.Set(ctx, map[string]any{
		"role":      "driver",
		"updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll); err != nil {
		return err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE public.users SET role = 'driver' WHERE id = $1 AND deleted_at IS NULL`,
		uid); err != nil {
		return err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "user.role_changed", AggregateType: "user", AggregateID: uid,
		RequestID: requestID,
		Payload:   map[string]any{"uid": uid, "role": "driver", "source": "upgrade"},
	}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	claims.Ensure(ctx, s.app, uid, "driver")
	return nil
}

// DeactivateAccount — deactivateUserAccount v1: baja lógica reversible.
// is_active=false en SQL + accountStatus='deactivated' en Firestore; los
// tokens FCM quedan (el próximo heartbeat los regenera si reactiva).
func (s *Service) DeactivateAccount(ctx context.Context, uid, requestID string) error {
	if _, err := s.fs.Collection(fs.ColUsers).Doc(uid).Set(ctx, map[string]any{
		"accountStatus": "deactivated",
		"updatedAt":     firestore.ServerTimestamp,
	}, firestore.MergeAll); err != nil {
		return err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE public.users SET is_active = FALSE WHERE id = $1 AND deleted_at IS NULL`,
		uid); err != nil {
		return err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "user.deactivated", AggregateType: "user", AggregateID: uid,
		RequestID: requestID, Payload: map[string]any{"uid": uid},
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeleteUserData — anonimiza el registro SQL conservado por FKs históricas,
// marca deleted_at, marca el perfil Firestore como deleted y elimina la identidad Auth.
// La operación es idempotente para poder completar una limpieza parcial.
func (s *Service) DeleteUserData(ctx context.Context, uid, requestID string) error {
	var exists bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM public.users WHERE id = $1)`, uid,
	).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return apperr.New(404, "user not found")
	}

	authClient, err := s.app.Auth(ctx)
	if err != nil {
		return fmt.Errorf("firebase auth client: %w", err)
	}
	if _, err := authClient.UpdateUser(ctx, uid, (&firebaseauth.UserToUpdate{}).Disabled(true)); err != nil &&
		!firebaseauth.IsUserNotFound(err) {
		return fmt.Errorf("disable firebase user: %w", err)
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var deleted bool
	err = tx.QueryRow(ctx,
		`SELECT deleted_at IS NOT NULL FROM public.users WHERE id = $1 FOR UPDATE`, uid,
	).Scan(&deleted)
	if err != nil {
		if err == pgx.ErrNoRows {
			return apperr.New(404, "user not found")
		}
		return err
	}
	if !deleted {
		if _, err := tx.Exec(ctx, `
			UPDATE public.users
			SET name = NULL, email = NULL, phone = NULL, profile_photo = NULL,
			    birth_date = NULL, is_active = FALSE, deleted_at = NOW()
			WHERE id = $1 AND deleted_at IS NULL`, uid); err != nil {
			return err
		}
		// Driver histórico: anonimiza también el perfil de conductor.
		if _, err := tx.Exec(ctx, `
			UPDATE public.drivers
			SET profile_photo = NULL, license_number = NULL,
			    license_photo_front = NULL, license_photo_back = NULL,
			    deleted_at = COALESCE(deleted_at, NOW())
			WHERE user_id = $1`, uid); err != nil {
			return err
		}
		// Device credentials must not survive account deletion.
		if _, err := tx.Exec(ctx,
			`DELETE FROM public.user_devices WHERE user_id = $1`, uid); err != nil {
			return err
		}
		if err := outbox.Insert(ctx, tx, outbox.Event{
			Type: "user.deleted", AggregateType: "user", AggregateID: uid,
			RequestID: requestID, Payload: map[string]any{"uid": uid, "kind": "gdpr"},
		}); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	// Preserve the old UID's profile and subcollections as history; auth/profile
	// status gates prevent this tombstone from being used to sign in again.
	_, err = s.fs.Collection(fs.ColUsers).Doc(uid).Set(ctx, map[string]any{
		"accountStatus": "deleted", "updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("user sql deleted, firestore cleanup failed: %w", err)
	}

	if err := authClient.DeleteUser(ctx, uid); err != nil && !firebaseauth.IsUserNotFound(err) {
		return fmt.Errorf("delete firebase auth user: %w", err)
	}
	return nil
}

// SyncRole — syncUserRoleFromCms/syncAppUserRole v1 (admin): fija el rol en
// Firestore + SQL.
func (s *Service) SyncRole(ctx context.Context, uid, role, requestID string) error {
	switch role {
	case "client", "driver", "operator", "admin":
	default:
		return apperr.New(400, "rol inválido")
	}
	if _, err := s.fs.Collection(fs.ColUsers).Doc(uid).Set(ctx, map[string]any{
		"role":      role,
		"updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll); err != nil {
		return err
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx,
		`UPDATE public.users SET role = $2::app_role WHERE id = $1 AND deleted_at IS NULL`,
		uid, role); err != nil {
		return err
	}
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "user.role_changed", AggregateType: "user", AggregateID: uid,
		RequestID: requestID,
		Payload:   map[string]any{"uid": uid, "role": role, "source": "admin"},
	}); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	claims.Ensure(ctx, s.app, uid, role)
	return nil
}

var _ = errors.Is
