package chats

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

// Routes — /v1/chats.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/", h.create)
	return r
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RideID string `json:"rideId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "rideId requerido"))
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	chatID, err := h.svc.RideChat(r.Context(), uid, body.RideID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"chatId": chatID})
}
