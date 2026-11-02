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
  id: string;
  clientId: string;
  driverId?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  price: number;
  status: RideStatus;
  rideType?: string;
  vehicleType?: string;
  paymentMethod?: 'cash' | 'card';
  estimatedPrice?: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number;
  cancelReason?: string;
  canceledBy?: 'client' | 'driver';
  createdAt: number;
  requestedAt?: number;
  acceptedAt?: number;
  startedAt?: number;
  completedAt?: number;
  canceledAt?: number;
}
