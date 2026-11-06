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
	r.Post("/services", h.upsertService)
	r.Post("/features", h.upsertFeature)
	r.Post("/surge-rules", h.upsertSurgeRule)
	r.Post("/service-features", h.assignFeature)
	return r
}

func (h *Handler) ctx(r *http.Request) (string, string) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	return uid, rid
}

func (h *Handler) upsertService(w http.ResponseWriter, r *http.Request) {
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
