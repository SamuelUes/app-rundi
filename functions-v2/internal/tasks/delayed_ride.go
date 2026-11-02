package tasks

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
)

// DelayedRideStatusPayload — reemplaza handleDelayedRideStatus de v1:
// re-verifica que el viaje siga en un estado esperado tras un delay
// (p.ej. oferta sin responder → expirar).
type DelayedRideStatusPayload struct {
	RideID         string `json:"rideId"`
	ExpectedStatus string `json:"expectedStatus"`
}

// DelayedRideStatusHandler procesa tasks diferidas de estado de viaje.
// Idempotente: si el estado ya cambió, no-op 200.
type DelayedRideStatusHandler struct {
	pool *pgxpool.Pool
}

func NewDelayedRideStatusHandler(pool *pgxpool.Pool) *DelayedRideStatusHandler {
	return &DelayedRideStatusHandler{pool: pool}
}

// POST /tasks/delayed-ride-status — solo llamable por Cloud Tasks (OIDC verificado
// por middleware/tasks auth en cmd/api; X-CloudTasks-TaskName como sanity check).
func (h *DelayedRideStatusHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("X-CloudTasks-TaskName") == "" {
		apperr.Write(w, apperr.New(403, "not a cloud task"))
		return
	}
	var p DelayedRideStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil || p.RideID == "" {
		apperr.Write(w, apperr.New(400, "invalid payload"))
		return
	}

	var current string
	err := h.pool.QueryRow(r.Context(),
		`SELECT status FROM public.rides WHERE id = $1`, p.RideID).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		apperr.Write(w, apperr.ErrNotFound)
		return
	}
	if err != nil {
		apperr.Write(w, err)
		return
	}

	// La acción correctiva concreta (expirar oferta, re-matching) la decide el
	// comando de negocio correspondiente; aquí solo reportamos si sigue esperando.
	stillExpected := current == p.ExpectedStatus
	slog.InfoContext(r.Context(), "tasks.delayed_ride_status",
		"rideId", p.RideID, "expected", p.ExpectedStatus,
		"current", current, "stillExpected", stillExpected)
	apperr.JSON(w, http.StatusOK, map[string]any{
		"rideId": p.RideID, "expected": p.ExpectedStatus,
		"current": current, "stillExpected": stillExpected,
	})
}
