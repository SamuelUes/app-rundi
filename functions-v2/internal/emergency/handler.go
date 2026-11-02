package emergency

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

// Routes — /v1/emergency-calls.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	r.Get("/mine", h.mine)
	r.Patch("/{id}/status", h.updateStatus)
	return r
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	var body CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	c, err := h.svc.Create(r.Context(), uid, role, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{"call": c})
}

func (h *Handler) mine(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListMine(r.Context(), uid, limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"calls": out})
}

func (h *Handler) updateStatus(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	if err := h.svc.UpdateStatus(r.Context(), chi.URLParam(r, "id"), uid, role, body.Status); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
