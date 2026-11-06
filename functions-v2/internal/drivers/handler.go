package drivers

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

// Routes — /v1/drivers (conductor sobre su propio perfil/servicios/vehículos).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.register)
	r.Get("/me", h.getMe)
	r.Patch("/me", h.patchMe)
	r.Get("/me/services", h.listMyServices)
	r.Post("/me/services", h.assignMyService)
	r.Post("/me/driver-services/{id}/deactivate", h.deactivateMyService)
	r.Get("/me/vehicles", h.listMyVehicles)
	r.Post("/me/vehicles", h.registerVehicle)
	r.Patch("/me/vehicles/{id}", h.patchVehicle)
	r.Get("/me/vehicles/{id}", h.getVehicle)
	r.Post("/me/vehicles/{id}/switch", h.switchVehicle)
	r.Delete("/me/vehicles/{id}", h.deleteVehicle)
	r.Post("/me/designated-access", h.requestDesignatedAccess)
	r.Get("/me/designated-access", h.designatedAccessStatus)
	r.Get("/me/stats", h.myStats)
	r.Get("/me/features", h.myFeatures)
	r.Put("/me/features/senior", h.setSeniorFeature)
	r.Get("/me/recharges", h.myRecharges)
	r.Post("/me/recharges", h.requestRecharge)
	r.Get("/crew-candidates", h.crewCandidates)
	r.Get("/", h.listPublic)
	return r
}

// AdminRoutes — /v1/admin (RequireRole admin/operator montado fuera).
func (h *Handler) AdminRoutes(r chi.Router) {
	r.Post("/drivers/{id}/status", h.setStatus)
	r.Post("/driver-services/{id}/approve", h.approveService)
	r.Get("/drivers", h.listDrivers)
	r.Post("/drivers/{id}/features/{code}", h.grantDriverFeature)
	r.Delete("/drivers/{id}/features/{code}", h.revokeDriverFeature)
	r.Post("/vehicles/{id}/features/{code}", h.grantVehicleFeature)
	r.Delete("/vehicles/{id}/features/{code}", h.revokeVehicleFeature)
	r.Post("/drivers/{id}/recharges", h.createRecharge)
	r.Get("/recharges", h.listRecharges)
	r.Post("/recharges/{id}/confirm", h.confirmRecharge)
}

func ctxUID(r *http.Request) string {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	return uid
}
func ctxRID(r *http.Request) string {
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	return rid
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var body RegisterDriverInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	id, err := h.svc.Register(r.Context(), ctxUID(r), body, ctxRID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]string{"driverId": id})
}

func (h *Handler) getMe(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.GetMe(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

func (h *Handler) patchMe(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	if err := h.svc.PatchMe(r.Context(), ctxUID(r), body, ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) listMyServices(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.ListMyServices(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"services": out})
}

func (h *Handler) assignMyService(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ServiceCode string `json:"serviceCode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	if err := h.svc.AssignMyService(r.Context(), ctxUID(r), body.ServiceCode, ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]string{"status": "ok"})
}

func (h *Handler) deactivateMyService(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeactivateMyDriverService(r.Context(), ctxUID(r), chi.URLParam(r, "id"), ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) listMyVehicles(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.ListMyVehicles(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"vehicles": out})
}

func (h *Handler) registerVehicle(w http.ResponseWriter, r *http.Request) {
	var body VehicleInput
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	id, err := h.svc.RegisterVehicle(r.Context(), ctxUID(r), body, ctxRID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]string{"vehicleId": id})
}

func (h *Handler) patchVehicle(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	if err := h.svc.PatchVehicle(r.Context(), ctxUID(r), chi.URLParam(r, "id"), body, ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------- admin ----------

func (h *Handler) setStatus(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status string `json:"status"`
		Reason string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	if err := h.svc.SetAccountStatus(r.Context(), ctxUID(r), chi.URLParam(r, "id"), body.Status, body.Reason, ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) approveService(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.ApproveDriverService(r.Context(), ctxUID(r), chi.URLParam(r, "id"), ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
