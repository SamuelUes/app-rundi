// cmd/consumer — Cloud Run Job/Service: sweeper del Outbox SQL → proyecciones
// versionadas a Firestore (doc §6.1) + consumidor de SYSTEM_pending_events
// (doc §5.2). Idempotente: solo aplica version > version ya aplicada
// (transacción Firestore compare-and-set) y dedupe por event_id en
// SYSTEM_processed_events.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/calls"
	"github.com/rundi/functions-v2/internal/config"
	"github.com/rundi/functions-v2/internal/db"
	"github.com/rundi/functions-v2/internal/fcm"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/matching"
	"github.com/rundi/functions-v2/internal/notifications"
	"github.com/rundi/functions-v2/internal/projections"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		slog.Error("postgres", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	fsClient, err := fs.NewClient(ctx, cfg)
	if err != nil {
		slog.Error("firestore", "err", err)
		os.Exit(1)
	}
	defer fsClient.Close()
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		slog.Error("firebase app", "err", err)
		os.Exit(1)
	}
	fcmSender, err := fcm.NewSender(ctx, app)
	if err != nil {
		slog.Error("fcm", "err", err)
		os.Exit(1)
	}
	notify := notifications.NewCenter(fsClient, fcmSender)

	n, sweepErr := sweep(ctx, pool, fsClient, fcmSender, notify, cfg)
	if sweepErr != nil {
		slog.Error("sweep", "err", sweepErr, "processed", n)
	}
	slog.Info("outbox sweep done", "processed", n)

	pe, err := processPendingEvents(ctx, pool, fsClient, notify)
	if err != nil {
		slog.Error("pending events", "err", err, "processed", pe)
	}
	slog.Info("pending events done", "processed", pe)

	if sweepErr != nil || err != nil {
		os.Exit(1)
	}
}

type pendingEvent struct {
	EventID       string
	EventType     string
	AggregateType string
	AggregateID   string
	Payload       json.RawMessage
	Attempts      int
	MaxAttempts   int
}

// sweepBatchSize limita eventos por corrida; sweepLease es el tiempo que un
// evento reclamado queda invisible para otros sweeps si este proceso muere.
const (
	sweepBatchSize = 100
	sweepLease     = 5 * time.Minute
)

// sweep — patrón doc §6.1 paso 6-7 con lease: el claim corre en una TX corta
// (FOR UPDATE SKIP LOCKED + attempts+1 + next_attempt_at=lease) y COMMIT antes
// de cualquier trabajo externo. Firestore/FCM ya no ocurren con una TX SQL
// abierta; cada resultado (published/backoff/dead-letter) es su propio UPDATE.
// Si el proceso muere, el lease expira y otro sweep retoma los eventos (los
// handlers son idempotentes: create-once + reserva SQL + índice parcial).
func sweep(ctx context.Context, pool *pgxpool.Pool, fsClient *firestore.Client, fcmSender *fcm.Sender, notify *notifications.Center, cfg *config.Config) (int, error) {
	leaseUntil := time.Now().Add(sweepLease)
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		UPDATE public.outbox_events
		SET attempts = attempts + 1, next_attempt_at = $1
		WHERE event_id IN (
			SELECT event_id FROM public.outbox_events
			WHERE status = 'pending' AND next_attempt_at <= NOW()
			ORDER BY created_at
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		RETURNING event_id, event_type, aggregate_type, aggregate_id, payload,
		          attempts, max_attempts`, leaseUntil, sweepBatchSize)
	if err != nil {
		return 0, err
	}
	var claimed []pendingEvent
	for rows.Next() {
		var ev pendingEvent
		if err := rows.Scan(&ev.EventID, &ev.EventType, &ev.AggregateType,
			&ev.AggregateID, &ev.Payload, &ev.Attempts, &ev.MaxAttempts); err != nil {
			rows.Close()
			return 0, err
		}
		claimed = append(claimed, ev)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	if len(claimed) == 0 {
		return 0, nil
	}

	// Los eventos reclamados que no alcancemos a procesar (salida temprana,
	// cancelación) se liberan de inmediato en vez de esperar el lease.
	processed := make(map[string]bool, len(claimed))
	defer func() {
		var pending []string
		for _, ev := range claimed {
			if !processed[ev.EventID] {
				pending = append(pending, ev.EventID)
			}
		}
		if len(pending) == 0 {
			return
		}
		releaseCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, rerr := pool.Exec(releaseCtx, `
			UPDATE public.outbox_events
			SET next_attempt_at = NOW()
			WHERE event_id = ANY($1) AND status = 'pending'
			  AND next_attempt_at = $2`, pending, leaseUntil); rerr != nil {
			slog.Warn("outbox lease release", "events", len(pending), "err", rerr)
		}
	}()

	var published []pendingEvent
	for _, ev := range claimed {
		pev := projections.Event{
			EventID: ev.EventID, EventType: ev.EventType,
			AggregateType: ev.AggregateType, AggregateID: ev.AggregateID,
			Payload: ev.Payload,
		}
		publishErr := publishAndDispatch(ev,
			func() error { return projections.Publish(ctx, pool, fsClient, pev) },
			func(p map[string]any) error { return dispatchOffers(ctx, pool, fsClient, fcmSender, cfg, ev, p) },
			func() error { return closePendingRideOffers(ctx, pool, fsClient, ev.AggregateID) },
		)
		if err := publishErr; err != nil {
			if ev.Attempts >= ev.MaxAttempts {
				// Dead-letter: terminal 'failed' + failed_at (alerta/reproceso
				// manual — nunca reintento caliente infinito).
				if _, qerr := pool.Exec(ctx, `
					UPDATE public.outbox_events
					SET status = 'failed', failed_at = NOW(), last_error = $2
					WHERE event_id = $1`, ev.EventID, err.Error()); qerr != nil {
					return len(published), qerr
				}
				processed[ev.EventID] = true
				writeProjectionStatus(ctx, fsClient, ev, "failed", err.Error())
				slog.Error("outbox dead-letter", "event", ev.EventID,
					"type", ev.EventType, "err", err)
				continue
			}
			// Backoff exponencial; evento queda pending para próximo sweep.
			backoff := time.Duration(1<<minEv(ev.Attempts, 6)) * time.Second
			if _, qerr := pool.Exec(ctx, `
				UPDATE public.outbox_events
				SET next_attempt_at = NOW() + $2 * interval '1 second',
				    last_error = $3
				WHERE event_id = $1`, ev.EventID, int(backoff.Seconds()), err.Error()); qerr != nil {
				return len(published), qerr
			}
			processed[ev.EventID] = true
			writeProjectionStatus(ctx, fsClient, ev, "error", err.Error())
			continue
		}
		if _, err := pool.Exec(ctx, `
			UPDATE public.outbox_events
			SET status = 'published', published_at = NOW(), last_error = NULL
			WHERE event_id = $1`, ev.EventID); err != nil {
			return len(published), err
		}
		processed[ev.EventID] = true
		writeProjectionStatus(ctx, fsClient, ev, "ok", "")
		published = append(published, ev)
	}

	// Retención: borra publicados viejos (los 'failed' NO se purgan —
	// requieren revisión humana). Índice: idx_outbox_published_cleanup.
	if _, err := pool.Exec(ctx, `
		DELETE FROM public.outbox_events
		WHERE status = 'published' AND published_at < NOW() - interval '7 days'`); err != nil {
		slog.Warn("outbox purge", "err", err)
	}

	// Efectos post-commit no críticos (fallos no desmarcan el evento).
	for _, ev := range published {
		notifySideEffects(ctx, pool, notify, ev)
	}
	return len(published), nil
}

func publishAndDispatch(ev pendingEvent, publish func() error, dispatch func(map[string]any) error, closeOffers func() error) error {
	if err := publish(); err != nil {
		return err
	}
	if ev.EventType == "ride.accepted" || ev.EventType == "ride.canceled" {
		return closeOffers()
	}
	if ev.EventType != "ride.requested" {
		return nil
	}
	var payload map[string]any
	if err := json.Unmarshal(ev.Payload, &payload); err != nil {
		return fmt.Errorf("decode dispatch payload: %w", err)
	}
	return dispatch(payload)
}

// The SQL ride is authoritative; Firestore transactions preserve concurrent
// driver rejections while closing offers after an assignment or cancellation.
func closePendingRideOffers(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID string) error {
	var rideStatus string
	var driverID *string
	if err := pool.QueryRow(ctx, `SELECT status::text, driver_id FROM public.rides WHERE id=$1::uuid`, rideID).
		Scan(&rideStatus, &driverID); err != nil {
		return fmt.Errorf("load ride to close offers: %w", err)
	}
	if rideStatus != "canceled" && (driverID == nil || dispatchableRide(rideStatus, driverID)) {
		return nil
	}
	query := c.Collection(fs.ColDriverOffers).Where("rideId", "==", rideID)
	if rideStatus != "canceled" {
		query = query.Where("status", "==", "pending")
	}
	snaps, err := query.Documents(ctx).GetAll()
	if err != nil {
		return fmt.Errorf("find pending offers: %w", err)
	}
	for _, snap := range snaps {
		ref := snap.Ref
		if err := c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
			current, err := tx.Get(ref)
			if err != nil {
				if status.Code(err) == codes.NotFound {
					return nil
				}
				return err
			}
			currentStatus, _ := current.Data()["status"].(string)
			if currentStatus != "pending" && !(rideStatus == "canceled" && currentStatus == "accepted") {
				return nil
			}
			newStatus := "canceled"
			if rideStatus != "canceled" && driverID != nil && current.Data()["driverId"] == *driverID {
				newStatus = "accepted"
			}
			return tx.Update(ref, []firestore.Update{
				{Path: "status", Value: newStatus},
				{Path: "updatedAt", Value: firestore.ServerTimestamp},
			})
		}); err != nil {
			return fmt.Errorf("close offer %s: %w", ref.ID, err)
		}
	}
	return nil
}

// writeProjectionStatus — SYSTEM_projection_status/{aggType}_{aggId}: versión
// aplicada y estado de sync (doc §3 SYSTEM). El reconciliador lo lee para
// detectar divergencia con la autoridad SQL.
func writeProjectionStatus(ctx context.Context, c *firestore.Client, ev pendingEvent, st, lastErr string) {
	var p map[string]any
	_ = json.Unmarshal(ev.Payload, &p)
	data := map[string]any{
		"aggregateType":  ev.AggregateType,
		"aggregateId":    ev.AggregateID,
		"appliedVersion": p["version"],
		"lastEventId":    ev.EventID,
		"status":         st,
		"updatedAt":      firestore.ServerTimestamp,
	}
	if lastErr != "" {
		data["lastError"] = lastErr
	}
	docID := fmt.Sprintf("%s_%s", ev.AggregateType, ev.AggregateID)
	_, _ = c.Collection(fs.ColProjectionStatus).Doc(docID).
		Set(ctx, data, firestore.MergeAll)
}

// ==========================================================================
// SYSTEM_pending_events — eventos Firestore-operacionales que requieren
// durabilidad SQL (doc §5.2). El cliente escribe el doc operacional + el
// pending event en un batch atómico; el consumidor lo persiste en SQL de
// forma idempotente y registra SYSTEM_processed_events/{eventId}.
// ==========================================================================

func processPendingEvents(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, notify *notifications.Center) (int, error) {
	iter := c.Collection(fs.ColPendingEvents).
		Where("status", "==", "pending").
		OrderBy("createdAt", firestore.Asc).
		Limit(50).
		Documents(ctx)
	snaps, err := iter.GetAll()
	if err != nil {
		return 0, err
	}
	processed := 0
	for _, s := range snaps {
		eventID := s.Ref.ID
		d := s.Data()
		eventType, _ := d["eventType"].(string)
		// Dedupe: si ya existe processed_events/{eventId} solo se cierra el pending.
		exists, _ := c.Collection(fs.ColProcessedEvents).Doc(eventID).Get(ctx)
		if exists != nil && exists.Exists() {
			_, _ = s.Ref.Update(ctx, []firestore.Update{
				{Path: "status", Value: "processed"},
			})
			continue
		}
		result, perr := applyPendingEvent(ctx, pool, c, notify, eventType, d)
		if perr != nil {
			result = "error: " + perr.Error()
			slog.Warn("pending event", "id", eventID, "type", eventType, "err", perr)
		}
		_, werr := c.Collection(fs.ColProcessedEvents).Doc(eventID).Set(ctx, map[string]any{
			"eventType":   eventType,
			"aggregateId": d["aggregateId"],
			"result":      result,
			"payload":     d["payload"],
			"processedAt": firestore.ServerTimestamp,
			// TTL declarado en el doc: la policy de Firestore borra por expireAt.
			"expireAt": time.Now().Add(30 * 24 * time.Hour),
		})
		if werr != nil {
			return processed, werr
		}
		_, _ = s.Ref.Update(ctx, []firestore.Update{
			{Path: "status", Value: "processed"},
		})
		processed++
	}
	return processed, nil
}

// applyPendingEvent — persistencia SQL por tipo de evento. Idempotente:
// re-ejecutar el mismo evento converge al mismo estado.
// NUNCA confiar en el payload: se valida participación antes de escribir.
func applyPendingEvent(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client,
	notify *notifications.Center, eventType string, d map[string]any) (string, error) {
	payload, _ := d["payload"].(map[string]any)
	switch eventType {
	case "arrival_photo_uploaded":
		rideID, _ := payload["rideId"].(string)
		uid, _ := payload["uid"].(string)
		path, _ := payload["path"].(string)
		if rideID == "" || uid == "" || path == "" {
			return "", fmt.Errorf("payload incompleto (rideId/uid/path)")
		}
		// El uid debe ser el driver o el follower del viaje (nunca un tercero).
		tag, err := pool.Exec(ctx, `
			UPDATE public.rides SET arrival_vehicle_photo = $2
			WHERE id = $1::uuid AND (driver_id = $3 OR follower_driver_id = $3)`,
			rideID, path, uid)
		if err != nil {
			return "", err
		}
		if tag.RowsAffected() == 0 {
			return "", fmt.Errorf("uid %s no es participante del ride %s", uid, rideID)
		}
		return "arrival_vehicle_photo actualizado", nil

	case "call_initiated":
		// Push de llamada entrante al callee (el caller ya escribió el doc).
		callID, _ := payload["callId"].(string)
		uid, _ := payload["uid"].(string)
		callee, err := callParticipant(ctx, c, callID, uid, "caller")
		if err != nil {
			return "", err
		}
		if notify != nil && callee != "" {
			_ = notify.Notify(ctx, callee, "", notifications.RideCall, notifications.NotifyOpts{
				Key: "call-" + callID,
				ExtraData: map[string]string{
					"type": "call", "callId": callID,
				},
			})
		}
		return "push enviado a callee", nil

	case "call_ended":
		// Archiva sesión en call_sessions unificada (port de onCallEnded.ts).
		// Idempotente por call_id UNIQUE + ON CONFLICT.
		callID, _ := payload["callId"].(string)
		uid, _ := payload["uid"].(string)
		if _, err := callParticipant(ctx, c, callID, uid, "either"); err != nil {
			return "", err
		}
		return archiveCallSession(ctx, pool, c, callID)

	case "chat_message":
		// Push a los demás participantes del chat (port de
		// onSupportChatMessage/notifySupportChatMessage de v1).
		chatID, _ := payload["chatId"].(string)
		uid, _ := payload["uid"].(string)
		if chatID == "" || uid == "" {
			return "", fmt.Errorf("payload incompleto (chatId/uid)")
		}
		snap, err := c.Collection(fs.ColChats).Doc(chatID).Get(ctx)
		if err != nil {
			return "", fmt.Errorf("chat %s no encontrado", chatID)
		}
		parts, _ := snap.Data()["participants"].([]any)
		isPart := false
		for _, p := range parts {
			if s, _ := p.(string); s == uid {
				isPart = true
				break
			}
		}
		if !isPart {
			return "", fmt.Errorf("uid %s no participa en chat %s", uid, chatID)
		}
		for _, p := range parts {
			to, _ := p.(string)
			if to == "" || to == uid || notify == nil {
				continue
			}
			_ = notify.Notify(ctx, to, "", notifications.ChatMessage, notifications.NotifyOpts{
				Key:       "chat-" + chatID,
				ExtraData: map[string]string{"type": "chat", "chatId": chatID},
			})
		}
		return "notified", nil

	case "proximity_notify":
		// notifyProximityRide v1: el service ya validó elegibilidad; aquí solo
		// se dispara el push al cliente (idempotente por docId fijo).
		clientID, _ := payload["clientId"].(string)
		rideID, _ := payload["rideId"].(string)
		if clientID == "" || rideID == "" {
			return "", fmt.Errorf("payload incompleto (clientId/rideId)")
		}
		if notify != nil {
			_ = notify.Notify(ctx, clientID, rideID, notifications.RideDriverOffered,
				notifications.NotifyOpts{
					Key:       "proximity-" + rideID,
					ExtraData: map[string]string{"type": "proximity", "rideId": rideID},
				})
		}
		return "notified", nil

	default:
		return "unhandled", nil
	}
}

// callParticipant — lee REALTIME_calls/{callId} y verifica participación.
// role: "caller" (devuelve calleeUid), "either" (solo verifica).
func callParticipant(ctx context.Context, c *firestore.Client, callID, uid, role string) (string, error) {
	if callID == "" || uid == "" {
		return "", fmt.Errorf("payload incompleto (callId/uid)")
	}
	snap, err := c.Collection(fs.ColCalls).Doc(callID).Get(ctx)
	if err != nil {
		return "", fmt.Errorf("call %s no encontrada", callID)
	}
	d := snap.Data()
	caller, _ := d["callerUid"].(string)
	callee, _ := d["calleeUid"].(string)
	switch {
	case role == "caller":
		if caller != uid {
			return "", fmt.Errorf("uid %s no es el caller", uid)
		}
		return callee, nil
	default:
		if caller != uid && callee != uid {
			return "", fmt.Errorf("uid %s no es participante", uid)
		}
		return "", nil
	}
}

// archiveCallSession — delega en calls.ArchiveCallSession (compartido con el
// webhook de LiveKit; port de onCallEnded, idempotente por call_id UNIQUE).
func archiveCallSession(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, callID string) (string, error) {
	err := calls.ArchiveCallSession(ctx, pool, c, callID)
	if err != nil {
		return "", err
	}
	return "call_session archivada", nil
}

func minEv(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// notifySideEffects — evento → destinatario + tipo (port de notificationCenter
// de v1). Errores solo se registran: nunca bloquean el marcado del evento.
func notifySideEffects(ctx context.Context, pool *pgxpool.Pool, notify *notifications.Center, ev pendingEvent) {
	var p map[string]any
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return
	}
	rideID := ev.AggregateID
	clientID, _ := p["clientId"].(string)
	driverID, _ := p["driverId"].(string)
	canceledBy, _ := p["canceledBy"].(string)
	// ride.status_changed emite {from,to,actor} — el estado nuevo vive en "to".
	status, _ := p["to"].(string)
	if status == "" {
		status, _ = p["status"].(string)
	}
	// Eventos de aggregates ajenos (payment.*) no traen participantes: resolver
	// por rideId contra la autoridad SQL.
	if (clientID == "" || driverID == "") && pool != nil {
		if rid, _ := p["rideId"].(string); rid != "" {
			var cID *string
			var dID *string
			if err := pool.QueryRow(ctx,
				`SELECT client_id, driver_id FROM public.rides WHERE id = $1::uuid`,
				rid).Scan(&cID, &dID); err == nil {
				if clientID == "" && cID != nil {
					clientID = *cID
				}
				if driverID == "" && dID != nil {
					driverID = *dID
				}
			}
		}
	}

	send := func(uid string, t notifications.Type, sub notifications.LiveStatus) {
		if err := notify.Notify(ctx, uid, rideID, t, notifications.NotifyOpts{LiveSub: sub}); err != nil {
			slog.Warn("notify", "type", t, "uid", uid, "err", err)
		}
	}

	switch ev.EventType {
	case "ride.requested":
		send(clientID, notifications.RideRequested, "")
	case "ride.accepted":
		send(clientID, notifications.RideLiveUpdate, notifications.LiveDriverAssigned)
		send(driverID, notifications.RideAssigned, "")
	case "ride.price_offered":
		send(clientID, notifications.RideDriverOffered, "")
	case "ride.status_changed":
		switch status {
		case "driver_on_route", "accepted":
			send(clientID, notifications.RideLiveUpdate, notifications.LiveDriverOnRoute)
		case "driver_arrived":
			send(clientID, notifications.RideLiveUpdate, notifications.LiveArrivedPickup)
		case "in_progress":
			send(clientID, notifications.RideLiveUpdate, notifications.LiveTripInProgress)
		}
	case "ride.completed":
		send(clientID, notifications.RideLiveUpdate, notifications.LiveCompleted)
		send(driverID, notifications.RideCompleted, "")
	case "ride.canceled":
		if canceledBy == "client" {
			send(driverID, notifications.RideCanceledDriver, "")
		} else {
			send(clientID, notifications.RideCanceledClient, "")
		}
	case "ride.follower_attached":
		follower, _ := p["followerDriverId"].(string)
		send(follower, notifications.RideAssigned, "")
	case "payment.confirmed":
		send(clientID, notifications.General, "")
	}
}

// dispatchOffers — ride.requested: matching en drivers_live → crea ofertas
// REALTIME_driver_offers/{rideId}_{driverUID} con expiresAt (TTL de config) +
// push FCM a los candidatos (tokens de DATA-MAIN_users/{uid}/fcmTokens).
func dispatchOffers(ctx context.Context, pool *pgxpool.Pool, fsClient *firestore.Client, fcmSender *fcm.Sender, cfg *config.Config, ev pendingEvent, p map[string]any) error {
	// Viajes ya aceptados (p.ej. programmed con driverConfirm) no se despachan:
	// promoverlos emitiría ofertas + push "nueva solicitud" espurios.
	if s, _ := p["status"].(string); s != "" && s != "requested" {
		return nil
	}
	if d, _ := p["driverId"].(string); d != "" {
		return nil
	}
	lat, _ := p["originLat"].(float64)
	lng, _ := p["originLng"].(float64)
	areaID, _ := p["serviceAreaId"].(string)
	serviceCode, _ := p["serviceCode"].(string)
	vehicleType, _ := p["vehicleType"].(string)
	if lat == 0 && lng == 0 {
		return fmt.Errorf("dispatch: missing origin for event %s", ev.EventID)
	}

	// Contexto del viaje para la tarjeta de oferta del driver (el doc de oferta
	// es su única fuente antes de aceptar — GET /rides/{id} requiere ser
	// participante, por eso la oferta lleva los datos embebidos).
	offerCtx := map[string]any{
		"rideType":      p["rideType"],
		"vehicleType":   p["vehicleType"],
		"paymentType":   p["paymentType"],
		"serviceCode":   p["serviceCode"],
		"serviceAreaId": p["serviceAreaId"],
	}
	var (
		oAddr, dAddr, clientName, rideType   *string
		estPrice, estDist, estDur, clientSug *float64
		oLat, oLng, dLat, dLng               *float64
		passengers                           *int64
		notes, desigVeh, clientVehPhoto      *string
		currentStatus                        string
		currentDriver                        *string
		snapshot                             json.RawMessage
		wps                                  json.RawMessage
	)
	if err := pool.QueryRow(ctx, `
		SELECT v.origin_latitude, v.origin_longitude, v.origin_address,
		       v.destination_latitude, v.destination_longitude, v.destination_address,
		       uc.name, r.estimated_price, r.estimated_distance, r.estimated_duration,
		       r.client_suggested_price, r.ride_type, r.passengers, r.notes, v.waypoints,
		       r.designated_driver_vehicle, r.client_vehicle_photo, r.pricing_snapshot,
		       r.status::text, r.driver_id
		FROM public.rides r
		LEFT JOIN public.rides_with_complete_route v ON v.id = r.id
		LEFT JOIN public.users uc ON uc.id = r.client_id
		WHERE r.id = $1::uuid`, ev.AggregateID).Scan(
		&oLat, &oLng, &oAddr, &dLat, &dLng, &dAddr, &clientName,
		&estPrice, &estDist, &estDur, &clientSug, &rideType, &passengers, &notes, &wps,
		&desigVeh, &clientVehPhoto, &snapshot, &currentStatus, &currentDriver); err == nil {
		if !dispatchableRide(currentStatus, currentDriver) {
			return nil
		}
		if oLat != nil && oLng != nil {
			origin := map[string]any{"latitude": *oLat, "longitude": *oLng}
			if oAddr != nil {
				origin["address"] = *oAddr
			}
			offerCtx["origin"] = origin
		}
		if dLat != nil && dLng != nil {
			dest := map[string]any{"latitude": *dLat, "longitude": *dLng}
			if dAddr != nil {
				dest["address"] = *dAddr
			}
			offerCtx["destination"] = dest
		}
		if clientName != nil {
			offerCtx["clientName"] = *clientName
		}
		if estPrice != nil {
			offerCtx["estimatedPrice"] = *estPrice
		}
		if estDist != nil {
			offerCtx["estimatedDistance"] = *estDist
		}
		if estDur != nil {
			offerCtx["estimatedDuration"] = *estDur
		}
		if clientSug != nil {
			offerCtx["clientSuggestedPrice"] = *clientSug
		}
		if rideType != nil {
			offerCtx["rideType"] = *rideType
		}
		if passengers != nil {
			offerCtx["passengers"] = *passengers
		}
		if notes != nil {
			offerCtx["notes"] = *notes
		}
		if len(wps) > 0 {
			var arr []map[string]any
			if json.Unmarshal(wps, &arr) == nil && len(arr) > 0 {
				extra := make([]map[string]any, 0, len(arr))
				for _, w := range arr {
					e := map[string]any{"lat": w["lat"], "lng": w["lng"]}
					if a, ok := w["address"].(string); ok {
						e["address"] = a
					}
					extra = append(extra, e)
				}
				offerCtx["extraDestinations"] = extra
			}
		}
		if desigVeh != nil {
			offerCtx["designatedDriverVehicle"] = *desigVeh
		}
		if clientVehPhoto != nil {
			offerCtx["clientVehiclePhoto"] = *clientVehPhoto
		}
		if len(snapshot) > 0 {
			var snap map[string]any
			if json.Unmarshal(snapshot, &snap) == nil {
				if fc, ok := snap["featureCodes"].([]any); ok && len(fc) > 0 {
					codes := make([]string, 0, len(fc))
					for _, c := range fc {
						if s, ok := c.(string); ok {
							codes = append(codes, s)
						}
					}
					offerCtx["featureCodes"] = codes
				}
			}
		}
	} else {
		return fmt.Errorf("load ride for dispatch: %w", err)
	}
	cands, err := matching.FindDrivers(ctx, fsClient, matching.Query{
		ServiceAreaID: areaID, ServiceCode: serviceCode, VehicleType: vehicleType,
		Latitude: lat, Longitude: lng, RadiusKm: cfg.MatchRadiusKm, Limit: cfg.MatchMaxOffers,
	})
	if err != nil {
		return err
	}
	if err := reserveOffers(ctx, pool, ev.AggregateID, cands, cfg.OfferTTL); err != nil {
		return err
	}

	// Recover previously reserved offers even if matching results changed after
	// a partial failure. Accepted, rejected and expired offers are never reset.
	rows, err := pool.Query(ctx, `
		SELECT driver_id, COALESCE(distance_km, 0), expires_at
		FROM public.ride_offers
		WHERE ride_id = $1::uuid AND kind = 'offer' AND status = 'sent'
		  AND expires_at > NOW()
		ORDER BY created_at`, ev.AggregateID)
	if err != nil {
		return fmt.Errorf("load reserved offers: %w", err)
	}
	type reservedOffer struct {
		driverID  string
		distance  float64
		expiresAt time.Time
	}
	var offers []reservedOffer
	for rows.Next() {
		var offer reservedOffer
		if err := rows.Scan(&offer.driverID, &offer.distance, &offer.expiresAt); err != nil {
			rows.Close()
			return err
		}
		offers = append(offers, offer)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, offer := range offers {
		offerID := ev.AggregateID + "_" + offer.driverID
		doc := map[string]any{
			"rideId":     ev.AggregateID,
			"driverId":   offer.driverID,
			"clientId":   p["clientId"],
			"status":     "pending",
			"distanceKm": offer.distance,
			"expiresAt":  offer.expiresAt,
			"createdAt":  firestore.ServerTimestamp,
		}
		for k, v := range offerCtx {
			if v != nil {
				doc[k] = v
			}
		}
		created, err := publishReservedOffer(ctx, pool, fsClient, ev.AggregateID, offer.driverID, doc)
		if err != nil {
			return err
		}
		if !created {
			continue
		}
		// Tokens del candidato (DATA-MAIN_users/{uid}/fcmTokens).
		tokens := []string{}
		if tokSnaps, err := fsClient.Collection(fs.ColUsers).Doc(offer.driverID).
			Collection("fcmTokens").Documents(ctx).GetAll(); err == nil {
			for _, ts := range tokSnaps {
				tokens = append(tokens, ts.Ref.ID)
			}
		} else {
			slog.Warn("offer token lookup failed", "event", ev.EventID, "driver", offer.driverID, "err", err)
		}
		if len(tokens) == 0 {
			continue
		}
		remaining := time.Until(offer.expiresAt)
		if remaining <= 0 {
			continue
		}
		invalid, err := fcmSender.SendToTokens(ctx, tokens, "Nueva solicitud de viaje",
			"Hay un viaje disponible cerca de ti. Acéptalo antes de que expire.",
			map[string]string{
				"type": "ride_offer", "rideId": ev.AggregateID, "offerId": offerID,
			}, fcm.SendOpts{ChannelID: fcm.DefaultChannel, TTL: remaining, CollapseKey: "offer-" + ev.AggregateID})
		if err != nil {
			slog.Warn("offer push failed", "event", ev.EventID, "driver", offer.driverID, "err", err)
			continue
		}
		for _, tok := range invalid {
			_, _ = fsClient.Collection(fs.ColUsers).Doc(offer.driverID).
				Collection("fcmTokens").Doc(tok).Delete(ctx)
		}
	}
	return nil
}

func reserveOffers(ctx context.Context, pool *pgxpool.Pool, rideID string, cands []matching.Candidate, ttl time.Duration) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var rideStatus string
	var driverID *string
	if err := tx.QueryRow(ctx, `SELECT status::text, driver_id FROM public.rides WHERE id=$1::uuid FOR NO KEY UPDATE`, rideID).
		Scan(&rideStatus, &driverID); err != nil {
		return err
	}
	if !dispatchableRide(rideStatus, driverID) {
		return tx.Commit(ctx)
	}
	expiresAt := time.Now().Add(ttl)
	for _, c := range cands {
		if _, err := tx.Exec(ctx, `
			INSERT INTO public.ride_offers (ride_id, driver_id, kind, status, distance_km, expires_at)
			SELECT $1::uuid, d.user_id, 'offer', 'sent', $3, $4
			FROM public.drivers d WHERE d.user_id = $2
			ON CONFLICT (ride_id, driver_id) WHERE kind = 'offer' DO NOTHING`,
			rideID, c.DriverUID, c.DistanceKm, expiresAt); err != nil {
			return fmt.Errorf("reserve offer for %s: %w", c.DriverUID, err)
		}
	}
	return tx.Commit(ctx)
}

// Lock the SQL ride and offer in the same order as assignment/cancellation,
// preventing a new live offer from appearing after a terminal SQL transition.
func publishReservedOffer(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, rideID, driverID string, data map[string]any) (bool, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var rideStatus, offerStatus string
	var assignedDriver *string
	var expiresAt *time.Time
	err = tx.QueryRow(ctx, `SELECT status::text, driver_id FROM public.rides WHERE id=$1::uuid FOR NO KEY UPDATE`, rideID).
		Scan(&rideStatus, &assignedDriver)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !dispatchableRide(rideStatus, assignedDriver) {
		return false, tx.Commit(ctx)
	}
	err = tx.QueryRow(ctx, `
		SELECT status::text, expires_at FROM public.ride_offers
		WHERE ride_id=$1::uuid AND driver_id=$2 AND kind='offer' FOR NO KEY UPDATE`, rideID, driverID).
		Scan(&offerStatus, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if offerStatus != "sent" || expiresAt == nil || !expiresAt.After(time.Now()) {
		return false, tx.Commit(ctx)
	}
	created, err := createOfferOnce(func() error {
		_, err := c.Collection(fs.ColDriverOffers).Doc(rideID+"_"+driverID).Create(ctx, data)
		return err
	})
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return created, nil
}

// Repeated dispatches must not reset an accepted, rejected or expired offer.
func createOfferOnce(create func() error) (bool, error) {
	err := create()
	if status.Code(err) == codes.AlreadyExists {
		return false, nil
	}
	return err == nil, err
}

func dispatchableRide(status string, driverID *string) bool {
	return driverID == nil && (status == "requested" || status == "driver_offered")
}
