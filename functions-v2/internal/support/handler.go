package support

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

// Routes — /v1/support.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/complaints", h.create)
	r.Get("/complaints", h.list)
	r.Patch("/complaints/{id}", h.update)
	r.Delete("/complaints/{id}", h.delete)
	r.Post("/complaints/{id}/chat", h.joinChat)
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
	c, err := h.svc.CreateComplaint(r.Context(), uid, role, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{"complaint": c})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListComplaints(r.Context(), uid, role,
		r.URL.Query().Get("status"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"complaints": out})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	var body UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	c, err := h.svc.UpdateComplaint(r.Context(), chi.URLParam(r, "id"), uid, role, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"complaint": c})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	if err := h.svc.DeleteComplaint(r.Context(), chi.URLParam(r, "id"), uid, role); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) joinChat(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	chatID, err := h.svc.JoinChat(r.Context(), chi.URLParam(r, "id"), uid)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"chatId": chatID})
}
