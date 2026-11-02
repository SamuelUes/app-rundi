// Package rides — dominio de viajes (comandos SQL-authoritative).
// Derivado de functions/src/api/rides_sequelize.ts; contratos nuevos REST.
package rides

import "time"

// RideStatus — espejo de public.ride_status (0001_enums.sql).
type RideStatus string

const (
	StatusRequested      RideStatus = "requested"
	StatusDriverOffered  RideStatus = "driver_offered"
	StatusAccepted       RideStatus = "accepted"
	StatusDriverOnRoute  RideStatus = "driver_on_route"
	StatusDriverArrived  RideStatus = "driver_arrived"
	StatusInProgress     RideStatus = "in_progress"
	StatusPendingPayment RideStatus = "pending_payment"
	StatusRatingDone     RideStatus = "rating_completed"
	StatusRatingSkipped  RideStatus = "rating_skipped"
	StatusCompleted      RideStatus = "completed"
	StatusCanceled       RideStatus = "canceled"
)

// transitions — máquina de estados válida (fuente: rides_sequelize.ts + CHECK).
var transitions = map[RideStatus][]RideStatus{
	StatusRequested:      {StatusDriverOffered, StatusAccepted, StatusCanceled},
	StatusDriverOffered:  {StatusAccepted, StatusCanceled},
	StatusAccepted:       {StatusDriverOnRoute, StatusCanceled},
	StatusDriverOnRoute:  {StatusDriverArrived, StatusCanceled},
	StatusDriverArrived:  {StatusInProgress, StatusCanceled},
	StatusInProgress:     {StatusPendingPayment, StatusCompleted},
	StatusPendingPayment: {StatusCompleted, StatusRatingDone, StatusRatingSkipped},
	StatusRatingDone:     {},
	StatusRatingSkipped:  {},
	StatusCompleted:      {},
	StatusCanceled:       {},
}

func CanTransition(from, to RideStatus) bool {
	for _, s := range transitions[from] {
		if s == to {
			return true
		}
	}
	return false
}

type Ride struct {
	ID             string     `json:"id"`
	FirebaseRideID *string    `json:"firebaseRideId,omitempty"`
	ClientID       string     `json:"clientId"`
	DriverID       *string    `json:"driverId,omitempty"`
	Status         RideStatus `json:"status"`
	Version        int        `json:"version"`
	EstimatedPrice *float64   `json:"estimatedPrice,omitempty"`
	FinalFare      *float64   `json:"finalFare,omitempty"`
	RequestedAt    time.Time  `json:"requestedAt"`
	AcceptedAt     *time.Time `json:"acceptedAt,omitempty"`
}

type AcceptRideRequest struct {
	DriverID string `json:"driverId"`
	// OfferedPrice — si el conductor acepta con precio distinto (negociación)
	OfferedPrice *float64 `json:"offeredPrice,omitempty"`
}

// RequestRideRequest — creación de viaje por el cliente (antes: callable requestRide).
// Solo campos presentes en public.rides; origin/destination por location IDs (modelo v1).
type RequestRideRequest struct {
	RideType              string   `json:"rideType"`    // 'normal' | 'designated_driver'
	VehicleType           string   `json:"vehicleType"` // 'auto' | 'moto' | 'designated_driver'
	EstimatedDistance     *int     `json:"estimatedDistance,omitempty"`
	EstimatedDuration     *int     `json:"estimatedDuration,omitempty"`
	EstimatedPrice        *float64 `json:"estimatedPrice,omitempty"`
	ClientSuggestedPrice  *float64 `json:"clientSuggestedPrice,omitempty"`
	Passengers            *int     `json:"passengers,omitempty"`
	Notes                 string   `json:"notes,omitempty"`
	PaymentType           string   `json:"paymentType"` // 'cash' | 'card_local'
	ServiceID             *string  `json:"serviceId,omitempty"`
	OriginLocationID      *string  `json:"originLocationId,omitempty"`
	DestinationLocationID *string  `json:"destinationLocationId,omitempty"`
	ClientVehiclePhoto    string   `json:"clientVehiclePhoto,omitempty"` // objectPath Storage
	FirebaseRideID        *string  `json:"firebaseRideId,omitempty"`     // puente al doc vivo
	// Contexto operativo para matching/dispatch. serviceAreaId también se
	// persiste en rides (matching/reconciliación); el resto viaja en el
	// outbox payload → trips_live + driver_offers.
	OriginLat     *float64 `json:"originLat,omitempty"`
	OriginLng     *float64 `json:"originLng,omitempty"`
	ServiceAreaID string   `json:"serviceAreaId,omitempty"`
	ServiceCode   string   `json:"serviceCode,omitempty"`
	// Ruta contratada — persiste en ride_locations (origin order 0, waypoints,
	// destination) y puebla origin_location_id/destination_location_id. Sin
	// destination no hay ETA ni historial de ruta.
	Origin            *RideLocationInput  `json:"origin,omitempty"`
	Destination       *RideLocationInput  `json:"destination,omitempty"`
	ExtraDestinations []RideLocationInput `json:"extraDestinations,omitempty"`
	// Features de pricing seleccionadas — persisten en pricing_snapshot.featureCodes
	// (gate de elegibilidad en queries.go). designatedDriverVehicle en 'auto'|'moto'.
	SelectedFeatureCodes    []string `json:"selectedFeatureCodes,omitempty"`
	DesignatedDriverVehicle *string  `json:"designatedDriverVehicle,omitempty"`
}

// RideLocationInput — punto de ruta enviado por el cliente (lat/lng + address
// opcional). Se persiste en ride_locations (origin/waypoint/destination).
type RideLocationInput struct {
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Address string  `json:"address,omitempty"`
}

type CancelRideRequest struct {
	Reason string `json:"reason"`
}

type NegotiatePriceRequest struct {
	OfferedPrice float64 `json:"offeredPrice"`
}

type CompleteRideRequest struct {
	FinalFare      float64 `json:"finalFare"`
	ActualDistance *int    `json:"actualDistance,omitempty"`
	ActualDuration *int    `json:"actualDuration,omitempty"`
	Tip            float64 `json:"tip,omitempty"`
}

type RideResponse struct {
	Ride  Ride   `json:"ride"`
	Event string `json:"event"`
}
