/**
 * Tipos v2 — contratos del slice rides (functions-v2/internal/rides).
 * Espejo de public.ride_status y de las respuestas del API Go.
 */

export type RideStatus =
  | 'requested'
  | 'driver_offered'
  | 'accepted'
  | 'driver_on_route'
  | 'driver_arrived'
  | 'in_progress'
  | 'pending_payment'
  | 'rating_completed'
  | 'rating_skipped'
  | 'completed'
  | 'canceled';

export interface Ride {
  id: string;                    // UUID Postgres (interno)
  firebaseRideId?: string;       // doc vivo REALTIME_trips_live/{id}
  clientId: string;              // Firebase UID
  driverId?: string;             // Firebase UID
  status: RideStatus;
  version: number;               // optimistic concurrency
  estimatedPrice?: number;
  finalFare?: number;
  requestedAt: string;
  acceptedAt?: string;
}

export interface AcceptRideRequest {
  driverId: string;
  offeredPrice?: number;
}

export interface RequestRideRequest {
  rideType: 'normal' | 'designated_driver';
  vehicleType: 'auto' | 'moto' | 'designated_driver';
  estimatedDistance?: number;
  estimatedDuration?: number;
  estimatedPrice?: number;
  clientSuggestedPrice?: number;
  passengers?: number;
  notes?: string;
  paymentType: 'cash' | 'card_local';
  serviceId?: string;
  originLocationId?: string;
  destinationLocationId?: string;
  clientVehiclePhoto?: string;      // objectPath Storage
  firebaseRideId?: string;          // doc vivo REALTIME_trips_live/{id}
  // Contexto de matching (no se persiste en SQL; viaja en outbox → dispatch)
  originLat?: number;
  originLng?: number;
  serviceAreaId?: string;
  serviceCode?: string;
}

export interface CancelRideRequest {
  reason?: string;
}

export interface NegotiatePriceRequest {
  offeredPrice: number;
}

export interface CompleteRideRequest {
  finalFare: number;
  actualDistance?: number;
  actualDuration?: number;
  tip?: number;
}

export interface TransitionRideRequest {
  from: RideStatus;
  to: RideStatus;
}

export type RideEvent =
  | 'ride.requested'
  | 'ride.accepted'
  | 'ride.canceled'
  | 'ride.price_offered'
  | 'ride.completed'
  | 'ride.status_changed';

export interface RideResponse {
  ride: Ride;
  event: RideEvent;
}

// --- Payments (internal/payments) ---

export interface Payment {
  id: string;
  rideId: string;
  amount: number;
  tip: number;
  commission: number;
  commissionRateApplied?: number;
  total: number;
  paymentMethod: 'cash' | 'card';
  paymentProvider: 'cash' | 'local';
  status: string;
  commissionStatus: 'pending' | 'paid';
  paidAt?: string;
}
