package users

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
	r.Post("/bootstrap", h.bootstrap)
	r.Patch("/me", h.patchMe)
	r.Post("/me/upgrade-to-driver", h.upgrade)
	r.Post("/me/deactivate", h.deactivate)
	r.Post("/me/delete-data", h.deleteData)
	return r
}

// Availability — handler público montado fuera del grupo Auth: el chequeo de
// email/phone únicos corre ANTES del signup, cuando aún no hay ID token.
// La misma consulta sirve a los callers autenticados.
func (h *Handler) Availability(w http.ResponseWriter, r *http.Request) {
	h.availability(w, r)
}

// AdminRoutes — /v1/admin (RequireRole admin/operator montado fuera).
func (h *Handler) AdminRoutes(r chi.Router) {
	r.Post("/users/{uid}/sync-role", h.syncRole)
}

// POST /v1/users/bootstrap — alta/reingreso tras Firebase Auth sign-in.
func (h *Handler) bootstrap(w http.ResponseWriter, r *http.Request) {
	var body BootstrapRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	if err := h.svc.Bootstrap(r.Context(), uid, body, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// PATCH /v1/users/me — edición de campos permitidos (whitelist de reglas).
func (h *Handler) patchMe(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	if err := h.svc.PatchMe(r.Context(), uid, body, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) availability(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.CheckAvailability(r.Context(),
		r.URL.Query().Get("email"), r.URL.Query().Get("phone"))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

func (h *Handler) upgrade(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	if err := h.svc.UpgradeToDriver(r.Context(), uid, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"role": "driver"})
}

func (h *Handler) deactivate(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	if err := h.svc.DeactivateAccount(r.Context(), uid, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "deactivated"})
}

func (h *Handler) deleteData(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	if err := h.svc.DeleteUserData(r.Context(), uid, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) syncRole(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body"))
		return
	}
	rid, _ := r.Context().Value(middleware.CtxRequestID).(string)
	if err := h.svc.SyncRole(r.Context(), chi.URLParam(r, "uid"), body.Role, rid); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
