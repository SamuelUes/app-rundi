package payments

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"

	"cloud.google.com/go/firestore"
	"github.com/go-chi/chi/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	svc *Service
	fs  *firestore.Client
}

func NewHandler(svc *Service, fsClient *firestore.Client) *Handler {
	return &Handler{svc: svc, fs: fsClient}
}

// writeCashCode — publica el código en REALTIME_payments_live/{rideId}
// (proyección backend; el cliente lo lee del doc vivo).
func (h *Handler) writeCashCode(ctx context.Context, rideID string) func(map[string]any) error {
	return func(fields map[string]any) error {
		_, err := h.fs.Collection(fs.ColPaymentsLive).Doc(rideID).
			Set(ctx, fields, firestore.MergeAll)
		return err
	}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/confirm-cash", h.confirmCash)
	r.Post("/register-cash", h.registerCash)
	r.Post("/generate-cash-code", h.generateCashCode)
	r.Post("/cancel-cash", h.cancelCash)
	r.Post("/change-method", h.changeMethod)
	r.Get("/pending", h.pending)
	r.Get("/ride/{rideId}", h.byRide)
	return r
}

// POST /v1/payments/confirm-cash — driver confirma efectivo del viaje.
func (h *Handler) confirmCash(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)

	var body ConfirmCashRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "invalid body: rideId required"))
		return
	}
	p, err := h.svc.ConfirmCash(r.Context(), body.RideID, uid, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"payment": p, "event": "payment.confirmed"})
}

// POST /v1/payments/register-cash — participante declara efectivo + tip.
func (h *Handler) registerCash(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	var body struct {
		RideID string  `json:"rideId"`
		Tip    float64 `json:"tip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "rideId required"))
		return
	}
	p, err := h.svc.RegisterCash(r.Context(), body.RideID, uid, body.Tip, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"payment": p, "event": "payment.registered"})
}

// POST /v1/payments/generate-cash-code — driver genera código de 4 dígitos.
func (h *Handler) generateCashCode(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	var body struct {
		RideID string `json:"rideId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "rideId required"))
		return
	}
	code := fmt.Sprintf("%04d", rand.Intn(10000))
	code, err := h.svc.GenerateCashCode(r.Context(), body.RideID, uid, code,
		h.writeCashCode(r.Context(), body.RideID))
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"code": code})
}

// POST /v1/payments/cancel-cash — participante cancela pago pendiente.
func (h *Handler) cancelCash(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	var body struct {
		RideID string `json:"rideId"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "rideId required"))
		return
	}
	p, err := h.svc.CancelCash(r.Context(), body.RideID, uid, body.Reason, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"payment": p, "event": "payment.canceled"})
}

// GET /v1/payments/pending — deudas del cliente (getPendingPayments v1).
func (h *Handler) pending(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	out, total, err := h.svc.ListPending(r.Context(), uid)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"payments": out, "totalDebt": total})
}

// POST /webhooks/puntoexpress — webhook público (token en header; no Firebase auth).
func (h *Handler) PuntoExpressWebhook(expectedToken string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provided := r.Header.Get("x-puntoexpress-token")
		if provided == "" {
			provided = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		}
		if expectedToken == "" || provided != expectedToken {
			apperr.Write(w, apperr.New(401, "invalid-webhook-token"))
			return
		}
		var body struct {
			DriverID              string  `json:"driverId"`
			UserID                string  `json:"userId"`
			Amount                float64 `json:"amount"`
			Reference             string  `json:"reference"`
			ExternalReference     string  `json:"externalReference"`
			TransactionID         string  `json:"transactionId"`
			ExternalTransactionID string  `json:"externalTransactionId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			apperr.Write(w, apperr.New(400, "invalid body"))
			return
		}
		driverID := body.DriverID
		if driverID == "" {
			driverID = body.UserID
		}
		ref := body.Reference
		if ref == "" {
			ref = body.ExternalReference
		}
		txn := body.TransactionID
		if txn == "" {
			txn = body.ExternalTransactionID
		}
		raw, _ := json.Marshal(body)
		already, err := h.svc.PuntoExpressWebhook(r.Context(), driverID, body.Amount, ref, txn, raw)
		if err != nil {
			apperr.Write(w, err)
			return
		}
		apperr.JSON(w, http.StatusOK, map[string]any{
			"success": true, "alreadyProcessed": already, "driverId": driverID,
		})
	}
}

// POST /v1/payments/change-method — cliente cambia método sobre pago pendiente.
func (h *Handler) changeMethod(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	reqID, _ := r.Context().Value(middleware.CtxRequestID).(string)
	var body struct {
		RideID string `json:"rideId"`
		Method string `json:"paymentMethod"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RideID == "" {
		apperr.Write(w, apperr.New(400, "rideId required"))
		return
	}
	p, err := h.svc.ChangePaymentMethod(r.Context(), body.RideID, uid, body.Method, reqID)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"payment": p})
}

// GET /v1/payments/ride/{rideId} — getPaymentDetails v1.
func (h *Handler) byRide(w http.ResponseWriter, r *http.Request) {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	role, _ := r.Context().Value(middleware.CtxRole).(string)
	p, err := h.svc.GetByRide(r.Context(), chi.URLParam(r, "rideId"), uid, role)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]any{"payment": p})
}
