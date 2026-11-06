// Handler REST — /v1/compliance (driver self-service) y /v1/admin/compliance
// (revisión). Equivalencia v1: submitDriverLicense, submitVehicleDocument,
// getMyDocuments, getComplianceStatus, canOperateVehicle,
// acknowledgeDocumentAlert, listDocumentsForReview, reviewDocument,
// getDocumentHistory.
package compliance

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	svc          *Service
	store        *DailyStore
	wakeConsumer func(context.Context) error
}

func NewHandler(svc *Service, store *DailyStore) *Handler {
	return &Handler{svc: svc, store: store}
}

// SetConsumerWakeup instala el wake-up best-effort del consumer de outbox
// (opcional; sin él los eventos se procesan en el siguiente tick).
func (h *Handler) SetConsumerWakeup(wake func(context.Context) error) {
	h.wakeConsumer = wake
}

func (h *Handler) wakeOutbox(ctx context.Context) {
	if h.wakeConsumer == nil {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	if err := h.wakeConsumer(ctx); err != nil {
		slog.Warn("consumer wake-up failed; scheduled sweep will retry", "err", err)
	}
}

// Routes — /v1/compliance (conductor sobre sus propios documentos).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/license", h.submitLicense)                         // submitDriverLicense
	r.Post("/vehicle-documents", h.submitVehicleDoc)            // submitVehicleDocument
	r.Get("/documents", h.myDocuments)                          // getMyDocuments
	r.Get("/documents/{table}/{ownerId}/history", h.docHistory) // getDocumentHistory
	r.Get("/status", h.complianceStatus)                        // getComplianceStatus
	r.Post("/can-operate", h.canOperate)                        // canOperateVehicle
	r.Post("/alerts/{id}/acknowledge", h.ackAlert)              // acknowledgeDocumentAlert
	r.Post("/availability", h.activateAvailability)             // activar disponibilidad
	r.Delete("/availability", h.deactivateAvailability)         // desactivar disponibilidad
	return r
}

// AdminRoutes — /v1/admin/compliance (RequireRole montado fuera).
func (h *Handler) AdminRoutes() chi.Router {
	r := chi.NewRouter()
	r.Get("/review-queue", h.reviewQueue) // listDocumentsForReview
	r.Post("/review", h.review)           // reviewDocument
	return r
}

func ctxUID(r *http.Request) string {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	return uid
}
func ctxRole(r *http.Request) string {
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	return role
}

func (h *Handler) submitLicense(w http.ResponseWriter, r *http.Request) {
	var in LicenseInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	id, err := h.svc.SubmitDriverLicense(r.Context(), ctxUID(r), in)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{"documentId": id, "status": "pending"})
}

func (h *Handler) submitVehicleDoc(w http.ResponseWriter, r *http.Request) {
	var in VehicleDocInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	id, err := h.svc.SubmitVehicleDocument(r.Context(), ctxUID(r), in)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{"documentId": id, "status": "pending"})
}

func (h *Handler) myDocuments(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.GetMyDocuments(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

func (h *Handler) docHistory(w http.ResponseWriter, r *http.Request) {
	docs, err := h.svc.GetDocumentHistory(r.Context(), ctxUID(r), ctxRole(r),
		chi.URLParam(r, "table"), chi.URLParam(r, "ownerId"))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"documents": docs})
}

func (h *Handler) complianceStatus(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.GetComplianceStatus(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

func (h *Handler) canOperate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		VehicleID   string `json:"vehicleId"`
		ServiceCode string `json:"serviceCode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid := ctxUID(r)
	dID, _, found, err := h.svc.driverRow(r.Context(), uid)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	if !found {
		apperr.Write(w, apperr.New(404, "Perfil de conductor no encontrado"))
		return
	}
	var ev *Evaluation
	if body.VehicleID == "" {
		ev, err = h.svc.CanDriverOperate(r.Context(), dID, uid)
	} else {
		ev, err = h.svc.CanDriverOperateVehicle(r.Context(), dID, body.VehicleID, body.ServiceCode, uid)
	}
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"evaluation": ev})
}

// activateAvailability — el conductor se pone disponible: evalúa (o reutiliza
// la decisión válida del día) y devuelve la decisión; un rechazo también es
// 200 con sus motivos para que la app los muestre.
func (h *Handler) activateAvailability(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.ActivateAvailability(r.Context(), ctxUID(r), h.store)
	if err != nil {
		switch {
		case errors.Is(err, ErrDriverNotFound):
			apperr.Write(w, apperr.New(404, "Perfil de conductor no encontrado"))
		case errors.Is(err, ErrNoActiveVehicle):
			apperr.Write(w, apperr.New(409, "driver has no active vehicle"))
		default:
			apperr.Write(w, err)
		}
		return
	}
	if res.Allowed {
		h.wakeOutbox(r.Context())
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"activation": res})
}

// deactivateAvailability — cierre explícito (el conductor se pone offline).
func (h *Handler) deactivateAvailability(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeactivateAvailability(r.Context(), ctxUID(r)); err != nil {
		if errors.Is(err, ErrDriverNotFound) {
			apperr.Write(w, apperr.New(404, "Perfil de conductor no encontrado"))
			return
		}
		apperr.Write(w, err)
		return
	}
	h.wakeOutbox(r.Context())
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "offline"})
}

func (h *Handler) ackAlert(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.AcknowledgeAlert(r.Context(), ctxUID(r), chi.URLParam(r, "id")); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------- admin ----------

func (h *Handler) reviewQueue(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var statuses []string
	if s := q.Get("statuses"); s != "" {
		statuses = strings.Split(s, ",")
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	groups, err := h.svc.ListForReview(r.Context(), statuses, limit, offset)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"groups": groups})
}

func (h *Handler) review(w http.ResponseWriter, r *http.Request) {
	var in ReviewInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	status, err := h.svc.ReviewDocument(r.Context(), ctxUID(r), in)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"documentId": in.DocumentID, "status": status})
}
