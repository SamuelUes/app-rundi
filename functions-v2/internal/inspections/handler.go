package inspections

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

// Routes — /v1/inspections.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.submit)
	r.Get("/ride/{rideId}", h.byRide)
	r.Patch("/{id}", h.update)
	return r
}

func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body SubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	i, err := h.svc.Submit(r.Context(), uid, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{"inspection": i})
}

func (h *Handler) byRide(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	i, err := h.svc.GetByRide(r.Context(), chi.URLParam(r, "rideId"), uid, role)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"inspection": i})
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body SubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	i, err := h.svc.Update(r.Context(), chi.URLParam(r, "id"), uid, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"inspection": i})
}
