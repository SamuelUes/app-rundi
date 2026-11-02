package crew

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/invite", h.invite)
	r.Post("/accept", h.acceptInvite)
	r.Post("/leave", h.leave)
	r.Post("/attach", h.attach)
	r.Post("/release", h.release)
	return r
}

// POST /v1/crew/invite — capitán invita seguidor elegible.
func (h *Handler) invite(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body InviteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.FollowerID == "" {
		apperr.Write(w, apperr.New(400, "invalid body: followerId required"))
		return
	}
	if err := h.svc.Invite(r.Context(), uid, body.FollowerID); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"event": "crew.invited"})
}

// POST /v1/crew/accept — seguidor acepta la invitación pendiente.
func (h *Handler) acceptInvite(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	if err := h.svc.AcceptInvite(r.Context(), uid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"event": "crew.accepted"})
}

// POST /v1/crew/leave — cualquiera de los miembros abandona el crew.
func (h *Handler) leave(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	if err := h.svc.LeaveCrew(r.Context(), uid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"event": "crew.left"})
}

// POST /v1/crew/attach — capitán adjunta su seguidor al viaje.
func (h *Handler) attach(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	var body AttachRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "invalid body: rideId required"))
		return
	}
	if err := h.svc.AttachFollower(r.Context(), body.RideID, uid, reqID); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"event": "ride.follower_attached"})
}

// POST /v1/crew/release — libera al seguidor (capitán o el propio seguidor).
func (h *Handler) release(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	var body ReleaseRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "invalid body: rideId required"))
		return
	}
	if err := h.svc.ReleaseFollower(r.Context(), body.RideID, uid, body.Reason, reqID); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"event": "ride.follower_released"})
}
