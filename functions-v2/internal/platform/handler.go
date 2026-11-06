package platform

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/matching"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Routes — /v1/platform (autenticado).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/analytics/events", h.trackEvent)
	r.Post("/biometric/log", h.logBiometric)
	r.Post("/sms-codes", h.logSMS)
	r.Post("/sms-codes/verify", h.verifySMS)
	r.Get("/sms-codes/verified-phone", h.verifiedPhone)
	r.Get("/biometric/mine", h.mineBio)
	r.Get("/sms-codes/mine", h.mineSMS)
	r.Get("/analytics/mine", h.mineAnalytics)
	r.Get("/region/availability", h.region)
	r.Post("/drivers/premium-eligibility", h.premiumDrivers)
	r.Get("/preflight", h.preflight)
	r.Post("/preflight/accept-terms", h.acceptTerms)
	r.Post("/rides/{rideId}/share", h.share)
	return r
}

func (h *Handler) premiumDrivers(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DriverIDs []string `json:"driverIds"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32768)).Decode(&body); err != nil || len(body.DriverIDs) > 200 {
		apperr.Write(w, apperr.New(400, "invalid driverIds"))
		return
	}
	eligible, err := matching.PremiumEligibleDrivers(r.Context(), h.svc.pool, body.DriverIDs)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	ids := make([]string, 0, len(eligible))
	for _, id := range body.DriverIDs {
		if eligible[id] {
			ids = append(ids, id)
			delete(eligible, id)
		}
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"driverIds": ids})
}

// PublicRoutes — /public (sin auth; el token HMAC es la autorización).
func (h *Handler) PublicRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/ride-tracking", h.publicTracking)
	return r
}

func uid(r *http.Request) string {
	u, _ := r.Context().Value(middleware.CtxUID).(string)
	return u
}

func (h *Handler) trackEvent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EventType  string         `json:"eventType"`
		Data       map[string]any `json:"data,omitempty"`
		Platform   string         `json:"platform,omitempty"`
		AppVersion string         `json:"appVersion,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	err := h.svc.TrackEvent(r.Context(), uid(r), body.EventType, body.Data,
		r.Header.Get("X-Forwarded-For"), r.UserAgent(), body.Platform, body.AppVersion)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}

func (h *Handler) logBiometric(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserType string `json:"userType"`
		Type     string `json:"biometricType"`
		Context  string `json:"context"`
		Success  bool   `json:"success"`
		Attempt  int    `json:"attempt"`
		ErrorMsg string `json:"error,omitempty"`
		RideID   string `json:"rideId,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	err := h.svc.LogBiometric(r.Context(), uid(r), body.UserType, body.Type,
		body.Context, body.Success, body.Attempt, body.ErrorMsg, body.RideID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}

func (h *Handler) logSMS(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone   string `json:"phone,omitempty"`
		Email   string `json:"email,omitempty"`
		Code    string `json:"code"`
		Context string `json:"context,omitempty"`
		RideID  string `json:"rideId,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	if err := h.svc.LogSMSCode(r.Context(), uid(r), body.Phone, body.Email,
		body.Code, body.Context, body.RideID); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}

func (h *Handler) verifySMS(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		apperr.Write(w, apperr.New(400, "code requerido"))
		return
	}
	if err := h.svc.VerifySMSCode(r.Context(), uid(r), body.Code); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"verified": true})
}

func (h *Handler) region(w http.ResponseWriter, r *http.Request) {
	lat, err1 := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err1 != nil || err2 != nil {
		apperr.Write(w, apperr.New(400, "lat/lng requeridos"))
		return
	}
	out, err := h.svc.RegionAvailability(r.Context(), lat, lng)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

func (h *Handler) preflight(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.PreflightData(r.Context(), uid(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

func (h *Handler) acceptTerms(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.AcceptTerms(r.Context(), uid(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) share(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TTLHours int `json:"ttlHours,omitempty"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	out, err := h.svc.CreateShareToken(r.Context(), uid(r),
		chi.URLParam(r, "rideId"), body.TTLHours)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, out)
}

func (h *Handler) publicTracking(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.PublicTracking(r.Context(), r.URL.Query().Get("token"))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

// GET /v1/platform/sms-codes/verified-phone?phone=&userId= —
// hasVerifiedRegisterPhoneLog v1.
func (h *Handler) verifiedPhone(w http.ResponseWriter, r *http.Request) {
	uidParam := r.URL.Query().Get("userId")
	if uidParam == "" {
		uidParam = uid(r)
	}
	ok, err := h.svc.HasVerifiedPhone(r.Context(), uidParam, r.URL.Query().Get("phone"))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"hasVerified": ok})
}

func (h *Handler) mineBio(w http.ResponseWriter, r *http.Request) {
	h.mine(w, r, "biometric")
}
func (h *Handler) mineSMS(w http.ResponseWriter, r *http.Request) {
	h.mine(w, r, "sms")
}
func (h *Handler) mineAnalytics(w http.ResponseWriter, r *http.Request) {
	h.mine(w, r, "analytics")
}

// GET /v1/platform/{entity}/mine — historial propio (getUser*Seq v1).
func (h *Handler) mine(w http.ResponseWriter, r *http.Request, entity string) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListMine(r.Context(), uid(r), entity, limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"items": out})
}
