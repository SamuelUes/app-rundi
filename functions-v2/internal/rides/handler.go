package rides

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	svc          *Service
	wakeConsumer func(context.Context) error
}

// SetConsumerWakeup installs an optional best-effort outbox wake-up.
func (h *Handler) SetConsumerWakeup(wake func(context.Context) error) {
	h.wakeConsumer = wake
}

func (h *Handler) wakeOutbox(ctx context.Context, rideID string) {
	if h.wakeConsumer == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	if err := h.wakeConsumer(ctx); err != nil {
		slog.Warn("consumer wake-up failed; scheduled sweep will retry", "ride", rideID, "err", err)
	}
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// rideID — {rideId} de ruta puede ser uuid SQL o firebase_ride_id (doc vivo);
// se normaliza a rides.id antes de tocar SQL.
func (h *Handler) rideID(ctx context.Context, r *http.Request) (string, error) {
	return h.svc.ResolveRideID(ctx, chi.URLParam(r, "rideId"))
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.request)
	r.Get("/mine", h.mine)
	r.Get("/earnings", h.earnings)
	r.Get("/diagnostic", h.diagnostic)
	r.Get("/{rideId}", h.detail)
	r.Post("/{rideId}/accept", h.accept)
	r.Post("/{rideId}/cancel", h.cancel)
	r.Post("/{rideId}/negotiate", h.negotiate)
	r.Post("/{rideId}/confirm-driver", h.confirmDriver)
	r.Post("/{rideId}/reject", h.reject)
	r.Post("/{rideId}/locations", h.recordLocations)
	r.Get("/{rideId}/eta", h.eta)
	r.Get("/{rideId}/locations", h.locations)
	r.Post("/{rideId}/proximity-notify", h.proximityNotify)
	r.Post("/{rideId}/complete", h.complete)
	r.Post("/{rideId}/transition", h.transition)
	return r
}

// POST /v1/rides — cliente solicita viaje (antes: callable requestRide).
func (h *Handler) request(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)

	var body RequestRideRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	ride, err := h.svc.RequestRide(r.Context(), uid, reqID, body)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	h.wakeOutbox(r.Context(), ride.ID)
	apperr.JSON(w, http.StatusCreated, RideResponse{Ride: *ride, Event: "ride.requested"})
}

// POST /v1/rides/{rideId}/cancel — participante cancela (client|driver según claim).
func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body CancelRideRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	ride, err := h.svc.CancelRide(r.Context(), rideID, uid, role, body.Reason, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	h.wakeOutbox(r.Context(), ride.ID)
	apperr.JSON(w, http.StatusOK, RideResponse{Ride: *ride, Event: "ride.canceled"})
}

// POST /v1/rides/{rideId}/negotiate — conductor contraoferta precio.
func (h *Handler) negotiate(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body NegotiatePriceRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	ride, err := h.svc.NegotiatePrice(r.Context(), rideID, uid, body.OfferedPrice, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, RideResponse{Ride: *ride, Event: "ride.price_offered"})
}

// POST /v1/rides/{rideId}/complete — conductor completa (fare + comisión + pago en TX).
func (h *Handler) complete(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body CompleteRideRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	ride, err := h.svc.CompleteRide(r.Context(), rideID, uid, body, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, RideResponse{Ride: *ride, Event: "ride.completed"})
}

// POST /v1/rides/{rideId}/accept — driver acepta (antes: callable acceptRide).
func (h *Handler) accept(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body AcceptRideRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	// El conductor solo puede aceptar para sí mismo (auth.uid == driverId).
	if body.DriverID == "" || body.DriverID != uid {
		apperr.Write(w, apperr.ErrForbidden)
		return
	}

	ride, err := h.svc.AcceptRide(r.Context(), rideID, uid, reqID, body.OfferedPrice)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	h.wakeOutbox(r.Context(), ride.ID)
	apperr.JSON(w, http.StatusOK, RideResponse{Ride: *ride, Event: "ride.accepted"})
}

// POST /v1/rides/{rideId}/confirm-driver — cliente confirma conductor con oferta.
func (h *Handler) confirmDriver(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body struct {
		DriverID string `json:"driverId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.DriverID == "" {
		apperr.Write(w, apperr.New(400, "driverId requerido"))
		return
	}
	ride, err := h.svc.ConfirmDriver(r.Context(), rideID, uid, body.DriverID, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	h.wakeOutbox(r.Context(), ride.ID)
	apperr.JSON(w, http.StatusOK, RideResponse{Ride: *ride, Event: "ride.accepted"})
}

// POST /v1/rides/{rideId}/reject — conductor rechaza/retira su oferta.
func (h *Handler) reject(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := h.svc.RejectRide(r.Context(), rideID, uid, body.Reason); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"ok": true, "rideId": rideID})
}

// GET /v1/rides/mine?role=client|driver|follower&status=&limit=
func (h *Handler) mine(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role := r.URL.Query().Get("role")
	status := r.URL.Query().Get("status")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	out, err := h.svc.ListMyRides(r.Context(), uid, role, status, limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"rides": out})
}

// GET /v1/rides/{rideId} — detalle (participante o admin/operator).
func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	out, err := h.svc.GetRideDetail(r.Context(), rideID, uid, role)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"ride": out})
}

// GET /v1/rides/earnings?days=30 — pagos confirmados del conductor (por día).
func (h *Handler) earnings(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))

	out, err := h.svc.DriverEarnings(r.Context(), uid, days)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

type transitionBody struct {
	From RideStatus `json:"from"`
	To   RideStatus `json:"to"`
}

// POST /v1/rides/{rideId}/transition — transiciones de estado validadas.
func (h *Handler) transition(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}

	var body transitionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	ride, err := h.svc.TransitionRide(r.Context(), rideID, uid, body.From, body.To, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, RideResponse{Ride: *ride, Event: "ride.status_changed"})
}

// POST /v1/rides/{rideId}/locations — batch de muestras GPS (tracking).
func (h *Handler) recordLocations(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		Points []LocationPoint `json:"points"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	n, err := h.svc.RecordLocations(r.Context(), rideID, uid, body.Points)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusAccepted, map[string]int{"recorded": n})
}

// GET /v1/rides/diagnostic — conteos propios de viajes (diagnosticRides v1).
func (h *Handler) diagnostic(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	out, err := h.svc.DiagnosticRides(r.Context(), uid)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

// GET /v1/rides/{rideId}/eta?lat=&lng= — getIntelligentETA v1.
func (h *Handler) eta(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	lat, err1 := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err1 != nil || err2 != nil {
		apperr.Write(w, apperr.New(400, "lat/lng requeridos"))
		return
	}
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	out, err := h.svc.IntelligentETA(r.Context(), rideID, uid, lat, lng)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

// AdminRoutes — /v1/admin (RequireRole admin/operator montado fuera).
func (h *Handler) AdminRoutes(r chi.Router) {
	r.Get("/rides/stats", h.stats)
}

// GET /v1/admin/rides/stats — getRideStats v1.
func (h *Handler) stats(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.RideStats(r.Context())
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

// GET /v1/rides/{rideId}/locations — getRideLocations v1.
func (h *Handler) locations(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	out, err := h.svc.ListLocations(r.Context(), rideID, uid, role)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"locations": out})
}

// POST /v1/rides/{rideId}/proximity-notify — notifyProximityRide v1.
func (h *Handler) proximityNotify(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rideID, err := h.rideID(r.Context(), r)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	if err := h.svc.NotifyProximity(r.Context(), rideID, uid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusAccepted, map[string]bool{"ok": true})
}
