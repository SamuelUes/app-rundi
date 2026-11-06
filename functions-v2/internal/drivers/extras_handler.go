package drivers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
)

func (h *Handler) switchVehicle(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.SwitchVehicle(r.Context(), ctxUID(r), chi.URLParam(r, "id")); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) deleteVehicle(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.DeleteVehicle(r.Context(), ctxUID(r), chi.URLParam(r, "id")); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) requestDesignatedAccess(w http.ResponseWriter, r *http.Request) {
	st, err := h.svc.RequestDesignatedAccess(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": st})
}

func (h *Handler) designatedAccessStatus(w http.ResponseWriter, r *http.Request) {
	st, err := h.svc.DesignatedAccessStatus(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": st})
}

func (h *Handler) myStats(w http.ResponseWriter, r *http.Request) {
	st, err := h.svc.Stats(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, st)
}

func (h *Handler) myFeatures(w http.ResponseWriter, r *http.Request) {
	codes, err := h.svc.MyFeatureCapabilities(r.Context(), ctxUID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"features": codes})
}

func (h *Handler) setSeniorFeature(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Enabled == nil {
		apperr.Write(w, apperr.New(400, "enabled must be a boolean"))
		return
	}
	if err := h.svc.SetSeniorFeature(r.Context(), ctxUID(r), *body.Enabled, ctxRID(r)); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) myRecharges(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	sum, err := h.svc.RechargeSummary(r.Context(), ctxUID(r), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, sum)
}

func (h *Handler) crewCandidates(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.SearchCrewCandidates(r.Context(), ctxUID(r), r.URL.Query().Get("q"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"candidates": out})
}

func (h *Handler) listDrivers(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	out, err := h.svc.ListForAdmin(r.Context(), r.URL.Query().Get("status"), limit, offset)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"drivers": out})
}

func (h *Handler) grantDriverFeature(w http.ResponseWriter, r *http.Request) {
	h.grantFeature(w, r, "driver")
}

func (h *Handler) grantVehicleFeature(w http.ResponseWriter, r *http.Request) {
	h.grantFeature(w, r, "vehicle")
}

func (h *Handler) grantFeature(w http.ResponseWriter, r *http.Request, entityType string) {
	err := h.svc.GrantFeature(r.Context(), ctxUID(r), entityType,
		chi.URLParam(r, "id"), chi.URLParam(r, "code"), ctxRID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) revokeDriverFeature(w http.ResponseWriter, r *http.Request) {
	h.revokeFeature(w, r, "driver")
}

func (h *Handler) revokeVehicleFeature(w http.ResponseWriter, r *http.Request) {
	h.revokeFeature(w, r, "vehicle")
}

func (h *Handler) revokeFeature(w http.ResponseWriter, r *http.Request, entityType string) {
	if err := h.svc.RevokeFeature(r.Context(), entityType,
		chi.URLParam(r, "id"), chi.URLParam(r, "code")); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// POST /v1/drivers/me/recharges — createDriverRechargeManual v1: el conductor
// declara una recarga que queda pending hasta validación de operaciones.
func (h *Handler) requestRecharge(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Amount                float64 `json:"amount"`
		Reference             string  `json:"reference,omitempty"`
		ExternalTransactionID string  `json:"externalTransactionId,omitempty"`
		Method                string  `json:"method,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	e, balance, already, err := h.svc.RequestRecharge(r.Context(), ctxUID(r),
		body.Amount, body.Reference, body.ExternalTransactionID, body.Method, ctxRID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{
		"recharge":         e,
		"pending":          e.Status == "pending",
		"status":           e.Status,
		"availableBalance": balance,
		"alreadyProcessed": already,
	})
}

// POST /v1/admin/recharges/{id}/confirm — confirm_driver_recharge v1:
// acredita una recarga pending (reescribe balances + actualiza drivers).
func (h *Handler) confirmRecharge(w http.ResponseWriter, r *http.Request) {
	e, err := h.svc.ConfirmRecharge(r.Context(), chi.URLParam(r, "id"), ctxRID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"recharge": e})
}

// GET /v1/admin/recharges?status=pending&limit= — solicitudes del panel CMS.
func (h *Handler) listRecharges(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListRecharges(r.Context(), r.URL.Query().Get("status"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"recharges": out})
}

func (h *Handler) createRecharge(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Amount    float64 `json:"amount"`
		Reference string  `json:"reference,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	e, err := h.svc.CreateRecharge(r.Context(), chi.URLParam(r, "id"),
		body.Amount, body.Reference, ctxRID(r))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusCreated, map[string]any{"recharge": e})
}

// GET /v1/drivers?minRating=&department=&limit= — getDriversByRating/
// getDriversByDepartment v1 (cualquier autenticado).
func (h *Handler) listPublic(w http.ResponseWriter, r *http.Request) {
	minRating, _ := strconv.ParseFloat(r.URL.Query().Get("minRating"), 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	out, err := h.svc.ListDrivers(r.Context(), minRating,
		r.URL.Query().Get("department"), limit)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"drivers": out})
}

// GET /v1/drivers/me/vehicles/{id} — getVehicleById v1.
func (h *Handler) getVehicle(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.GetVehicle(r.Context(), ctxUID(r), chi.URLParam(r, "id"))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}
