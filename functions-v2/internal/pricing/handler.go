package pricing

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
	r.Post("/calculate", h.calculate)
	r.Post("/calculate-variants", h.variants)
	return r
}

type CalculateRequest struct {
	DistanceMeters       float64  `json:"distanceMeters"`
	DurationSeconds      float64  `json:"durationSeconds"`
	VehicleType          string   `json:"vehicleType"` // car|motorcycle|auto|moto
	RideType             string   `json:"rideType"`    // normal|designated_driver
	OriginLat            *float64 `json:"originLat,omitempty"`
	OriginLng            *float64 `json:"originLng,omitempty"`
	ServiceCodeOverride  string   `json:"serviceCodeOverride,omitempty"`
	ExtraStops           int      `json:"extraStops,omitempty"`
	SkipSurge            bool     `json:"skipSurge,omitempty"`
	SelectedFeatureCodes []string `json:"selectedFeatureCodes,omitempty"`
	DriverID             *string  `json:"driverId,omitempty"`
}

func normalizeVehicle(v string) string {
	switch v {
	case "auto", "car":
		return "car"
	case "moto", "motorcycle":
		return "motorcycle"
	default:
		return v
	}
}

// POST /v1/pricing/calculate — estimación (antes: calculateRidePriceHttp).
func (h *Handler) calculate(w http.ResponseWriter, r *http.Request) {
	var body CalculateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	res, err := h.svc.Calculate(r.Context(), body.DistanceMeters, body.DurationSeconds,
		normalizeVehicle(body.VehicleType), body.RideType, Options{
			OriginLat:            body.OriginLat,
			OriginLng:            body.OriginLng,
			DriverID:             body.DriverID,
			ServiceCodeOverride:  body.ServiceCodeOverride,
			ExtraStops:           body.ExtraStops,
			SkipSurge:            body.SkipSurge,
			SelectedFeatureCodes: body.SelectedFeatureCodes,
		})
	if err != nil {
		apperr.Write(w, apperr.New(400, err.Error()))
		return
	}
	apperr.JSON(w, http.StatusOK, res)
}

// POST /v1/pricing/calculate-variants — todas las variantes de vehículo
// (antes: calculateRidePricesHttp). Devuelve resultado por tipo o error por tipo.
func (h *Handler) variants(w http.ResponseWriter, r *http.Request) {
	var body CalculateRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	driverID := body.DriverID
	if driverID == nil && uid != "" {
		driverID = &uid
	}
	out := map[string]any{}
	for _, vt := range []string{"car", "motorcycle"} {
		res, err := h.svc.Calculate(r.Context(), body.DistanceMeters, body.DurationSeconds,
			vt, body.RideType, Options{
				OriginLat:            body.OriginLat,
				OriginLng:            body.OriginLng,
				DriverID:             driverID,
				ServiceCodeOverride:  body.ServiceCodeOverride,
				ExtraStops:           body.ExtraStops,
				SkipSurge:            body.SkipSurge,
				SelectedFeatureCodes: body.SelectedFeatureCodes,
			})
		if err != nil {
			out[vt] = map[string]string{"error": err.Error()}
			continue
		}
		out[vt] = res
	}
	apperr.JSON(w, http.StatusOK, out)
}
