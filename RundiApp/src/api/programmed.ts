/**
 * Programmed rides API — viajes programados (REALTIME_programmed_rides).
 * Cubre createProgrammedRide/assignDriverToProgrammedRide/
 * claimProgrammedRideByCode/confirmProgrammedRide{Client,Driver}/
 * cancelProgrammedRide de v1. El scheduler promueve a rides SQL en la ventana.
 */
import client from './client';

export interface ProgrammedRide {
  id: string;
  clientId: string;
  driverId?: string;
  status: 'scheduled' | 'client_confirmed' | 'canceled' | 'promoted';
  scheduledAt: number;
  clientConfirmed: boolean;
  driverConfirmed: boolean;
  driverInvitationAt?: number;
  shareCode?: string;
  rideId?: string;
  [k: string]: unknown;
}

export async function createProgrammedRide(body: {
  scheduledAt: number;
  origin?: unknown;
  destination?: unknown;
  extraDestinations?: unknown[];
  estimatedDistance?: number;
  estimatedDuration?: number;
  estimatedPrice?: number;
  clientSuggestedPrice?: number;
  rideType?: string;
  vehicleType?: string;
  passengers?: number;
  paymentMethod?: string;
  serviceId?: string;
  serviceAreaId?: string;
  serviceCode?: string;
  notes?: string;
  [k: string]: unknown;
}): Promise<{ id: string; shareCode: string }> {
  const { data } = await client.post<{ id: string; shareCode: string }>('/programmed-rides', body);
  return data;
}

export async function getMyProgrammedRides(opts?: {
  role?: 'client' | 'driver';
  limit?: number;
}): Promise<ProgrammedRide[]> {
  const { data } = await client.get<{ rides: ProgrammedRide[] }>('/programmed-rides/mine', {
    params: opts,
  });
  return data.rides ?? [];
}

export async function assignProgrammedDriver(id: string, driverId: string): Promise<void> {
  await client.post(`/programmed-rides/${id}/assign`, { driverId });
}

export async function removeProgrammedDriver(ride: ProgrammedRide): Promise<void> {
  await client.post(`/programmed-rides/${ride.id}/remove-driver`, {
    driverId: ride.driverId,
    driverConfirmed: !!ride.driverConfirmed,
    invitationAt: typeof ride.driverInvitationAt === 'number' ? ride.driverInvitationAt : 0,
  });
}

export interface ProgrammedDriverCandidate {
  driverId: string;
  name: string;
  rating: number;
}

export async function searchProgrammedDrivers(id: string, q: string): Promise<ProgrammedDriverCandidate[]> {
  const { data } = await client.get<{ candidates: ProgrammedDriverCandidate[] }>(
    `/programmed-rides/${id}/candidates`, { params: { q } },
  );
  return data.candidates ?? [];
}

export async function declineProgrammedRide(id: string, invitationAt?: number): Promise<void> {
  await client.post(`/programmed-rides/${id}/decline`, { invitationAt });
}

export async function claimProgrammedRide(id: string): Promise<void> {
  await client.post(`/programmed-rides/${id}/claim`);
}

export async function confirmProgrammedRide(id: string, as: 'client' | 'driver', invitationAt?: number): Promise<void> {
  await client.post(`/programmed-rides/${id}/confirm`, { as, invitationAt });
}

export async function cancelProgrammedRide(id: string, reason?: string): Promise<void> {
  await client.post(`/programmed-rides/${id}/cancel`, { reason });
}
