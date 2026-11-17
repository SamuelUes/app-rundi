package programmed

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/middleware"
	"github.com/rundi/functions-v2/internal/ratelimit"
)

type Handler struct {
	svc     *Service
	limiter middleware.RateStore
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc, limiter: ratelimit.NewStore(svc.pool)}
}

func (h *Handler) limit(w http.ResponseWriter, r *http.Request, policy string, capacity int) bool {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	if uid == "" {
		apperr.Write(w, apperr.New(http.StatusUnauthorized, "missing identity"))
		return false
	}
	allowed, retry, err := h.limiter.Allow(r.Context(), policy, uid, capacity, time.Minute)
	if err != nil {
		apperr.Write(w, apperr.New(http.StatusServiceUnavailable, "rate limit unavailable"))
		return false
	}
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(retry.Seconds())))))
		apperr.Write(w, apperr.New(http.StatusTooManyRequests, "rate limit exceeded"))
		return false
	}
	return true
}

// Routes — /v1/programmed-rides.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	r.Get("/mine", h.mine)
	r.Get("/{id}/candidates", h.candidates)
	r.Post("/{id}/assign", h.assign)
	r.Post("/{id}/remove-driver", h.removeDriver)
	r.Post("/{id}/claim", h.claim)
	r.Post("/{id}/decline", h.decline)
	r.Post("/{id}/confirm", h.confirm)
	r.Post("/{id}/cancel", h.cancel)
	return r
}

func (h *Handler) decline(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		InvitationAt *int64 `json:"invitationAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	if err := h.svc.Decline(r.Context(), uid, chi.URLParam(r, "id"), body.InvitationAt); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) removeDriver(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		DriverID        string `json:"driverId"`
		DriverConfirmed *bool  `json:"driverConfirmed"`
		InvitationAt    *int64 `json:"invitationAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DriverID == "" ||
		body.DriverConfirmed == nil || body.InvitationAt == nil {
		apperr.Write(w, apperr.New(400, "driverId, driverConfirmed and invitationAt required"))
		return
	}
	if err := h.svc.RemoveDriver(r.Context(), uid, chi.URLParam(r, "id"), body.DriverID, *body.DriverConfirmed, *body.InvitationAt); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) candidates(w http.ResponseWriter, r *http.Request) {
	if !h.limit(w, r, "programmed_driver_search", 30) {
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	out, err := h.svc.SearchCandidates(r.Context(), uid, chi.URLParam(r, "id"), r.URL.Query().Get("q"))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"candidates": out})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	id, shareCode, err := h.svc.Create(r.Context(), uid, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]string{"id": id, "shareCode": shareCode})
}

func (h *Handler) mine(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListMine(r.Context(), uid, r.URL.Query().Get("role"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"rides": out})
}

func (h *Handler) assign(w http.ResponseWriter, r *http.Request) {
	if !h.limit(w, r, "programmed_invite", 20) {
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		DriverID string `json:"driverId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DriverID == "" {
		apperr.Write(w, apperr.New(400, "driverId requerido"))
		return
	}
	if err := h.svc.Assign(r.Context(), uid, chi.URLParam(r, "id"), body.DriverID); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) claim(w http.ResponseWriter, r *http.Request) {
	if !h.limit(w, r, "programmed_claim", 10) {
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	if err := h.svc.Claim(r.Context(), uid, chi.URLParam(r, "id")); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// confirm — {as: 'client'|'driver'} (confirmProgrammedRideClient/Driver v1).
func (h *Handler) confirm(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		As           string `json:"as"`
		InvitationAt *int64 `json:"invitationAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
		(body.As != "client" && body.As != "driver") {
		apperr.Write(w, apperr.New(400, "as debe ser client|driver"))
		return
	}
	if err := h.svc.Confirm(r.Context(), uid, chi.URLParam(r, "id"), body.As, body.InvitationAt); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.Cancel(r.Context(), uid, chi.URLParam(r, "id"), body.Reason); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
