package calls

import (
	"encoding/json"
	"io"
	"net/http"

	"cloud.google.com/go/firestore"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/config"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	svc  *Service
	cfg  *config.Config
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewHandler(svc *Service, cfg *config.Config, pool *pgxpool.Pool, fsClient *firestore.Client) *Handler {
	return &Handler{svc: svc, cfg: cfg, pool: pool, fs: fsClient}
}

// Routes — /v1/calls (autenticado).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/initiate", h.initiate)
	r.Post("/{callId}/token", h.token)
	return r
}

// POST /v1/calls/initiate — crea doc con roles SQL + pending call_initiated.
func (h *Handler) initiate(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body InitiateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	callID, err := h.svc.Initiate(r.Context(), uid, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]string{"callId": callID})
}

// POST /v1/calls/{callId}/token — token LiveKit para unirse al room.
func (h *Handler) token(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	out, err := h.svc.Token(r.Context(), uid, chi.URLParam(r, "callId"),
		h.cfg.LiveKitAPIKey, h.cfg.LiveKitAPISecret, h.cfg.LiveKitURL)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

// Webhook — POST /livekit/webhook (ruta pública; auth = JWT LiveKit en header).
// participant_joined(≥2)→connected; room_finished→ended+archivo; egress_ended→recordingUrl.
func (h *Handler) Webhook(w http.ResponseWriter, r *http.Request) {
	if h.cfg.LiveKitAPIKey == "" || h.cfg.LiveKitAPISecret == "" {
		apperr.Write(w, apperr.New(503, "LiveKit no configurado"))
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		apperr.Write(w, apperr.New(400, "bad body"))
		return
	}
	ev, err := verifyWebhook(h.cfg.LiveKitAPIKey, h.cfg.LiveKitAPISecret,
		r.Header.Get("Authorization"), string(raw))
	if err != nil {
		apperr.Write(w, apperr.New(401, "invalid webhook signature"))
		return
	}
	if ev.Room == nil {
		apperr.JSON(w, http.StatusOK, map[string]bool{"ignored": true})
		return
	}
	callID := CallIDFromRoom(ev.Room.Name)
	if callID == "" {
		apperr.JSON(w, http.StatusOK, map[string]bool{"ignored": true})
		return
	}
	ctx := r.Context()
	callRef := h.fs.Collection(fs.ColCalls).Doc(callID)
	snap, err := callRef.Get(ctx)
	if err != nil || !snap.Exists() {
		apperr.JSON(w, http.StatusOK, map[string]bool{"ignored": true})
		return
	}
	status, _ := snap.Data()["status"].(string)
	terminal := status == "ended" || status == "rejected" || status == "missed"

	switch ev.Event {
	case "participant_joined":
		joinable := map[string]bool{
			"initiated": true, "ringing_client": true, "ringing_operator": true,
			"ringing_driver": true, "accepted": true,
		}
		if ev.Room.NumParticipants >= 2 && joinable[status] {
			_, _ = callRef.Set(ctx, map[string]any{
				"status":      "connected",
				"connectedAt": firestore.ServerTimestamp,
				"updatedAt":   firestore.ServerTimestamp,
			}, firestore.MergeAll)
			_, _ = callRef.Collection("events").NewDoc().Set(ctx, map[string]any{
				"type": "connected", "at": firestore.ServerTimestamp, "source": "livekit_webhook",
			})
		}
	case "room_finished":
		if !terminal {
			_, _ = callRef.Set(ctx, map[string]any{
				"status":    "ended",
				"endedAt":   firestore.ServerTimestamp,
				"updatedAt": firestore.ServerTimestamp,
			}, firestore.MergeAll)
			_, _ = callRef.Collection("events").NewDoc().Set(ctx, map[string]any{
				"type": "ended", "at": firestore.ServerTimestamp, "source": "livekit_webhook",
			})
			// Archivo directo a SQL (backend-authoritative; ON CONFLICT idempotente).
			if err := ArchiveCallSession(ctx, h.pool, h.fs, callID); err != nil {
				apperr.JSON(w, http.StatusOK, map[string]any{"archived": false})
				return
			}
		}
	case "egress_ended":
		if ev.EgressInfo != nil && len(ev.EgressInfo.FileResults) > 0 {
			u := ev.EgressInfo.FileResults[0].Location
			if u == "" {
				u = ev.EgressInfo.FileResults[0].Filename
			}
			if u != "" {
				_, _ = callRef.Set(ctx, map[string]any{
					"recordingUrl": u,
					"updatedAt":    firestore.ServerTimestamp,
				}, firestore.MergeAll)
			}
		}
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
