// Package programmed — viajes programados (port de programmedRides v1).
// Firestore-first como en v1: el doc vive en REALTIME_programmed_rides hasta
// que el scheduler lo promueve a una fila SQL rides + outbox (ride.requested,
// o requested+accepted si el conductor ya estaba confirmado).
package programmed

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/notifications"
	"github.com/rundi/functions-v2/internal/outbox"
	"github.com/rundi/functions-v2/internal/pickupcode"
	"github.com/rundi/functions-v2/internal/rides"
)

// Ventanas de v1 (processProgrammedRides).
const (
	ConfirmWindow  = 10 * time.Minute // cliente confirma desde scheduledAt-10m
	PromotionGrace = 2 * time.Minute  // promoción hasta scheduledAt+2m
	OrphanWindow   = time.Hour        // scheduledAt < now-1h sin procesar → cancel
)

const col = fs.ColProgrammed

var errClientHasActiveRide = errors.New("client already has an active ride")

func notificationKey(kind, rideID string, at int64) string {
	hash := sha256.Sum256([]byte(rideID))
	return fmt.Sprintf("prog-%s-%x-%d", kind, hash[:12], at)
}

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
	// Agendado por task en lugar de polling por minuto (opcional; el tick
	// programado sigue de respaldo si no se instala o si el enqueue falla).
	schedulePromotion func(ctx context.Context, rideID string, at time.Time) error
	cancelPromotion   func(ctx context.Context, rideID string) error
	notifications     *notifications.Center
}

func (s *Service) SetNotifications(center *notifications.Center) {
	s.notifications = center
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

// SetPromotionScheduler instala el agendado/cancel best-effort del task de
// promoción (Cloud Tasks → job rundi-programmed con ScheduleTime=scheduledAt).
func (s *Service) SetPromotionScheduler(
	schedule func(ctx context.Context, rideID string, at time.Time) error,
	cancel func(ctx context.Context, rideID string) error,
) {
	s.schedulePromotion = schedule
	s.cancelPromotion = cancel
}

// Create — cliente crea el doc (backend lo escribe: valida + fija clientId).
// Todos los campos operativos viajan en el doc (se copian a rides/trips_live
// al promover, igual que buildActiveRidePayload de v1).
func (s *Service) Create(ctx context.Context, uid string, in map[string]any) (string, string, error) {
	scheduledMs, ok := numField(in["scheduledAt"])
	if !ok || scheduledMs <= time.Now().UnixMilli() {
		return "", "", apperr.New(400, "scheduledAt debe ser futuro (epoch ms)")
	}
	id := uuid.NewString()
	doc := map[string]any{
		"clientId":        uid,
		"status":          "scheduled",
		"scheduledAt":     scheduledMs,
		"clientConfirmed": false,
		"driverConfirmed": false,
		"createdAt":       firestore.ServerTimestamp,
		"updatedAt":       firestore.ServerTimestamp,
	}
	// Copiar solo keys operativas permitidas (anti-inyección de campos).
	for _, k := range []string{
		"origin", "destination", "extraDestinations", "estimatedPrice",
		"clientSuggestedPrice", "pricingSnapshot", "featureCodes", "serviceCode",
		"surgeMultiplier", "estimatedDistance", "estimatedDuration", "rideType",
		"vehicleType", "designatedDriverVehicle", "passengers", "paymentMethod",
		"serviceId", "serviceAreaId", "clientVehiclePhoto", "clientName",
		"clientPhone", "notes",
	} {
		if v, ok := in[k]; ok {
			doc[k] = v
		}
	}
	if features, ok := in["selectedFeatureCodes"].([]any); ok {
		for _, feature := range features {
			if _, ok := feature.(string); !ok {
				return "", "", apperr.New(400, "invalid feature codes")
			}
		}
		doc["featureCodes"] = features
		doc["pricingSnapshot"] = map[string]any{"featureCodes": features}
	}
	var sc string
	var err error
	created := false
	for attempt := 0; attempt < 8; attempt++ {
		sc, err = shareCode()
		if err != nil {
			return "", "", err
		}
		existing, err := s.fs.Collection(col).Where("shareCode", "==", sc).Limit(1).Documents(ctx).GetAll()
		if err != nil {
			return "", "", err
		}
		if len(existing) > 0 {
			continue
		}
		doc["shareCode"] = sc
		err = s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			if err := tx.Create(s.fs.Collection(fs.ColProgrammedCodes).Doc(sc), map[string]any{"rideId": id}); err != nil {
				return err
			}
			return tx.Create(s.fs.Collection(col).Doc(id), doc)
		})
		if status.Code(err) == codes.AlreadyExists {
			continue
		}
		if err != nil {
			return "", "", err
		}
		created = true
		break
	}
	if !created {
		return "", "", fmt.Errorf("could not reserve programmed ride code")
	}
	if s.schedulePromotion != nil {
		sCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		if serr := s.schedulePromotion(sCtx, id, time.UnixMilli(scheduledMs)); serr != nil {
			slog.Warn("programmed promotion task failed; tick de respaldo cubre", "ride", id, "err", serr)
		}
	}
	return id, sc, nil
}

// Assign — cliente asigna un conductor específico (pendiente de confirmación).
func (s *Service) Assign(ctx context.Context, uid, rideID, driverID string) error {
	snap, err := s.fs.Collection(col).Doc(rideID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return apperr.ErrNotFound
	}
	if err != nil {
		return err
	}
	if str(snap.Data()["clientId"]) != uid {
		return apperr.ErrForbidden
	}
	if uid == driverID {
		return apperr.New(400, "no puedes invitarte a ti mismo")
	}
	var name string
	var rating float64
	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(u.name, ''), COALESCE(d.average_rating, 0)
		FROM public.drivers d JOIN public.users u ON u.id = d.user_id
		WHERE d.user_id = $1 AND d.deleted_at IS NULL AND d.account_status = 'active'`,
		driverID).Scan(&name, &rating)
	if errors.Is(err, pgx.ErrNoRows) {
		return apperr.New(404, "driver not found")
	}
	if err != nil {
		return err
	}
	sent := false
	var invitationAt int64
	var scheduledAt int64
	err = s.mutate(ctx, rideID, func(d map[string]any) (map[string]any, error) {
		sent = false
		if str(d["clientId"]) != uid {
			return nil, apperr.ErrForbidden
		}
		if err := mutableRide(d); err != nil {
			return nil, err
		}
		if str(d["driverId"]) != "" && str(d["driverId"]) != driverID {
			return nil, apperr.New(409, "driver already assigned")
		}
		if str(d["driverId"]) == driverID && d["driverConfirmed"] == true {
			return map[string]any{}, nil
		}
		sent = true
		invitedAt := time.Now().UnixMilli()
		if previous, ok := numField(d["driverInvitationAt"]); ok && invitedAt <= previous {
			invitedAt = previous + 1
		}
		invitationAt = invitedAt
		scheduledAt, _ = numField(d["scheduledAt"])
		return map[string]any{
			"driverId": driverID, "driverConfirmed": false, "driverInvitation": true,
			"driverInvitationAt":     invitedAt,
			"driverInvitationStatus": "pending",
			"driver":                 map[string]any{"name": name, "rating": rating},
		}, nil
	})
	if err != nil {
		return err
	}
	if sent && s.notifications != nil {
		notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		ttl := time.Until(time.UnixMilli(scheduledAt).Add(PromotionGrace))
		if ttl > 24*time.Hour {
			ttl = 24 * time.Hour
		}
		if ttl < time.Second {
			ttl = time.Second
		}
		if err := s.notifications.Notify(notifyCtx, driverID, rideID, notifications.General, notifications.NotifyOpts{
			Key: notificationKey("invite", rideID, invitationAt), Title: "Invitación a un viaje programado",
			Body:      "Un cliente quiere viajar contigo. Abre Rundi para revisar la invitación.",
			ExtraData: map[string]string{"type": "programmed_ride_prompt", "role": "driver"},
			TTL:       ttl,
		}); err != nil {
			slog.Warn("programmed invitation notification failed", "err", err)
		}
	}
	return nil
}

func driverRevisionMatches(d map[string]any, expected *int64) error {
	at, _ := numField(d["driverInvitationAt"])
	if (expected == nil && d["driverRemovedAt"] != nil) || (expected != nil && *expected != at) {
		return apperr.New(409, "driver invitation changed")
	}
	return nil
}

func (s *Service) RemoveDriver(ctx context.Context, uid, rideID, driverID string, confirmed bool, invitationAt int64) error {
	var removedAt int64
	err := s.mutate(ctx, rideID, func(d map[string]any) (map[string]any, error) {
		removedAt = 0
		if str(d["clientId"]) != uid {
			return nil, apperr.ErrForbidden
		}
		if err := mutableRide(d); err != nil {
			return nil, err
		}
		if str(d["driverId"]) != driverID || (d["driverConfirmed"] == true) != confirmed {
			return nil, apperr.New(409, "driver assignment changed")
		}
		if err := driverRevisionMatches(d, &invitationAt); err != nil {
			return nil, err
		}
		removedAt = time.Now().UnixMilli()
		if previous, ok := numField(d["driverRemovedAt"]); ok && removedAt <= previous {
			removedAt = previous + 1
		}
		return map[string]any{
			"driverId": firestore.Delete, "driver": firestore.Delete,
			"driverInvitation": false, "driverConfirmed": false,
			"driverInvitationStatus": firestore.Delete, "driverRemovedAt": removedAt,
		}, nil
	})
	if err != nil {
		return err
	}
	if s.notifications != nil {
		notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		title, body := "Invitación cancelada", "El cliente retiró la invitación a su viaje programado."
		if confirmed {
			title, body = "Asignación cancelada", "El cliente retiró tu asignación a su viaje programado."
		}
		if err := s.notifications.Notify(notifyCtx, driverID, rideID, notifications.General, notifications.NotifyOpts{
			Key: notificationKey("removed", rideID, removedAt), Title: title, Body: body,
			ExtraData: map[string]string{"type": "programmed_ride_driver_removed", "role": "driver"},
			TTL:       24 * time.Hour,
		}); err != nil {
			slog.Warn("programmed driver removal notification failed", "err", err)
		}
	}
	return nil
}

func (s *Service) Decline(ctx context.Context, uid, rideID string, expectedAt *int64) error {
	var clientID string
	var invitationAt int64
	err := s.mutate(ctx, rideID, func(d map[string]any) (map[string]any, error) {
		clientID = ""
		if str(d["driverId"]) != uid {
			return nil, apperr.ErrForbidden
		}
		if err := mutableRide(d); err != nil {
			return nil, err
		}
		if err := driverRevisionMatches(d, expectedAt); err != nil {
			return nil, err
		}
		if d["driverInvitation"] != true || d["driverConfirmed"] == true {
			return nil, apperr.New(409, "invitation no longer pending")
		}
		clientID = str(d["clientId"])
		invitationAt, _ = numField(d["driverInvitationAt"])
		return map[string]any{
			"driverId": firestore.Delete, "driver": firestore.Delete,
			"driverInvitation": false, "driverConfirmed": false, "driverInvitationStatus": "declined",
		}, nil
	})
	if err == nil {
		s.notifyDriverResponse(ctx, clientID, rideID, invitationAt, false)
	}
	return err
}

func (s *Service) notifyDriverResponse(ctx context.Context, clientID, rideID string, invitationAt int64, accepted bool) {
	if s.notifications == nil || clientID == "" {
		return
	}
	response, title, body := "declined", "Invitación rechazada", "El conductor rechazó la invitación. Puedes buscar otro conductor."
	if accepted {
		response, title, body = "accepted", "Invitación aceptada", "El conductor aceptó tu viaje programado."
	}
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.notifications.Notify(notifyCtx, clientID, rideID, notifications.General, notifications.NotifyOpts{
		Key:   notificationKey(response, rideID, invitationAt),
		Title: title, Body: body, ExtraData: map[string]string{"type": "programmed_ride_update", "role": "client"},
	}); err != nil {
		slog.Warn("programmed driver response notification failed", "err", err)
	}
}

// Claim — conductor toma el viaje por shareCode o id directo. Un shareCode
// (6 dígitos, no es doc id) se resuelve server-side: las reglas no permiten al
// driver consultar docs ajenos por shareCode desde el cliente.
func (s *Service) Claim(ctx context.Context, uid, rideID string) error {
	var active bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM public.drivers
		WHERE user_id = $1 AND deleted_at IS NULL AND account_status = 'active')`, uid).Scan(&active); err != nil {
		return err
	}
	if !active {
		return apperr.ErrForbidden
	}
	ref := s.fs.Collection(col).Doc(rideID)
	snap, err := ref.Get(ctx)
	if status.Code(err) == codes.NotFound {
		docs, qerr := s.fs.Collection(col).Where("shareCode", "==", rideID).Limit(2).Documents(ctx).GetAll()
		if qerr != nil {
			return qerr
		}
		if len(docs) == 0 {
			return apperr.New(404, "programmed ride not found")
		}
		if len(docs) > 1 {
			return apperr.New(409, "ambiguous invitation code")
		}
		snap = docs[0]
		ref = snap.Ref
	} else if err != nil {
		return err
	}
	return s.mutate(ctx, ref.ID, func(d map[string]any) (map[string]any, error) {
		if err := mutableRide(d); err != nil {
			return nil, err
		}
		if str(d["clientId"]) == uid {
			return nil, apperr.New(400, "no puedes tomar tu propio viaje")
		}
		if driverID := str(d["driverId"]); driverID != "" && driverID != uid {
			return nil, apperr.New(409, "ride already has a driver")
		}
		if str(d["driverId"]) == uid {
			return map[string]any{}, nil
		}
		at := time.Now().UnixMilli()
		if previous, ok := numField(d["driverInvitationAt"]); ok && at <= previous {
			at = previous + 1
		}
		return map[string]any{
			"driverId": uid, "driverConfirmed": false, "driverInvitation": false,
			"driverInvitationAt": at, "driverInvitationStatus": firestore.Delete,
		}, nil
	})
}

// Confirm — clientConfirmed/driverConfirmed (v1: confirmProgrammedRide*).
func (s *Service) Confirm(ctx context.Context, uid, rideID, who string, expectedAt *int64) error {
	var clientID string
	var invitationAt int64
	err := s.mutate(ctx, rideID, func(d map[string]any) (map[string]any, error) {
		clientID = ""
		if err := mutableRide(d); err != nil {
			return nil, err
		}
		if who == "driver" {
			if str(d["driverId"]) != uid {
				return nil, apperr.ErrForbidden
			}
			if err := driverRevisionMatches(d, expectedAt); err != nil {
				return nil, err
			}
			if d["driverConfirmed"] == true {
				return map[string]any{}, nil
			}
			clientID = str(d["clientId"])
			invitationAt, _ = numField(d["driverInvitationAt"])
			return map[string]any{"driverConfirmed": true, "driverInvitationStatus": "accepted"}, nil
		}
		if who != "client" || str(d["clientId"]) != uid {
			return nil, apperr.ErrForbidden
		}
		return map[string]any{"clientConfirmed": true, "status": "client_confirmed"}, nil
	})
	if err == nil && who == "driver" {
		s.notifyDriverResponse(ctx, clientID, rideID, invitationAt, true)
	}
	return err
}

// Cancel — cliente o conductor asignado cancela (motivo opcional).
func (s *Service) Cancel(ctx context.Context, uid, rideID, reason string) error {
	err := s.mutate(ctx, rideID, func(d map[string]any) (map[string]any, error) {
		if uid != str(d["clientId"]) && uid != str(d["driverId"]) {
			return nil, apperr.ErrForbidden
		}
		if err := mutableRide(d); err != nil {
			return nil, err
		}
		return map[string]any{"status": "canceled", "cancelReason": reason, "canceledAt": firestore.ServerTimestamp}, nil
	})
	if err != nil {
		return err
	}
	if s.cancelPromotion != nil {
		sCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		defer cancel()
		if cerr := s.cancelPromotion(sCtx, rideID); cerr != nil {
			slog.Warn("programmed promotion cancel failed", "ride", rideID, "err", cerr)
		}
	}
	return nil
}

// ListMine — programados del actor (como cliente o conductor asignado).
func (s *Service) ListMine(ctx context.Context, uid, role string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	field := "clientId"
	if role == "driver" {
		field = "driverId"
	}
	snaps, err := s.fs.Collection(col).
		Where(field, "==", uid).
		OrderBy("scheduledAt", firestore.Asc).
		Limit(limit).
		Documents(ctx).GetAll()
	if err != nil {
		return nil, err
	}
	out := []map[string]any{}
	for _, s := range snaps {
		d := s.Data()
		d["id"] = s.Ref.ID
		out = append(out, d)
	}
	return out, nil
}

func (s *Service) mutate(ctx context.Context, rideID string, fn func(map[string]any) (map[string]any, error)) error {
	ref := s.fs.Collection(col).Doc(rideID)
	return s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return apperr.New(404, "programmed ride not found")
		}
		if err != nil {
			return err
		}
		updates, err := fn(snap.Data())
		if err != nil || len(updates) == 0 {
			return err
		}
		updates["updatedAt"] = firestore.ServerTimestamp
		return tx.Set(ref, updates, firestore.MergeAll)
	})
}

func mutableRide(d map[string]any) error {
	st := str(d["status"])
	if st != "scheduled" && st != "client_confirmed" {
		return apperr.New(409, "ride status "+st+" no permite la operación")
	}
	scheduled, ok := numField(d["scheduledAt"])
	if !ok || scheduled+PromotionGrace.Milliseconds() <= time.Now().UnixMilli() || d["promotionStarted"] == true {
		return apperr.New(409, "ride is no longer editable")
	}
	return nil
}

// Process — sweep del scheduler (port de processProgrammedRides):
//   - huérfanos (scheduledAt < now-1h) no terminales → canceled 'orphan'
//   - ventana de confirmación sin clientConfirmed → canceled 'client_not_confirmed'
//   - scheduledAt alcanzado → promueve: SQL ride + outbox (+accepted si driver confirmado)
func (s *Service) Process(ctx context.Context, requestID string) (promoted, canceled int, err error) {
	now := time.Now()
	upper := now.Add(PromotionGrace).Add(OrphanWindow).UnixMilli()
	snaps, err := s.fs.Collection(col).
		Where("scheduledAt", "<=", upper).
		Where("status", "in", []string{"scheduled", "client_confirmed"}).
		Limit(200).
		Documents(ctx).GetAll()
	if err != nil {
		return 0, 0, err
	}
	for _, snap := range snaps {
		// Huérfano: su ventana de procesamiento ya cerró hace >1h.
		// Cliente no confirmó dentro de la ventana → cancel (sin tope superior:
		// el check de huérfano ya acota el extremo; un ride sin confirmar que
		// pase la gracia no debe caer a promote).
		d, action, err := s.preparePromotion(ctx, snap.Ref)
		if err != nil {
			return promoted, canceled, err
		}
		// Aún no llega la hora de promoción.
		if action == "canceled" {
			canceled++
		}
		if action != "promote" {
			continue
		}
		driverID := str(d["driverId"])
		driverConfirmed, _ := d["driverConfirmed"].(bool)
		if err := s.promote(ctx, snap.Ref, d, driverID != "" && driverConfirmed, requestID); err != nil {
			if errors.Is(err, errClientHasActiveRide) {
				didCancel, cancelErr := s.cancelPromotionConflict(ctx, snap.Ref, str(d["promotionToken"]))
				if cancelErr != nil {
					return promoted, canceled, cancelErr
				}
				if didCancel {
					canceled++
					s.notifyPromotionConflict(ctx, str(d["clientId"]), snap.Ref.ID)
				}
				continue
			}
			return promoted, canceled, err
		}
		promoted++
	}
	return promoted, canceled, nil
}

func (s *Service) preparePromotion(ctx context.Context, ref *firestore.DocumentRef) (map[string]any, string, error) {
	var data map[string]any
	var action string
	err := s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		data, action = nil, ""
		snap, err := tx.Get(ref)
		if status.Code(err) == codes.NotFound {
			return nil
		}
		if err != nil {
			return err
		}
		d := snap.Data()
		if st := str(d["status"]); st != "scheduled" && st != "client_confirmed" {
			return nil
		}
		scheduledMs, ok := numField(d["scheduledAt"])
		if !ok {
			return nil
		}
		now := time.Now()
		scheduled := time.UnixMilli(scheduledMs)
		if d["promotionStarted"] == true {
			lease, _ := numField(d["promotionLeaseUntil"])
			if lease > now.UnixMilli() {
				return nil
			}
		} else {
			reason := ""
			if scheduled.Before(now.Add(-OrphanWindow - ConfirmWindow)) {
				reason = "orphan"
			} else if !now.Before(scheduled.Add(PromotionGrace)) && d["clientConfirmed"] != true {
				reason = "client_not_confirmed"
			}
			if reason != "" {
				action = "canceled"
				return tx.Set(ref, map[string]any{
					"status": "canceled", "cancelReason": reason,
					"canceledAt": firestore.ServerTimestamp, "updatedAt": firestore.ServerTimestamp,
				}, firestore.MergeAll)
			}
			if now.Before(scheduled) || d["clientConfirmed"] != true {
				return nil
			}
		}
		data, action = d, "promote"
		token := uuid.NewString()
		data["promotionToken"] = token
		return tx.Set(ref, map[string]any{
			"promotionStarted": true, "promotionLeaseUntil": now.Add(2 * time.Minute).UnixMilli(),
			"promotionToken": token,
			"updatedAt":      firestore.ServerTimestamp,
		}, firestore.MergeAll)
	})
	return data, action, err
}

func (s *Service) cancelPromotionConflict(ctx context.Context, ref *firestore.DocumentRef, token string) (bool, error) {
	canceled := false
	err := s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		canceled = false
		snap, err := tx.Get(ref)
		if err != nil {
			return err
		}
		d := snap.Data()
		if token == "" || str(d["promotionToken"]) != token || d["promotionStarted"] != true {
			return nil
		}
		if st := str(d["status"]); st != "scheduled" && st != "client_confirmed" {
			return nil
		}
		canceled = true
		return tx.Set(ref, map[string]any{
			"status": "canceled", "cancelReason": "client_has_active_ride",
			"canceledAt": firestore.ServerTimestamp, "updatedAt": firestore.ServerTimestamp,
		}, firestore.MergeAll)
	})
	return canceled, err
}

func (s *Service) notifyPromotionConflict(ctx context.Context, clientID, rideID string) {
	if s.notifications == nil || clientID == "" {
		return
	}
	notifyCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.notifications.Notify(notifyCtx, clientID, rideID, notifications.General, notifications.NotifyOpts{
		Key: notificationKey("busy", rideID, 0), Title: "Viaje programado cancelado",
		Body:      "No pudimos iniciar tu viaje programado porque ya tienes un viaje activo.",
		ExtraData: map[string]string{"type": "programmed_ride_update", "role": "client"},
	}); err != nil {
		slog.Warn("programmed promotion conflict notification failed", "err", err)
	}
}

// promote — crea la fila rides (requested o accepted) + outbox + marca doc.
func (s *Service) promote(ctx context.Context, ref *firestore.DocumentRef, d map[string]any, withDriver bool, requestID string) error {
	var existingID string
	err := s.pool.QueryRow(ctx, `SELECT id::text FROM public.rides WHERE firebase_ride_id = $1`, ref.ID).Scan(&existingID)
	if err == nil {
		return markPromoted(ctx, ref, existingID)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	clientID, _ := d["clientId"].(string)
	driverID, _ := d["driverId"].(string)
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var rideID string
	var status string
	status = "requested"
	paymentType := str(d["paymentMethod"])
	if paymentType == "card" {
		paymentType = "card_local"
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO public.rides (
			firebase_ride_id, client_id, driver_id, ride_type, vehicle_type,
			designated_driver_vehicle, estimated_distance, estimated_duration,
			estimated_price, client_suggested_price, pricing_snapshot,
			passengers, notes, payment_type, service_id, client_vehicle_photo,
			service_area_id, status, accepted_at
		) VALUES (
			$1, $2, $3, COALESCE(NULLIF($4,'')::public.ride_type,'normal'), COALESCE(NULLIF($5,''),'auto'),
			NULLIF($6,'')::public.designated_driver_vehicle, $7, $8, $9, $10, $11, COALESCE($12,1), NULLIF($13,''),
			COALESCE(NULLIF($14,'')::public.ride_payment_type,'cash'),
			COALESCE((SELECT id FROM public.services WHERE code = NULLIF($15, '')),
				CASE WHEN NULLIF($15, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
					THEN NULLIF($15, '')::uuid END),
			NULLIF($16,''), NULLIF($18,''),
			$17::ride_status, CASE WHEN $17 = 'accepted' THEN NOW() ELSE NULL END
		) RETURNING id::text`,
		ref.ID, clientID, nil,
		str(d["rideType"]), str(d["vehicleType"]), str(d["designatedDriverVehicle"]),
		intOrNil(d["estimatedDistance"]), intOrNil(d["estimatedDuration"]),
		numOrNil(d["estimatedPrice"]), numOrNil(d["clientSuggestedPrice"]),
		jsonOrNil(d["pricingSnapshot"]), intOrNil(d["passengers"]),
		str(d["notes"]), paymentType, str(d["serviceId"]),
		str(d["clientVehiclePhoto"]), status, str(d["serviceAreaId"]),
	).Scan(&rideID)
	if err != nil {
		_ = tx.Rollback(ctx)
		if lookupErr := s.pool.QueryRow(ctx, `SELECT id::text FROM public.rides WHERE firebase_ride_id = $1`, ref.ID).Scan(&existingID); lookupErr == nil {
			return markPromoted(ctx, ref, existingID)
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "uq_rides_one_active_per_client" {
			return errClientHasActiveRide
		}
		return fmt.Errorf("promote insert: %w", err)
	}
	if withDriver && driverID != "" {
		eligibilityErr := rides.NewService(s.pool, s.fs).ValidateProgrammedDriver(ctx, tx, rideID, driverID)
		var domainErr *apperr.Error
		if eligibilityErr != nil && (!errors.As(eligibilityErr, &domainErr) || (domainErr.Code != 403 && domainErr.Code != 409)) {
			return eligibilityErr
		}
		if eligibilityErr == nil {
			if _, err := tx.Exec(ctx, `UPDATE public.rides SET driver_id=$2, status='accepted', accepted_at=NOW(),
				final_fare=COALESCE(client_suggested_price, estimated_price) WHERE id=$1::uuid`, rideID, driverID); err != nil {
				return err
			}
			status = "accepted"
		}
	}
	if status == "accepted" {
		if err := pickupcode.Create(ctx, tx, rideID); err != nil {
			return err
		}
	}

	// Ruta contratada desde el doc programado: origin order 0, waypoints,
	// destination; puebla origin_location_id/destination_location_id para ETA
	// e historial de ruta (misma forma que POST /rides).
	loc := func(key string) (lat, lng float64, addr string, ok bool) {
		m, ok := d[key].(map[string]any)
		if !ok {
			return 0, 0, "", false
		}
		lat, _ = floatField(m["lat"])
		lng, _ = floatField(m["lng"])
		addr, _ = m["address"].(string)
		return lat, lng, addr, lat != 0 || lng != 0
	}
	var originLocID, destLocID *string
	if olat, olng, oaddr, ok := loc("origin"); ok {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'origin', 0, $2, $3, NULLIF($4, ''))
			RETURNING id::text`, rideID, olat, olng, oaddr).Scan(&id); err != nil {
			return fmt.Errorf("promote origin location: %w", err)
		}
		originLocID = &id
	}
	extraN := 0
	if extras, ok := d["extraDestinations"].([]any); ok {
		for i, e := range extras {
			m, ok := e.(map[string]any)
			if !ok {
				continue
			}
			elat, _ := floatField(m["lat"])
			elng, _ := floatField(m["lng"])
			eaddr, _ := m["address"].(string)
			if _, err := tx.Exec(ctx, `
				INSERT INTO public.ride_locations
					(ride_id, location_type, location_order, latitude, longitude, address)
				VALUES ($1::uuid, 'waypoint', $2, $3, $4, NULLIF($5, ''))`,
				rideID, i+1, elat, elng, eaddr); err != nil {
				return fmt.Errorf("promote waypoint location: %w", err)
			}
			extraN = i + 1
		}
	}
	if dlat, dlng, daddr, ok := loc("destination"); ok {
		var id string
		if err := tx.QueryRow(ctx, `
			INSERT INTO public.ride_locations
				(ride_id, location_type, location_order, latitude, longitude, address)
			VALUES ($1::uuid, 'destination', $2, $3, $4, NULLIF($5, ''))
			RETURNING id::text`, rideID, extraN+1, dlat, dlng, daddr).Scan(&id); err != nil {
			return fmt.Errorf("promote destination location: %w", err)
		}
		destLocID = &id
	}
	if originLocID != nil || destLocID != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE public.rides
			SET origin_location_id = COALESCE($2::uuid, origin_location_id),
			    destination_location_id = COALESCE($3::uuid, destination_location_id)
			WHERE id = $1::uuid`, rideID, originLocID, destLocID); err != nil {
			return fmt.Errorf("promote link locations: %w", err)
		}
	}

	var serviceCode string
	if err := tx.QueryRow(ctx, `SELECT COALESCE(s.code, '') FROM public.rides r
		LEFT JOIN public.services s ON s.id=r.service_id WHERE r.id=$1::uuid`, rideID).Scan(&serviceCode); err != nil {
		return err
	}
	if serviceCode == "" {
		serviceCode = str(d["serviceCode"])
	}
	payload := map[string]any{
		"rideId": rideID, "firebaseRideId": ref.ID,
		"clientId": clientID, "status": status, "version": 1,
		"rideType": d["rideType"], "vehicleType": d["vehicleType"],
		"estimatedPrice": d["estimatedPrice"], "paymentType": paymentType,
		"requestedAt":  time.Now().Format(time.RFC3339),
		"isProgrammed": true,
	}
	if org, ok := d["origin"].(map[string]any); ok {
		payload["originLat"], _ = floatField(org["lat"])
		payload["originLng"], _ = floatField(org["lng"])
	}
	payload["serviceAreaId"], _ = d["serviceAreaId"].(string)
	payload["serviceCode"] = serviceCode
	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type: "ride.requested", AggregateType: "ride", AggregateID: rideID,
		RequestID: requestID, Payload: payload,
	}); err != nil {
		return err
	}
	if status == "accepted" {
		if err := outbox.Insert(ctx, tx, outbox.Event{
			Type: "ride.accepted", AggregateType: "ride", AggregateID: rideID,
			RequestID: requestID,
			Payload: map[string]any{
				"rideId": rideID, "firebaseRideId": ref.ID,
				"clientId": clientID, "driverId": driverID,
				"status": status, "version": 1,
				"acceptedAt":   time.Now().Format(time.RFC3339),
				"isProgrammed": true,
			},
		}); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return markPromoted(ctx, ref, rideID)
}

func markPromoted(ctx context.Context, ref *firestore.DocumentRef, rideID string) error {
	_, err := ref.Set(ctx, map[string]any{
		"status":     "promoted",
		"rideId":     rideID,
		"promotedAt": firestore.ServerTimestamp,
		"updatedAt":  firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err
}

// Cleanup — docs terminales (canceled/promoted) >7d (cleanupProgrammedRides).
func (s *Service) Cleanup(ctx context.Context) (int, error) {
	cut := time.Now().Add(-7 * 24 * time.Hour)
	snaps, err := s.fs.Collection(col).
		Where("status", "in", []string{"canceled", "promoted"}).
		Where("updatedAt", "<", cut).
		Limit(500).
		Documents(ctx).GetAll()
	if err != nil {
		return 0, err
	}
	deleted := 0
	for _, snap := range snaps {
		removed := false
		err := s.fs.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			removed = false
			current, err := tx.Get(snap.Ref)
			if status.Code(err) == codes.NotFound {
				return nil
			}
			if err != nil {
				return err
			}
			data := current.Data()
			updatedAt, ok := data["updatedAt"].(time.Time)
			if st := str(data["status"]); (st != "canceled" && st != "promoted") || !ok || !updatedAt.Before(cut) {
				return nil
			}
			code := str(data["shareCode"])
			if code != "" {
				codeRef := s.fs.Collection(fs.ColProgrammedCodes).Doc(code)
				reservation, err := tx.Get(codeRef)
				if err != nil && status.Code(err) != codes.NotFound {
					return err
				}
				if err == nil && str(reservation.Data()["rideId"]) == snap.Ref.ID {
					if err := tx.Delete(codeRef); err != nil {
						return err
					}
				}
			}
			removed = true
			return tx.Delete(snap.Ref)
		})
		if err != nil {
			return deleted, err
		}
		if removed {
			deleted++
		}
	}
	return deleted, nil
}

// ---------- helpers ----------
func numField(v any) (int64, bool) {
	switch n := v.(type) {
	case float64:
		return int64(n), true
	case int64:
		return n, true
	case int:
		return int64(n), true
	}
	return 0, false
}
func floatField(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int64:
		return float64(n), true
	case int:
		return float64(n), true
	}
	return 0, false
}
func str(v any) string {
	s, _ := v.(string)
	return s
}
func strOrNil(ok bool, s string) any {
	if ok && s != "" {
		return s
	}
	return nil
}
func numOrNil(v any) any {
	if n, ok := floatField(v); ok {
		return n
	}
	return nil
}
func intOrNil(v any) any {
	if n, ok := numField(v); ok {
		return n
	}
	return nil
}
func jsonOrNil(v any) any {
	if v == nil {
		return nil
	}
	if s, ok := v.(string); ok && s == "" {
		return nil
	}
	return v
}
func shareCode() (string, error) {
	for {
		value, err := rand.Int(rand.Reader, big.NewInt(2176782336))
		if err != nil {
			return "", err
		}
		code := strings.ToUpper(value.Text(36))
		code = strings.Repeat("0", 6-len(code)) + code
		if strings.ContainsAny(code, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
			return code, nil
		}
	}
}
