// Package payments — obligaciones de pago y confirmación (SQL-authoritative).
package payments

import "time"

type Payment struct {
	ID                    string     `json:"id"`
	RideID                string     `json:"rideId"`
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
}
