import { doc, onSnapshot, type DocumentData, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import * as crewApi from '../../api/crew';
import { searchCrewCandidates } from '../../api/drivers';
import { submitArrivalPhoto } from '../../live/pendingEvents';
import { uploadImage } from '../media/storageService';
import type { CrewCandidate, CrewInvite, CrewMembership, DriverCrew } from '../../types/designatedCrew';

export const ARRIVAL_PHOTO_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function subscribe<T>(collection: string, id: string, callback: (value: T | null) => void): () => void {
  let cancelled = false;
  let unsubscribe: Unsubscribe | null = null;
  (async () => {
    const db = await getFirebaseFirestore();
    if (cancelled) return;
    unsubscribe = onSnapshot(
      doc(db, collection, id),
      (snapshot) => callback((snapshot.data() as T | undefined) ?? null),
      (error) => {
        console.warn(`[designatedCrew] subscribe ${collection}/${id} failed`, error);
        callback(null);
      },
    );
  })();
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

function takenAtMillis(value: DocumentData | undefined): number | undefined {
  const takenAt = value?.takenAt;
  if (takenAt && typeof takenAt.toMillis === 'function') return takenAt.toMillis();
  if (typeof takenAt === 'number') return takenAt;
  return undefined;
}

export const designatedCrewService = {
  searchCandidates: async (params: { licenseNumber?: string; areaId?: string }) => {
    const candidates = await searchCrewCandidates(params.licenseNumber ?? '');
    return { success: true, candidates: candidates as unknown as CrewCandidate[] };
  },
  sendInvite: async (followerId: string) => {
    await crewApi.inviteFollower(followerId);
    return { success: true, expiresAt: 0 };
  },
  respondInvite: async (accept: boolean) => {
    // El backend v2 no expone "decline": la invitación expira sola (expiresAt).
    if (accept) await crewApi.acceptCrewInvite();
    return { success: true, paired: accept };
  },
  leaveCrew: async () => {
    await crewApi.leaveCrew();
    return { success: true };
  },
  attachFollowerToRide: (rideId: string) => crewApi.attachFollowerToRide(rideId),
  releaseFollowerFromRide: (rideId: string, reason?: 'completed' | 'canceled' | 'abandoned') =>
    crewApi.releaseFollowerFromRide(rideId, reason),

  subscribeMembership: (uid: string, cb: (value: CrewMembership | null) => void) =>
    subscribe<CrewMembership>(FS_COL.crewMembership, uid, cb),
  subscribeInvite: (uid: string, cb: (value: CrewInvite | null) => void) =>
    subscribe<CrewInvite>(FS_COL.crewInvites, uid, cb),
  subscribeCrew: (captainId: string, cb: (value: DriverCrew | null) => void) =>
    subscribe<DriverCrew>(FS_COL.driverCrews, captainId, cb),
  subscribeArrivalPhoto: (uid: string, cb: (value: { path: string; takenAt: number } | null) => void) =>
    subscribe<DocumentData>(FS_COL.arrivalPhotos, uid, (data) =>
      cb(data ? { path: data.path, takenAt: takenAtMillis(data) ?? 0 } : null),
    ),

  async uploadArrivalPhoto(uid: string, localUri: string, rideId?: string): Promise<string> {
    const path = `rides-inspection/designated-arrival/${uid}/${Date.now()}.jpg`;
    const objectPath = await uploadImage(localUri, 'rides-documents', path);
    if (rideId) {
      // Batch atómico: doc efímero + pending event → persiste en SQL (doc §5.2).
      await submitArrivalPhoto({ uid, rideId, path: objectPath });
    } else {
      // Sin rideId conocido solo queda el doc efímero (12h); el pending event
      // lo emite el caller cuando tenga contexto del viaje.
      const db = await getFirebaseFirestore();
      const { setDoc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(db, FS_COL.arrivalPhotos, uid), { path: objectPath, takenAt: serverTimestamp() });
    }
    return objectPath;
  },
};

export function isArrivalPhotoFresh(photo: { takenAt?: number } | null | undefined, now = Date.now()): boolean {
  return !!photo?.takenAt && now - photo.takenAt <= ARRIVAL_PHOTO_MAX_AGE_MS;
}

export default designatedCrewService;
