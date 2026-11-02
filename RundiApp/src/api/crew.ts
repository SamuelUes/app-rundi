/**
 * API v2 — crew de conductor designado (internal/crew del backend Go).
 * Capitán = rides.driver_id; seguidor = follower_driver_id. Solo backend
 * escribe los docs REALTIME_driver_crews, crew_membership y crew_invites.
 */

import client from './client';

/** Capitán invita a un seguidor elegible (verified + active). */
export async function inviteFollower(followerId: string): Promise<void> {
  await client.post('/crew/invite', { followerId });
}

/** Seguidor acepta la invitación pendiente → crea crew + membresías. */
export async function acceptCrewInvite(): Promise<void> {
  await client.post('/crew/accept');
}

/** Cualquiera de los miembros abandona el crew. */
export async function leaveCrew(): Promise<void> {
  await client.post('/crew/leave');
}

/** Capitán adjunta su seguidor al viaje (follower_status='active' en SQL). */
export async function attachFollowerToRide(rideId: string): Promise<void> {
  await client.post('/crew/attach', { rideId });
}

/** Libera al seguidor: 'completed' | 'canceled' | 'abandoned'. */
export async function releaseFollowerFromRide(
  rideId: string,
  reason: 'completed' | 'canceled' | 'abandoned' = 'completed',
): Promise<void> {
  await client.post('/crew/release', { rideId, reason });
}
