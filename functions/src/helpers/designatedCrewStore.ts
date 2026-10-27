import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { supabaseGet } from '../supabase/client';
import { RideRepository } from '../sequelize/repositories/RideRepository';
import { notifyUserSafe } from '../services/notifyUserSafe';
import { transactionOnPath } from './rtdbTransaction';
import type { CrewMemberSnapshot, CrewRole, FollowerRideStatus } from './designatedCrew';

export interface CrewMembership {
  role: CrewRole;
  captainId: string;
  partnerId: string;
  currentRideId?: string | null;
  updatedAt?: number;
}

export interface DriverEligibility {
  isEligible: boolean;
  licenseNumber: string;
  averageRating: number;
}

const db = () => admin.database();
const rideRepo = new RideRepository();
const SERVER_TS = admin.database.ServerValue.TIMESTAMP;

export async function getCrewMembership(uid: string): Promise<CrewMembership | null> {
  if (!uid) return null;
  const snap = await db().ref(`driverCrewMembership/${uid}`).once('value');
  return (snap.val() as CrewMembership | null) ?? null;
}

export async function assertNotCrewFollower(uid: string): Promise<void> {
  const membership = await getCrewMembership(uid);
  if (membership?.role === 'follower') {
    throw new functions.https.HttpsError('failed-precondition', 'CREW_FOLLOWER_CANNOT_ACCEPT');
  }
}

export async function getDriverEligibility(uid: string): Promise<DriverEligibility> {
  const rows = await supabaseGet(
    'drivers',
    { user_id: uid },
    'license_number,average_rating,designated_rol_requested,account_status',
    { requireServiceRole: true, limit: 1 },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    isEligible: row?.designated_rol_requested === 'verified' && row?.account_status === 'active',
    licenseNumber: String(row?.license_number || ''),
    averageRating: Number(row?.average_rating || 0),
  };
}

export async function getDriverLocationStatus(uid: string): Promise<string | null> {
  const snap = await db().ref(`driverLocations/${uid}/status`).once('value');
  const value = snap.val();
  return typeof value === 'string' ? value.toLowerCase() : null;
}

export async function buildMemberSnapshot(
  uid: string,
  fallback?: Partial<Pick<CrewMemberSnapshot, 'licenseNumber' | 'rating'>>,
): Promise<CrewMemberSnapshot> {
  const infoSnap = await db().ref(`driversInfo/${uid}`).once('value');
  const info = infoSnap.val() || {};
  let licenseNumber = fallback?.licenseNumber ?? '';
  let rating = fallback?.rating ?? Number(info.rating || 0);
  if (!licenseNumber) {
    const eligibility = await getDriverEligibility(uid);
    licenseNumber = eligibility.licenseNumber;
    rating = rating || eligibility.averageRating;
  }
  return {
    driverId: uid,
    name: String(info.name || info.fullName || 'Conductor'),
    rating: Number(rating || 0),
    licenseNumber,
    photoURL: info.photoURL || info.profilePhoto || null,
  };
}

const safeSupabaseRideUpdate = async (rideId: string, data: Record<string, any>) => {
  try {
    await rideRepo.update(rideId, data);
  } catch (error: any) {
    console.warn(`⚠️ [crew] No se pudo actualizar rides/${rideId} en Supabase:`, error?.message || error);
  }
};

/**
 * Adjunta el seguidor del capitán (driverId) al viaje. Marca crewAttachCheckedAt
 * siempre, para no releer el equipo en cada write del nodo (GPS).
 */
export async function attachFollowerToRide(rideId: string, ride: any): Promise<boolean> {
  const captainId = String(ride?.driverId || '');
  await db().ref(`activeRides/${rideId}`).update({ crewAttachCheckedAt: SERVER_TS });
  if (!captainId) return false;

  const captainMembership = await getCrewMembership(captainId);
  if (captainMembership?.role !== 'captain' || !captainMembership.partnerId) return false;
  const followerId = captainMembership.partnerId;

  const claim = await transactionOnPath(`driverCrewMembership/${followerId}`, (current: any) => {
    if (!current || current.role !== 'follower' || current.captainId !== captainId) return;
    if (current.currentRideId && current.currentRideId !== rideId) return;
    return { ...current, currentRideId: rideId, updatedAt: Date.now() };
  });
  if (!claim.committed) return false;

  if ((await getDriverLocationStatus(followerId)) === 'offline') {
    await db().ref(`driverCrewMembership/${followerId}/currentRideId`).set(null);
    return false;
  }

  const crewSnap = await db().ref(`driverCrews/${captainId}/follower`).once('value');
  const snapshot: CrewMemberSnapshot = crewSnap.val() || (await buildMemberSnapshot(followerId));
  const joinedAt = Date.now();

  await db().ref().update({
    [`activeRides/${rideId}/followerId`]: followerId,
    [`activeRides/${rideId}/follower`]: { ...snapshot, status: 'active', joinedAt },
    [`driverLocations/${followerId}/status`]: 'busy',
    [`driverLocations/${followerId}/updatedAt`]: SERVER_TS,
    [`driverCrewMembership/${captainId}/currentRideId`]: rideId,
  });

  await safeSupabaseRideUpdate(rideId, {
    follower_driver_id: followerId,
    follower_status: 'active',
    follower_joined_at: new Date(joinedAt).toISOString(),
  });

  await notifyUserSafe(followerId, '🚗 Viaje en equipo', 'Tu capitán aceptó un viaje de conductor designado.', {
    rideId,
    captainId,
  }, { type: 'ride_assigned' });

  console.log(`👥 [crew] Seguidor ${followerId} adjuntado a ${rideId} (capitán ${captainId})`);
  return true;
}

const clearMembershipRide = async (uid: string, rideId: string) => {
  if (!uid) return;
  const current = await getCrewMembership(uid);
  if (current?.currentRideId === rideId) {
    await db().ref(`driverCrewMembership/${uid}`).update({ currentRideId: null, updatedAt: Date.now() });
  }
};

export async function releaseFollowerFromRide(
  rideId: string,
  ride: any,
  reason: 'payment_completed' | 'canceled' | 'deleted',
): Promise<void> {
  const followerId = String(ride?.followerId || '');
  const captainId = String(ride?.driverId || '');
  if (!followerId) return;

  const previous = ride?.follower || {};
  const finalStatus: FollowerRideStatus =
    previous.status === 'abandoned' ? 'abandoned' : reason === 'canceled' ? 'canceled' : 'completed';
  const now = Date.now();
  const leftAt = typeof previous.leftAt === 'number' ? previous.leftAt : now;

  if (reason !== 'deleted') {
    await db().ref(`activeRides/${rideId}/follower`).update({ status: finalStatus, leftAt, releasedAt: now });
  }

  await clearMembershipRide(followerId, rideId);
  await clearMembershipRide(captainId, rideId);

  if (finalStatus !== 'abandoned' && (await getDriverLocationStatus(followerId)) === 'busy') {
    await db().ref(`driverLocations/${followerId}`).update({ status: 'available', updatedAt: SERVER_TS });
  }

  await safeSupabaseRideUpdate(rideId, {
    follower_status: finalStatus,
    follower_left_at: new Date(leftAt).toISOString(),
    follower_last_latitude: previous.location?.latitude ?? null,
    follower_last_longitude: previous.location?.longitude ?? null,
  });

  console.log(`👥 [crew] Seguidor ${followerId} liberado de ${rideId} (${finalStatus})`);
}

export async function markFollowerAbandoned(followerId: string): Promise<void> {
  const membership = await getCrewMembership(followerId);
  const rideId = membership?.role === 'follower' ? membership.currentRideId : null;
  if (!rideId) return;

  const rideSnap = await db().ref(`activeRides/${rideId}`).once('value');
  const ride = rideSnap.val();
  if (!ride || ride.followerId !== followerId || ride.follower?.status !== 'active') {
    await clearMembershipRide(followerId, rideId);
    return;
  }

  const leftAt = Date.now();
  await db().ref().update({
    [`activeRides/${rideId}/follower/status`]: 'abandoned',
    [`activeRides/${rideId}/follower/leftAt`]: leftAt,
    [`driverCrewMembership/${followerId}/currentRideId`]: null,
    [`driverCrewMembership/${followerId}/updatedAt`]: leftAt,
  });

  await safeSupabaseRideUpdate(rideId, {
    follower_status: 'abandoned',
    follower_left_at: new Date(leftAt).toISOString(),
    follower_last_latitude: ride.follower?.location?.latitude ?? null,
    follower_last_longitude: ride.follower?.location?.longitude ?? null,
  });

  await notifyUserSafe(ride.driverId, 'Tu seguidor se desconectó', 'El viaje continúa contigo como capitán.', { rideId });
  console.log(`👥 [crew] Seguidor ${followerId} abandonó ${rideId}`);
}
