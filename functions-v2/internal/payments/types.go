// Package payments — obligaciones de pago y confirmación (SQL-authoritative).
package payments

import "time"

type Payment struct {
	ID                    string     `json:"id"`
	RideID                string     `json:"rideId"`
	ClientID              string     `json:"clientId,omitempty"`
	DriverID              string     `json:"driverId,omitempty"`
	Amount                float64    `json:"amount"`
	Tip                   float64    `json:"tip"`
	Commission            float64    `json:"commission"`
	CommissionRateApplied *float64   `json:"commissionRateApplied,omitempty"`
	Total                 float64    `json:"total"`
	PaymentMethod         string     `json:"paymentMethod"`   // 'cash' | 'card'
	PaymentProvider       string     `json:"paymentProvider"` // 'cash' | 'local'
	Status                string     `json:"status"`          // payment_status enum
	CommissionStatus      string     `json:"commissionStatus"`
	PaidAt                *time.Time `json:"paidAt,omitempty"`
}

type ConfirmCashRequest struct {
	RideID string `json:"rideId"`
	Code   string `json:"code,omitempty"`
}

// CashAuth — evidencia de autenticación del cobro reportada por quien declara
// el pago (paridad con los flags que confirmCashPayment v1 persistía en
// paymentStatus y luego se archivaban a payments).
type CashAuth struct {
	Method                 string `json:"authenticationMethod,omitempty"` // 'biometric'|'sms'|'manual'|'code'
	BiometricType          string `json:"biometricType,omitempty"`
	BiometricAuthenticated bool   `json:"biometricAuthenticated,omitempty"`
}

// authMethodPtr — valida contra public.payment_auth_method; un valor inválido
// se ignora (la evidencia de auth es auxiliar, no debe romper el cobro).
func (a CashAuth) authMethodPtr() *string {
	switch a.Method {
	case "biometric", "sms", "manual", "code":
		return &a.Method
	}
	return nil
}

// bioType — acota el tipo reportado al enum public.biometric_type (misma
// política que rides.NormalizeBiometricType; se duplica porque importar rides
// aquí cerraría un ciclo payments→rides→projections→payments en tests).
func (a CashAuth) bioType() string {
	switch a.BiometricType {
	case "fingerprint", "face_id", "biometric", "device_credential", "NOT_SUPPORTED":
		return a.BiometricType
	case "device_biometric_not_found":
		return "NOT_SUPPORTED"
	case "":
		return ""
	default:
		return "biometric"
	}
}
