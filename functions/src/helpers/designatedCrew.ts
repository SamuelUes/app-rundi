export type CrewRole = 'captain' | 'follower';
export type CrewCandidateStatus = 'available' | 'busy' | 'paired' | 'offline' | 'not_eligible' | 'self';
export type RatedRole = 'driver' | 'captain' | 'follower' | 'client';
export type FollowerRideStatus = 'active' | 'abandoned' | 'completed' | 'canceled';

export interface CrewMemberSnapshot {
  driverId: string;
  name: string;
  rating: number;
  licenseNumber: string;
  photoURL: string | null;
}

export type CrewRideAction =
  | { type: 'attach' }
  | { type: 'release'; reason: 'payment_completed' | 'canceled' | 'deleted' }
  | { type: 'none' };

const DESIGNATED_RIDE_TYPES = new Set([
  'designated_driver',
  'designated-driver',
  'designateddriver',
  'conductor_designado',
  'conductor-designado',
]);

export const CREW_ATTACH_STATUSES = new Set(['accepted', 'driver_on_route', 'driver_arrived', 'in_progress']);
const CREW_RELEASE_STATUSES = new Set(['pending_rating', 'rating_completed', 'completed']);

export function isDesignatedRide(ride: any): boolean {
  const rideType = String(ride?.rideType ?? ride?.ride_type ?? '').trim().toLowerCase();
  if (DESIGNATED_RIDE_TYPES.has(rideType)) return true;
  const vehicleType = String(ride?.vehicleType ?? ride?.vehicle_type ?? '').trim().toLowerCase();
  return DESIGNATED_RIDE_TYPES.has(vehicleType);
}

export function normalizeLicenseNumber(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

export function resolveCandidateStatus(input: {
  candidateId: string;
  requesterId: string;
  isEligible: boolean;
  locationStatus: string | null | undefined;
  hasMembership: boolean;
}): CrewCandidateStatus {
  if (input.candidateId === input.requesterId) return 'self';
  if (!input.isEligible) return 'not_eligible';
  if (input.hasMembership) return 'paired';
  const status = String(input.locationStatus || '').toLowerCase();
  if (status === 'busy') return 'busy';
  return status === 'available' ? 'available' : 'offline';
}

export function decideCrewRideAction(before: any, after: any): CrewRideAction {
  if (!after) {
    return before?.followerId && !before?.follower?.releasedAt
      ? { type: 'release', reason: 'deleted' }
      : { type: 'none' };
  }
  if (!isDesignatedRide(after)) return { type: 'none' };
  const status = String(after.status || '').toLowerCase();
  if (after.followerId) {
    if (after.follower?.releasedAt) return { type: 'none' };
    if (status === 'canceled') return { type: 'release', reason: 'canceled' };
    if (CREW_RELEASE_STATUSES.has(status)) return { type: 'release', reason: 'payment_completed' };
    return { type: 'none' };
  }
  if (after.driverId && CREW_ATTACH_STATUSES.has(status) && !after.crewAttachCheckedAt) {
    return { type: 'attach' };
  }
  return { type: 'none' };
}

export function resolveRatingTarget(
  ride: { clientId?: string | null; driverId?: string | null; followerId?: string | null } | null,
  fromUserId: string,
  targetRole?: CrewRole | null,
): { toUserId: string; ratedRole: RatedRole } | null {
  if (!ride) return null;
  if (fromUserId === ride.clientId) {
    if (targetRole === 'follower') {
      return ride.followerId ? { toUserId: ride.followerId, ratedRole: 'follower' } : null;
    }
    if (!ride.driverId) return null;
    return { toUserId: ride.driverId, ratedRole: ride.followerId ? 'captain' : 'driver' };
  }
  if (fromUserId === ride.driverId && ride.clientId) {
    return { toUserId: ride.clientId, ratedRole: 'client' };
  }
  return null;
}

export interface EarningsRideInput {
  driverId?: string | null;
  followerDriverId?: string | null;
  rideType?: string | null;
  vehicleType?: string | null;
  fare: number;
  commission: number;
  tip: number;
}

export interface EarningsTotals {
  rides: number;
  gross: number;
  commission: number;
  tips: number;
  net: number;
}

export interface EarningsSplit {
  normal: EarningsTotals;
  designated: EarningsTotals & { captainRides: number; followerRides: number };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function crewRoleForDriver(ride: EarningsRideInput, driverId: string): CrewRole | 'solo' {
  if (ride.followerDriverId && ride.followerDriverId === driverId) return 'follower';
  if (ride.followerDriverId && ride.driverId === driverId) return 'captain';
  return 'solo';
}

export function splitDriverEarnings(rides: EarningsRideInput[], driverId: string): EarningsSplit {
  const empty = (): EarningsTotals => ({ rides: 0, gross: 0, commission: 0, tips: 0, net: 0 });
  const normal = empty();
  const designated = { ...empty(), captainRides: 0, followerRides: 0 };

  for (const ride of rides) {
    const role = crewRoleForDriver(ride, driverId);
    const target = isDesignatedRide(ride) || role !== 'solo' ? designated : normal;
    const tip = role === 'follower' ? 0 : ride.tip || 0;
    target.rides += 1;
    target.gross += ride.fare || 0;
    target.commission += ride.commission || 0;
    target.tips += tip;
    if (role === 'captain') designated.captainRides += 1;
    if (role === 'follower') designated.followerRides += 1;
  }

  for (const totals of [normal, designated]) {
    totals.gross = round2(totals.gross);
    totals.commission = round2(totals.commission);
    totals.tips = round2(totals.tips);
    totals.net = round2(totals.gross - totals.commission);
  }
  return { normal, designated };
}
