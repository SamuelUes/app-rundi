import { httpsCallable } from 'firebase/functions';
import { onValue, ref, set } from 'firebase/database';
import { getFirebaseDatabase, getFirebaseFunctions } from '../config/firebase';
import sessionService from './sessionService';
import { uploadImage } from './supabaseStorage';
import type { CrewCandidate, CrewInvite, CrewMembership, DriverCrew } from '../types/designatedCrew';

export const ARRIVAL_PHOTO_MAX_AGE_MS = 12 * 60 * 60 * 1000;

async function call<T>(name: string, payload: Record<string, any> = {}): Promise<T> {
  const functions = await getFirebaseFunctions();
  const deviceId = await sessionService.getDeviceId();
  const response = await httpsCallable(functions, name)({ ...payload, deviceId });
  return response.data as T;
}

function subscribe<T>(path: string, callback: (value: T | null) => void): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  (async () => {
    const database = await getFirebaseDatabase();
    if (cancelled) return;
    unsubscribe = onValue(
      ref(database, path),
      (snapshot) => callback((snapshot.val() as T | null) ?? null),
      (error) => {
        console.warn(`[designatedCrew] subscribe ${path} failed`, error);
        callback(null);
      },
    );
  })();
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export const designatedCrewService = {
  searchCandidates: (params: { licenseNumber?: string; areaId?: string }) =>
    call<{ success: boolean; candidates: CrewCandidate[] }>('searchDesignatedCrewCandidates', params),
  sendInvite: (followerId: string) =>
    call<{ success: boolean; expiresAt: number }>('sendDesignatedCrewInvite', { followerId }),
  respondInvite: (accept: boolean) =>
    call<{ success: boolean; paired: boolean }>('respondDesignatedCrewInvite', { accept }),
  leaveCrew: () => call<{ success: boolean }>('leaveDesignatedCrew'),

  subscribeMembership: (uid: string, cb: (value: CrewMembership | null) => void) =>
    subscribe<CrewMembership>(`driverCrewMembership/${uid}`, cb),
  subscribeInvite: (uid: string, cb: (value: CrewInvite | null) => void) =>
    subscribe<CrewInvite>(`driverCrewInvites/${uid}`, cb),
  subscribeCrew: (captainId: string, cb: (value: DriverCrew | null) => void) =>
    subscribe<DriverCrew>(`driverCrews/${captainId}`, cb),
  subscribeArrivalPhoto: (uid: string, cb: (value: { path: string; takenAt: number } | null) => void) =>
    subscribe<{ path: string; takenAt: number }>(`designatedArrivalPhotos/${uid}`, cb),

  async uploadArrivalPhoto(uid: string, localUri: string): Promise<string> {
    const takenAt = Date.now();
    const path = `rides-inspection/designated-arrival/${uid}/${takenAt}.jpg`;
    await uploadImage(localUri, 'rides-documents', path);
    const database = await getFirebaseDatabase();
    await set(ref(database, `designatedArrivalPhotos/${uid}`), { path, takenAt });
    return path;
  },
};

export function isArrivalPhotoFresh(photo: { takenAt?: number } | null | undefined, now = Date.now()): boolean {
  return !!photo?.takenAt && now - photo.takenAt <= ARRIVAL_PHOTO_MAX_AGE_MS;
}

export default designatedCrewService;
