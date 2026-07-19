import { getDatabase, ref, get } from 'firebase/database';

export interface RidePreview {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  estimatedPrice: number;
  estimatedDistance?: number;
  estimatedDuration?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  paymentMethod?: 'cash' | 'card';
  negotiationStatus?: string;
}

/** Normaliza null a undefined para compatibilidad con tipos opcionales */
const unwrap = <T>(value: T | null | undefined): T | undefined =>
  value === null ? undefined : value;

export async function fetchRidePreview(rideId: string): Promise<RidePreview | null> {
  const db = getDatabase();
  const rideRef = ref(db, `activeRides/${rideId}`);
  const snapshot = await get(rideRef);

  if (!snapshot.exists()) {
    return null;
  }

  const rideData = snapshot.val();

  return {
    id: rideId,
    clientId: rideData.clientId || '',
    clientName: unwrap(rideData.clientName),
    clientPhone: unwrap(rideData.clientPhone),
    origin: rideData.origin || { lat: 0, lng: 0 },
    destination: rideData.destination || { lat: 0, lng: 0 },
    extraDestinations: rideData.extraDestinations || [],
    estimatedPrice: rideData.estimatedPrice || 0,
    estimatedDistance: unwrap(rideData.estimatedDistance),
    estimatedDuration: unwrap(rideData.estimatedDuration),
    clientSuggestedPrice: unwrap(rideData.clientSuggestedPrice),
    driverOfferedPrice: unwrap(rideData.driverOfferedPrice),
    paymentMethod: (rideData.paymentMethod === 'card' ? 'card' : 'cash') as 'cash' | 'card',
    negotiationStatus: unwrap(rideData.negotiationStatus),
  };
}
