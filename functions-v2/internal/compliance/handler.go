// Handler REST — /v1/compliance (driver self-service) y /v1/admin/compliance
// (revisión). Equivalencia v1: submitDriverLicense, submitVehicleDocument,
// getMyDocuments, getComplianceStatus, canOperateVehicle,
// acknowledgeDocumentAlert, listDocumentsForReview, reviewDocument,
// getDocumentHistory.
package compliance

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

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
		apperr.Write(w, apperr.New(400, "invalid body"))
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
		apperr.Write(w, apperr.New(400, "invalid body"))
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
		apperr.Write(w, apperr.New(400, "invalid body"))
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
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	status, err := h.svc.ReviewDocument(r.Context(), ctxUID(r), in)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"documentId": in.DocumentID, "status": status})
}
