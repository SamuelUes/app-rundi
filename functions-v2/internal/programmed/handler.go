package programmed

import (
	"encoding/json"
	"net/http"
	"strconv"

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

// Routes — /v1/programmed-rides.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	r.Get("/mine", h.mine)
	r.Post("/{id}/assign", h.assign)
	r.Post("/{id}/claim", h.claim)
	r.Post("/{id}/confirm", h.confirm)
	r.Post("/{id}/cancel", h.cancel)
	return r
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
		As string `json:"as"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
		(body.As != "client" && body.As != "driver") {
		apperr.Write(w, apperr.New(400, "as debe ser client|driver"))
		return
	}
	if err := h.svc.Confirm(r.Context(), uid, chi.URLParam(r, "id"), body.As); err != nil {
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
