/**
 * API v2 — rides. Endpoints del handler Go (internal/rides/handler.go).
 * Reemplaza gradualmente a los callables requestRide/acceptRide/
 * updateRideStatus/cancelRide/completeRide de v1.
 */

import client from './client';
import type {
  AcceptRideRequest,
  CancelRideRequest,
  CompleteRideRequest,
  NegotiatePriceRequest,
  RequestRideRequest,
  RideResponse,
  TransitionRideRequest,
} from '../types/rideApi';

/** Cliente solicita viaje → 201 ride.requested. */
export async function requestRide(body: RequestRideRequest): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>('/rides', body);
  return data;
}

/** Driver acepta un viaje; 409 si otro conductor ganó o no está 'requested'. */
export async function acceptRide(
  rideId: string,
  body: AcceptRideRequest,
): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>(`/rides/${rideId}/accept`, body);
  return data;
}

/** Participante cancela (canceled_by deriva del claim del actor). */
export async function cancelRide(
  rideId: string,
  body: CancelRideRequest,
): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>(`/rides/${rideId}/cancel`, body);
  return data;
}

/** Negociación por rol del caller: cliente ajusta precio sugerido, driver contraoferta. */
export async function negotiateRidePrice(
  rideId: string,
  body: NegotiatePriceRequest,
): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>(`/rides/${rideId}/negotiate`, body);
  return data;
}

/** Driver completa: fare final + comisión snapshot + obligación de pago en TX. */
export async function completeRide(
  rideId: string,
  body: CompleteRideRequest,
): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>(`/rides/${rideId}/complete`, body);
  return data;
}

/** Transición de estado validada por la máquina del backend (409 inválida). */
export async function transitionRide(
  rideId: string,
  body: TransitionRideRequest,
): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>(`/rides/${rideId}/transition`, body);
  return data;
}

/** Cliente confirma un conductor entre los que tienen oferta (confirmDriver v1). */
export async function confirmDriver(
  rideId: string,
  driverId: string,
): Promise<RideResponse> {
  const { data } = await client.post<RideResponse>(`/rides/${rideId}/confirm-driver`, { driverId });
  return data;
}

/** Driver rechaza/retira su oferta (rejectRide v1; registro en el doc de oferta). */
export async function rejectRide(rideId: string, reason?: string): Promise<void> {
  await client.post(`/rides/${rideId}/reject`, { reason: reason ?? 'not_interested' });
}

export interface RideSummary {
  id: string;
  firebaseRideId?: string;
  clientId: string;
  driverId?: string;
  followerDriverId?: string;
  status: string;
  rideType?: string;
  vehicleType?: string;
  paymentType?: string;
  estimatedPrice?: number;
  finalFare?: number;
  requestedAt: string;
  completedAt?: string;
}

/** Historial del actor; role=client|driver|follower (default client). */
export async function getMyRides(opts?: {
  role?: 'client' | 'driver' | 'follower';
  status?: string;
  limit?: number;
}): Promise<RideSummary[]> {
  const { data } = await client.get<{ rides: RideSummary[] }>('/rides/mine', {
    params: { role: opts?.role ?? 'client', status: opts?.status, limit: opts?.limit },
  });
  return data.rides ?? [];
}

/** Detalle del viaje (participante o admin/operator). */
export async function getRideDetail(rideId: string): Promise<RideSummary> {
  const { data } = await client.get<{ ride: RideSummary }>(`/rides/${rideId}`);
  return data.ride;
}

export interface EarningsSummary {
  driverId: string;
  total: number;
  totalRides: number;
  commission: number;
  net: number;
  byDay: { date: string; amount: number; rides: number }[];
}

/** Ganancias del conductor: pagos confirmados agregados por día (getDriverEarnings v1). */
export async function getDriverEarnings(days = 30): Promise<EarningsSummary> {
  const { data } = await client.get<EarningsSummary>('/rides/earnings', { params: { days } });
  return data;
}

export interface LocationPoint {
  lat: number;
  lng: number;
  at?: number;
}

/** POST /v1/rides/{id}/locations — batch de muestras GPS (tracking). */
export async function recordRideLocations(rideId: string, points: LocationPoint[]): Promise<number> {
  const { data } = await client.post<{ recorded: number }>(
    `/rides/${rideId}/locations`,
    { points },
  );
  return data.recorded;
}

/** GET /v1/rides/{id}/eta — getIntelligentETA v1 (Haversine, 40 km/h). */
export async function getIntelligentETA(
  rideId: string,
  lat: number,
  lng: number,
): Promise<{ etaMinutes: number; etaTimestamp: string; distanceRemaining: number }> {
  const { data } = await client.get<{
    etaMinutes: number;
    etaTimestamp: string;
    distanceRemaining: number;
  }>(`/rides/${rideId}/eta`, { params: { lat, lng } });
  return data;
}

/** GET /v1/rides/diagnostic — conteos propios (diagnosticRides v1). */
export async function diagnosticRides(): Promise<{
  asClient: number;
  asDriver: number;
  asFollower: number;
  totalRides: number;
}> {
  const { data } = await client.get<{
    asClient: number;
    asDriver: number;
    asFollower: number;
    totalRides: number;
  }>('/rides/diagnostic');
  return data;
}

export interface RideLocation {
  id: string;
  type: string;
  order: number;
  lat: number;
  lng: number;
  address: string;
  createdAt: string;
}

/** GET /v1/rides/{id}/locations — getRideLocations v1 (ruta + tracking). */
export async function getRideLocations(rideId: string): Promise<RideLocation[]> {
  const { data } = await client.get<{ locations: RideLocation[] }>(
    `/rides/${rideId}/locations`,
  );
  return data.locations;
}

/** POST /v1/rides/{id}/proximity-notify — notifyProximityRide v1. */
export async function notifyProximityRide(rideId: string): Promise<void> {
  await client.post(`/rides/${rideId}/proximity-notify`);
}
