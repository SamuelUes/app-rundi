package notifications

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
)

type Handler struct {
	center *Center
}

func NewHandler(center *Center) *Handler {
	return &Handler{center: center}
}

// AdminRoutes — /v1/admin/notifications (RequireRole montado fuera).
func (h *Handler) AdminRoutes(r chi.Router) {
	r.Post("/notifications", h.broadcast)
}

// POST /v1/admin/notifications — sendAdminNotification v1: push a uids.
func (h *Handler) broadcast(w http.ResponseWriter, r *http.Request) {
	if h.center == nil {
		apperr.Write(w, apperr.New(503, "fcm not configured"))
		return
	}
	var body struct {
		UIDs  []string          `json:"uids"`
		Title string            `json:"title"`
		Body  string            `json:"body"`
		Data  map[string]string `json:"data,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
		len(body.UIDs) == 0 || body.Title == "" {
		apperr.Write(w, apperr.New(400, "uids y title requeridos"))
		return
	}
	if len(body.UIDs) > 500 {
		apperr.Write(w, apperr.New(400, "max 500 uids por broadcast"))
		return
	}
	sent, err := h.center.SendToUids(r.Context(), body.UIDs, body.Title, body.Body, body.Data)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"sent": sent, "requested": len(body.UIDs)})
}
