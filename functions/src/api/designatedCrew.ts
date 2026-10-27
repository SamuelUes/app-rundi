import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { supabaseRpc } from '../supabase/client';
import { ensureActiveSession, requireDriver } from '../utils/sessionUtils';
import { notifyUserSafe } from '../services/notifyUserSafe';
import { transactionOnPath } from '../helpers/rtdbTransaction';
import {
  normalizeLicenseNumber,
  resolveCandidateStatus,
  type CrewCandidateStatus,
  type CrewMemberSnapshot,
} from '../helpers/designatedCrew';
import {
  buildMemberSnapshot,
  getCrewMembership,
  getDriverEligibility,
  getDriverLocationStatus,
} from '../helpers/designatedCrewStore';

const db = () => admin.database();
const INVITE_TTL_MS = 2 * 60 * 1000;
const SEARCH_WINDOW_MS = 60 * 1000;
const SEARCH_MAX_PER_WINDOW = 10;
const AREA_SEARCH_MAX = 60;

const httpsError = (code: functions.https.FunctionsErrorCode, message: string) =>
  new functions.https.HttpsError(code, message);

async function enforceSearchRateLimit(uid: string): Promise<void> {
  const now = Date.now();
  const result = await transactionOnPath(`crewSearchRateLimit/${uid}`, (current: any) => {
    if (!current || now - Number(current.windowStart || 0) > SEARCH_WINDOW_MS) {
      return { windowStart: now, count: 1 };
    }
    if (Number(current.count || 0) >= SEARCH_MAX_PER_WINDOW) return;
    return { ...current, count: Number(current.count || 0) + 1 };
  });
  if (!result.committed) throw httpsError('resource-exhausted', 'CREW_SEARCH_RATE_LIMIT');
}

export const searchDesignatedCrewCandidates = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  await ensureActiveSession(context, data);

  const areaId = String(data?.areaId || '').trim();
  if (areaId) {
    await enforceSearchRateLimit(uid);
    const snap = await db().ref(`driverLocationsByArea/${areaId}`).once('value');
    const areaData = snap.val() || {};
    const ids = Object.keys(areaData).filter((id) => id && id !== uid).slice(0, AREA_SEARCH_MAX);
    const candidates = await Promise.all(
      ids.map(async (candidateId) => {
        const [membership, locationStatus, eligibility, snapshot] = await Promise.all([
          getCrewMembership(candidateId),
          getDriverLocationStatus(candidateId),
          getDriverEligibility(candidateId),
          buildMemberSnapshot(candidateId),
        ]);
        const status: CrewCandidateStatus = resolveCandidateStatus({
          candidateId,
          requesterId: uid,
          isEligible: eligibility.isEligible,
          locationStatus,
          hasMembership: !!membership,
        });
        return { ...snapshot, licenseNumber: snapshot.licenseNumber || eligibility.licenseNumber, status };
      }),
    );
    return { success: true, candidates };
  }

  const license = normalizeLicenseNumber(data?.licenseNumber);
  if (license.length < 4) throw httpsError('invalid-argument', 'CREW_LICENSE_TOO_SHORT');
  await enforceSearchRateLimit(uid);

  const rows: any[] = (await supabaseRpc('find_designated_drivers_by_license', { p_license_normalized: license })) || [];
  const candidates = await Promise.all(
    rows.map(async (row) => {
      const candidateId = String(row.user_id);
      const [membership, locationStatus, snapshot] = await Promise.all([
        getCrewMembership(candidateId),
        getDriverLocationStatus(candidateId),
        buildMemberSnapshot(candidateId, {
          licenseNumber: String(row.license_number || ''),
          rating: Number(row.average_rating || 0),
        }),
      ]);
      const status: CrewCandidateStatus = resolveCandidateStatus({
        candidateId,
        requesterId: uid,
        isEligible: row.designated_rol_requested === 'verified' && row.account_status === 'active',
        locationStatus,
        hasMembership: !!membership,
      });
      return { ...snapshot, status };
    }),
  );
  return { success: true, candidates };
});

export const sendDesignatedCrewInvite = functions.https.onCall(async (data, context) => {
  const captainId = await requireDriver(context);
  await ensureActiveSession(context, data);
  const followerId = String(data?.followerId || '');
  if (!followerId || followerId === captainId) throw httpsError('invalid-argument', 'CREW_INVALID_TARGET');

  const [captainEligibility, followerEligibility, captainMembership, followerMembership, captainStatus, followerStatus] =
    await Promise.all([
      getDriverEligibility(captainId),
      getDriverEligibility(followerId),
      getCrewMembership(captainId),
      getCrewMembership(followerId),
      getDriverLocationStatus(captainId),
      getDriverLocationStatus(followerId),
    ]);

  if (!captainEligibility.isEligible) throw httpsError('permission-denied', 'CREW_CAPTAIN_NOT_ELIGIBLE');
  if (captainMembership) throw httpsError('failed-precondition', 'CREW_ALREADY_PAIRED');
  if (captainStatus === 'busy') throw httpsError('failed-precondition', 'CREW_CAPTAIN_BUSY');
  const targetStatus = resolveCandidateStatus({
    candidateId: followerId,
    requesterId: captainId,
    isEligible: followerEligibility.isEligible,
    locationStatus: followerStatus,
    hasMembership: !!followerMembership,
  });
  if (targetStatus !== 'available') throw httpsError('failed-precondition', `CREW_TARGET_${targetStatus.toUpperCase()}`);

  const captain: CrewMemberSnapshot = await buildMemberSnapshot(captainId, {
    licenseNumber: captainEligibility.licenseNumber,
    rating: captainEligibility.averageRating,
  });
  const now = Date.now();
  const result = await transactionOnPath(`driverCrewInvites/${followerId}`, (current: any) => {
    if (current && Number(current.expiresAt || 0) > now && current.captainId !== captainId) return;
    return { captainId, captain, createdAt: now, expiresAt: now + INVITE_TTL_MS };
  });
  if (!result.committed) throw httpsError('already-exists', 'CREW_TARGET_HAS_PENDING_INVITE');

  await notifyUserSafe(followerId, 'Invitación de conductor designado', `${captain.name} quiere que seas su colega.`, {
    captainId,
    kind: 'designated_crew_invite',
  });
  return { success: true, expiresAt: now + INVITE_TTL_MS };
});

export const respondDesignatedCrewInvite = functions.https.onCall(async (data, context) => {
  const followerId = await requireDriver(context);
  await ensureActiveSession(context, data);
  const accept = data?.accept === true;
  const inviteRef = db().ref(`driverCrewInvites/${followerId}`);
  const invite = (await inviteRef.once('value')).val();
  if (!invite || Number(invite.expiresAt || 0) < Date.now()) {
    await inviteRef.remove();
    throw httpsError('not-found', 'CREW_INVITE_EXPIRED');
  }
  const captainId = String(invite.captainId);

  if (!accept) {
    await inviteRef.remove();
    await notifyUserSafe(captainId, 'Invitación rechazada', 'El conductor rechazó tu invitación.', { followerId });
    return { success: true, paired: false };
  }

  const [followerEligibility, followerStatus, captainStatus] = await Promise.all([
    getDriverEligibility(followerId),
    getDriverLocationStatus(followerId),
    getDriverLocationStatus(captainId),
  ]);
  if (!followerEligibility.isEligible) throw httpsError('permission-denied', 'CREW_FOLLOWER_NOT_ELIGIBLE');
  if (followerStatus === 'busy' || captainStatus === 'busy') throw httpsError('failed-precondition', 'CREW_PARTY_BUSY');

  const now = Date.now();
  const followerClaim = await transactionOnPath(`driverCrewMembership/${followerId}`, (current: any) => {
    if (current) return;
    return { role: 'follower', captainId, partnerId: captainId, currentRideId: null, updatedAt: now };
  });
  if (!followerClaim.committed) throw httpsError('failed-precondition', 'CREW_ALREADY_PAIRED');

  const captainClaim = await transactionOnPath(`driverCrewMembership/${captainId}`, (current: any) => {
    if (current) return;
    return { role: 'captain', captainId, partnerId: followerId, currentRideId: null, updatedAt: now };
  });
  if (!captainClaim.committed) {
    await db().ref(`driverCrewMembership/${followerId}`).remove();
    throw httpsError('failed-precondition', 'CREW_CAPTAIN_ALREADY_PAIRED');
  }

  const follower = await buildMemberSnapshot(followerId, {
    licenseNumber: followerEligibility.licenseNumber,
    rating: followerEligibility.averageRating,
  });
  await db().ref().update({
    [`driverCrews/${captainId}`]: { captainId, followerId, createdAt: now, captain: invite.captain, follower },
    [`driverCrewInvites/${followerId}`]: null,
  });
  await notifyUserSafe(captainId, 'Colega agregado', `${follower.name} aceptó ser tu colega.`, { followerId });
  return { success: true, paired: true };
});

export const leaveDesignatedCrew = functions.https.onCall(async (data, context) => {
  const uid = await requireDriver(context);
  await ensureActiveSession(context, data);
  const membership = await getCrewMembership(uid);
  if (!membership) return { success: true };
  if (membership.currentRideId) throw httpsError('failed-precondition', 'CREW_RIDE_IN_PROGRESS');
  const partnerMembership = await getCrewMembership(membership.partnerId);
  if (partnerMembership?.currentRideId) throw httpsError('failed-precondition', 'CREW_RIDE_IN_PROGRESS');

  await db().ref().update({
    [`driverCrews/${membership.captainId}`]: null,
    [`driverCrewMembership/${uid}`]: null,
    [`driverCrewMembership/${membership.partnerId}`]: null,
  });
  await notifyUserSafe(membership.partnerId, 'Equipo deshecho', 'Tu colega salió del emparejamiento.', { partnerId: uid });
  return { success: true };
});
