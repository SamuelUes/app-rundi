package ratings

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

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.submit)
	r.Get("/driver/{driverId}", h.driverRatings)
	r.Get("/driver/{driverId}/insights", h.driverInsights)
	return r
}

// POST /v1/ratings — califica por rol, omite, o finaliza el flujo del viaje.
func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)

	var body SubmitRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "invalid body: rideId required"))
		return
	}
	rating, err := h.svc.Submit(r.Context(), uid, reqID, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	if rating == nil {
		apperr.JSON(w, http.StatusOK, map[string]string{"event": "rating.skipped"})
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{
		"rating": rating, "event": "rating.submitted",
	})
}

// GET /v1/ratings/driver/{driverId} — getDriverRatings v1.
func (h *Handler) driverRatings(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListDriverRatings(r.Context(), chi.URLParam(r, "driverId"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"ratings": out})
}

// GET /v1/ratings/driver/{driverId}/insights — getDriverPublicInsights v1.
func (h *Handler) driverInsights(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.PublicInsights(r.Context(), chi.URLParam(r, "driverId"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}
