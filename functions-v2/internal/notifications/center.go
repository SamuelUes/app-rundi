// Package notifications — centro de notificaciones (doc §7.5).
// Orquestado desde consumidores; idempotente: el item in-app usa doc id =
// notificationKey (determinístico por evento) y el push usa collapse-id/tag
// para que re-entregas actualicen en vez de duplicar.
// Port de services/notificationCenter.ts + notificationCatalog.ts +
// notificationI18n.ts de v1 (tipos, canales, TTLs, fallbacks ES/EN).
package notifications

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fcm"
	"github.com/rundi/functions-v2/internal/fs"
)

type Type string

const (
	RideRequested       Type = "ride_requested"
	RideDriverOffered   Type = "ride_driver_offered"
	RideAssigned        Type = "ride_assigned"
	RideDriverOnRoute   Type = "ride_driver_on_route"
	RideCompleted       Type = "ride_completed"
	RideCompletedRating Type = "ride_completed_rating"
	RideCanceledClient  Type = "ride_canceled_client"
	RideCanceledDriver  Type = "ride_canceled_driver"
	RideLiveUpdate      Type = "ride_live_update"
	ChatMessage         Type = "chat_message"
	SupportChat         Type = "support_chat"
	SupportCall         Type = "support_call"
	RideCall            Type = "ride_call"
	General             Type = "general"
	AdminNotice         Type = "admin_notice"
)

// LiveStatus — estados del viaje vivo (liveRideStatusCatalog de v1).
type LiveStatus string

const (
	LiveDriverAssigned LiveStatus = "driver_assigned"
	LiveDriverOnRoute  LiveStatus = "driver_on_route"
	LiveArrivedPickup  LiveStatus = "arrived_pickup"
	LiveTripInProgress LiveStatus = "trip_in_progress"
	LiveCompleted      LiveStatus = "completed"
	LiveCanceled       LiveStatus = "canceled"
)

type catalogEntry struct {
	I18nKey   string
	ChannelID string
	TTL       time.Duration
	KeyPrefix string
	TitleES   string
	BodyES    string
}

var catalog = map[Type]catalogEntry{
	RideRequested:       {"ride_request_sent", fcm.DefaultChannel, 2 * time.Minute, "ride", "Solicitud enviada", "Estamos buscando un conductor para tu viaje"},
	RideDriverOffered:   {"driver_available", fcm.DefaultChannel, 2 * time.Minute, "ride", "Conductor disponible", "Un conductor está listo para tu viaje. Revísalo ahora."},
	RideAssigned:        {"ride_assigned", fcm.DefaultChannel, 2 * time.Minute, "ride", "Viaje asignado", "El cliente confirmó el viaje. Dirígete al punto de encuentro."},
	RideDriverOnRoute:   {"driver_on_way", fcm.DefaultChannel, 2 * time.Minute, "ride", "Conductor en camino", "Tu conductor se dirige al punto de recogida."},
	RideCompleted:       {"ride_completed", fcm.DefaultChannel, 2 * time.Minute, "ride", "Viaje finalizado", "Por favor confirma y realiza el pago."},
	RideCompletedRating: {"ride_completed_rating", fcm.DefaultChannel, 2 * time.Minute, "ride", "Viaje finalizado", "Por favor confirma y realiza el pago."},
	RideCanceledClient:  {"ride_canceled_client", fcm.DefaultChannel, 2 * time.Minute, "ride", "Viaje cancelado", "Tu solicitud de viaje fue cancelada."},
	RideCanceledDriver:  {"ride_canceled_driver", fcm.DefaultChannel, 2 * time.Minute, "ride", "Viaje cancelado", "El cliente canceló la solicitud antes de iniciar el viaje."},
	RideLiveUpdate:      {"", fcm.ActiveRideChannel, 15 * time.Minute, "live-ride", "", ""}, // i18n por substatus
	ChatMessage:         {"chat_message", fcm.DefaultChannel, 2 * time.Minute, "chat", "Nuevo mensaje", "Tienes un mensaje nuevo."},
	SupportChat:         {"support_chat", fcm.DefaultChannel, 2 * time.Minute, "support", "Soporte", "Nuevo mensaje de soporte."},
	SupportCall:         {"support_call", fcm.DefaultChannel, 2 * time.Minute, "support", "Llamada de soporte", "Tienes una llamada de soporte."},
	RideCall:            {"ride_call", fcm.DefaultChannel, 90 * time.Second, "ride-call", "Llamada", "Te están llamando sobre el viaje."},
	General:             {"general", fcm.DefaultChannel, 2 * time.Minute, "notif", "Rundi", "Tienes una notificación nueva."},
	AdminNotice:         {"admin_notice", fcm.DefaultChannel, 24 * time.Hour, "admin", "Aviso", "Tienes un aviso de Rundi."},
}

// liveRide i18n por substatus (liveRideStatusCatalog + notificationI18n de v1).
var liveCatalog = map[LiveStatus]catalogEntry{
	LiveDriverAssigned: {I18nKey: "live_ride_driver_assigned", ChannelID: fcm.ActiveRideChannel, TTL: 15 * time.Minute, KeyPrefix: "live-ride", TitleES: "Conductor confirmado", BodyES: "Tu viaje fue asignado. Te avisaremos del progreso."},
	LiveDriverOnRoute:  {I18nKey: "live_ride_driver_on_route", ChannelID: fcm.ActiveRideChannel, TTL: 15 * time.Minute, KeyPrefix: "live-ride", TitleES: "Conductor en camino", BodyES: "Tu conductor se dirige al punto de encuentro."},
	LiveArrivedPickup:  {I18nKey: "live_ride_arrived_pickup", ChannelID: fcm.ActiveRideChannel, TTL: 15 * time.Minute, KeyPrefix: "live-ride", TitleES: "Conductor llegó", BodyES: "Tu conductor está en el punto de recogida."},
	LiveTripInProgress: {I18nKey: "live_ride_trip_in_progress", ChannelID: fcm.ActiveRideChannel, TTL: 15 * time.Minute, KeyPrefix: "live-ride", TitleES: "Viaje en progreso", BodyES: "Estás en camino a tu destino."},
	LiveCompleted:      {I18nKey: "live_ride_completed", ChannelID: fcm.ActiveRideChannel, TTL: 15 * time.Minute, KeyPrefix: "live-ride", TitleES: "Viaje finalizado", BodyES: "Tu viaje terminó, revisa el resumen."},
	LiveCanceled:       {I18nKey: "live_ride_canceled", ChannelID: fcm.ActiveRideChannel, TTL: 15 * time.Minute, KeyPrefix: "live-ride", TitleES: "Viaje cancelado", BodyES: "El viaje fue cancelado."},
}

// NotifyOpts — overrides puntuales (title/body custom, key explícita).
type NotifyOpts struct {
	Title       string
	Body        string
	Key         string // notificationKey explícito (vence al prefix+rideId)
	ExtraData   map[string]string
	LiveSub     LiveStatus // solo para Type=RideLiveUpdate
	SkipPersist bool       // push sin item in-app (señalización efímera)
}

type Center struct {
	fs  *firestore.Client
	fcm *fcm.Sender
}

func NewCenter(fsClient *firestore.Client, fcmSender *fcm.Sender) *Center {
	return &Center{fs: fsClient, fcm: fcmSender}
}

// Notify — escribe item in-app (idempotente por notificationKey) + push FCM.
// Los tokens se leen de DATA-MAIN_users/{uid}/fcmTokens; los inválidos se borran.
func (c *Center) Notify(ctx context.Context, uid, rideID string, t Type, opts NotifyOpts) error {
	if uid == "" {
		return nil
	}
	entry, ok := catalog[t]
	if !ok {
		return fmt.Errorf("unknown notification type %q", t)
	}
	if t == RideLiveUpdate && opts.LiveSub != "" {
		if e, ok := liveCatalog[opts.LiveSub]; ok {
			entry = e
		}
	}

	key := opts.Key
	if key == "" && rideID != "" {
		key = entry.KeyPrefix + "-" + rideID
	}
	if key == "" {
		key = entry.KeyPrefix + "-" + fmt.Sprint(time.Now().UnixNano())
	}

	title := opts.Title
	if title == "" {
		title = entry.TitleES
	}
	body := opts.Body
	if body == "" {
		body = entry.BodyES
	}

	data := map[string]string{
		"type":            string(t),
		"notificationKey": key,
		"expiresInMs":     fmt.Sprint(entry.TTL.Milliseconds()),
	}
	if rideID != "" {
		data["rideId"] = rideID
	}
	if entry.I18nKey != "" {
		data["i18nKey"] = entry.I18nKey
	}
	for k, v := range opts.ExtraData {
		data[k] = v
	}

	// 1) Item in-app idempotente: doc id = notificationKey (re-entregas mergean).
	if !opts.SkipPersist {
		item := map[string]any{
			"type":            string(t),
			"i18nKey":         entry.I18nKey,
			"title":           title,
			"body":            body,
			"notificationKey": key,
			"data":            data,
			"read":            false,
			"updatedAt":       firestore.ServerTimestamp,
		}
		if rideID != "" {
			item["rideId"] = rideID
		}
		ref := c.fs.Collection(fs.ColNotifications).Doc(uid).Collection("items").Doc(key)
		exists := false
		if snap, err := ref.Get(ctx); err == nil && snap.Exists() {
			exists = true
		} else if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if !exists {
			item["createdAt"] = firestore.ServerTimestamp
		}
		if _, err := ref.Set(ctx, item, firestore.MergeAll); err != nil {
			return fmt.Errorf("notification item: %w", err)
		}
	}

	// 2) Push a todos los tokens del usuario.
	tokens, err := c.tokens(ctx, uid)
	if err != nil {
		return err
	}
	if len(tokens) == 0 {
		return nil
	}
	invalid, err := c.fcm.SendToTokens(ctx, tokens, title, body, data, fcm.SendOpts{
		ChannelID:   entry.ChannelID,
		TTL:         entry.TTL,
		CollapseKey: key,
	})
	if err != nil {
		return err
	}
	// Depuración de tokens inválidos (v1: deleteToken).
	batch := c.fs.BulkWriter(ctx)
	for _, tok := range invalid {
		ref := c.fs.Collection(fs.ColUsers).Doc(uid).Collection("fcmTokens").Doc(tok)
		if _, err := batch.Delete(ref); err != nil {
			return err
		}
	}
	batch.End()
	return nil
}

func (c *Center) tokens(ctx context.Context, uid string) ([]string, error) {
	snaps, err := c.fs.Collection(fs.ColUsers).Doc(uid).Collection("fcmTokens").Documents(ctx).GetAll()
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(snaps))
	for _, s := range snaps {
		if s.Ref.ID != "" {
			out = append(out, s.Ref.ID) // doc id = token (convención v1)
		}
	}
	return out, nil
}

// SendToUids — sendAdminNotification v1: push directo a una lista de uids
// (sin item in-app persistido; es broadcast operativo del CMS).
func (c *Center) SendToUids(ctx context.Context, uids []string, title, body string, data map[string]string) (sent int, err error) {
	if c.fcm == nil {
		return 0, fmt.Errorf("fcm not configured")
	}
	for _, uid := range uids {
		tokens, err := c.tokens(ctx, uid)
		if err != nil || len(tokens) == 0 {
			continue
		}
		if _, err := c.fcm.SendToTokens(ctx, tokens, title, body, data, fcm.SendOpts{
			CollapseKey: "admin-broadcast",
		}); err == nil {
			sent++
		}
	}
	return sent, nil
}
