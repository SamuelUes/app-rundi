package catalog

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

// Rutas admin (montadas bajo /v1/admin/catalog con RequireRole admin/operator).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/services", h.listServices)
	r.Post("/services", h.upsertService)
	r.Get("/features", h.listFeatures)
	r.Post("/features", h.upsertFeature)
	r.Post("/surge-rules", h.upsertSurgeRule)
	r.Post("/service-features", h.assignFeature)
	return r
}

func (h *Handler) listServices(w http.ResponseWriter, r *http.Request) {
	if !h.adminOnly(w, r) {
		return
	}
	out, err := h.svc.ListServices(r.Context())
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"services": out})
}

func (h *Handler) listFeatures(w http.ResponseWriter, r *http.Request) {
	if !h.adminOnly(w, r) {
		return
	}
	out, err := h.svc.ListFeatures(r.Context())
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"features": out})
}

func (h *Handler) ctx(r *http.Request) (string, string) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	return uid, rid
}

func (h *Handler) adminOnly(w http.ResponseWriter, r *http.Request) bool {
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	if role == "admin" {
		return true
	}
	apperr.Write(w, apperr.New(http.StatusForbidden, "admin role required"))
	return false
}

func (h *Handler) upsertService(w http.ResponseWriter, r *http.Request) {
	if !h.adminOnly(w, r) {
		return
	}
	var body ServiceInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid, rid := h.ctx(r)
	if err := h.svc.UpsertService(r.Context(), uid, body, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) upsertFeature(w http.ResponseWriter, r *http.Request) {
	if !h.adminOnly(w, r) {
		return
	}
	var body FeatureInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid, rid := h.ctx(r)
	if err := h.svc.UpsertFeature(r.Context(), uid, body, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) upsertSurgeRule(w http.ResponseWriter, r *http.Request) {
	if !h.adminOnly(w, r) {
		return
	}
	var body SurgeRuleInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid, rid := h.ctx(r)
	if err := h.svc.UpsertSurgeRule(r.Context(), uid, body, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) assignFeature(w http.ResponseWriter, r *http.Request) {
	if !h.adminOnly(w, r) {
		return
	}
	var body AssignmentInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid, rid := h.ctx(r)
	if err := h.svc.AssignFeature(r.Context(), uid, body, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
