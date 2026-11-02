import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { devTiming } from '../../utils/devTiming';
import { writePresence, writeUserSession, type UserSessionPatch } from '../../live/driverLive';

const DEVICE_ID_KEY = 'deviceId';
// Sesión de otro dispositivo se considera "activa" solo si su heartbeat es
// reciente — un doc viejo es un resto de una app muerta y se puede reclamar.
const SESSION_STALE_MS = 3 * 60 * 1000;

let deviceIdPromise: Promise<string> | null = null;
const sessionStartPromises = new Map<string, Promise<{ success: boolean }>>();

export function isSessionActiveElsewhereError(error: any): boolean {
  return error?.code === 'SESSION_ACTIVE_ELSEWHERE' ||
    (typeof error?.message === 'string' && error.message.includes('SESSION_ACTIVE_ELSEWHERE'));
}

function sessionActiveElsewhere(): Error {
  const error = new Error('SESSION_ACTIVE_ELSEWHERE');
  (error as any).code = 'SESSION_ACTIVE_ELSEWHERE';
  return error;
}

async function tryGetNativeDeviceId(): Promise<string | null> {
  try {
    const Application = await import('expo-application');
    // Prefer vendor/Android ID if available
    if (Platform.OS === 'ios' && typeof (Application as any).getIosIdForVendorAsync === 'function') {
      const iosId = await (Application as any).getIosIdForVendorAsync();
      if (iosId && typeof iosId === 'string') return `ios-${iosId}`;
    }
    if (Platform.OS === 'android') {
      const androidId = (Application as any).getAndroidId?.() || (Application as any).androidId;
      if (androidId && typeof androidId === 'string') return `android-${androidId}`;
    }
  } catch {
    // ignore
  }
  return null;
}

function generateLocalId(): string {
  // Simple UUID v4-ish fallback
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `local-${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${Date.now()}`;
}

export async function getDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const cached = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (cached) return cached;

      const nativeId = await tryGetNativeDeviceId();
      const id = nativeId || generateLocalId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      return id;
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}

function lastHeartbeatMillis(session: DocumentData | undefined): number | null {
  const hb = session?.lastHeartbeat;
  if (hb && typeof hb.toMillis === 'function') return hb.toMillis();
  if (typeof hb === 'number') return hb;
  return null;
}

function isSessionFresh(session: DocumentData | undefined): boolean {
  const millis = lastHeartbeatMillis(session);
  if (millis === null) return false;
  return Date.now() - millis < SESSION_STALE_MS;
}

export interface SessionOwnershipDiagnostic {
  authReady: boolean;
  sameDevice: boolean | null;
  sessionExists: boolean | null;
  sessionPlatform: string | null;
  sessionActive: boolean | null;
  lastSeenAgeSeconds: number | null;
}

export async function getSessionOwnershipDiagnostic(): Promise<SessionOwnershipDiagnostic> {
  const auth = await getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      authReady: false,
      sameDevice: null,
      sessionExists: null,
      sessionPlatform: null,
      sessionActive: null,
      lastSeenAgeSeconds: null,
    };
  }

  const deviceId = await getDeviceId();
  const db = await getFirebaseFirestore();
  const snapshot = await getDoc(doc(db, FS_COL.userSessions, currentUser.uid));
  const session = snapshot.exists() ? snapshot.data() : undefined;
  const hbMillis = lastHeartbeatMillis(session);

  return {
    authReady: true,
    sameDevice: session ? session?.device === deviceId : null,
    sessionExists: snapshot.exists(),
    sessionPlatform: session?.platform ?? null,
    sessionActive: session ? isSessionFresh(session) : null,
    lastSeenAgeSeconds: hbMillis === null ? null : Math.max(0, Math.round((Date.now() - hbMillis) / 1000)),
  };
}

export async function startSession(options?: {
  policy?: 'deny';
  model?: string;
  fcmToken?: string;
  source?: string;
  mode?: 'client' | 'driver';
  serviceAreaId?: string;
}) {
  const auth = await getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('UNAUTHENTICATED');
  }

  const pending = sessionStartPromises.get(uid);
  if (pending) return pending;

  const deviceIdStarted = Date.now();
  const deviceId = await getDeviceId();
  devTiming('Session', 'device_id', deviceIdStarted);

  const request = (async () => {
    const firestoreStarted = Date.now();
    const db = await getFirebaseFirestore();
    devTiming('Session', 'firestore', firestoreStarted);
    const sessionRef = doc(db, FS_COL.userSessions, uid);

    if ((options?.policy || 'deny') === 'deny') {
      const readStarted = Date.now();
      const snap = await getDoc(sessionRef);
      devTiming('Session', 'read', readStarted);
      const existing = snap.exists() ? snap.data() : undefined;
      if (existing?.device && existing.device !== deviceId && isSessionFresh(existing)) {
        throw sessionActiveElsewhere();
      }
    }

    const patch: UserSessionPatch = {
      mode: options?.mode ?? 'client',
      device: deviceId,
      platform: Platform.OS,
      ...(options?.model !== undefined && { appVersion: options.model }),
      ...(options?.serviceAreaId !== undefined && { serviceAreaId: options.serviceAreaId }),
      ...(options?.fcmToken !== undefined && { fcmToken: options.fcmToken }),
    };
    const writeStarted = Date.now();
    await writeUserSession(uid, patch);
    devTiming('Session', 'write', writeStarted);
    return { success: true };
  })();

  sessionStartPromises.set(uid, request);
  try {
    return await request;
  } finally {
    if (sessionStartPromises.get(uid) === request) sessionStartPromises.delete(uid);
  }
}

export async function heartbeatSession(options?: { source?: string }) {
  const auth = await getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('UNAUTHENTICATED');
  }

  // Heartbeat ligero: solo refresca lastHeartbeat; si otro dispositivo tomó
  // la sesión (device distinto), el heartbeat NO la re-escribe — el conflicto
  // lo detecta el listener de sesión (listenSessionConflict).
  const db = await getFirebaseFirestore();
  const deviceId = await getDeviceId();
  const snap = await getDoc(doc(db, FS_COL.userSessions, uid));
  const existing = snap.exists() ? snap.data() : undefined;
  if (existing?.device && existing.device !== deviceId) {
    throw sessionActiveElsewhere();
  }

  await setDoc(
    doc(db, FS_COL.userSessions, uid),
    { lastHeartbeat: serverTimestamp() },
    { merge: true },
  );
  return { success: true };
}

export async function endSession() {
  try {
    const auth = await getFirebaseAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const db = await getFirebaseFirestore();
    await deleteDoc(doc(db, FS_COL.userSessions, uid));
    await writePresence(uid, 'offline').catch(() => {});
  } catch (e) {
    // No bloquear logout por error de endSession
  }
}

/**
 * Listener del doc de sesión propio — si `device` cambia a otro dispositivo,
 * la sesión fue tomada (equivalente a la detección de conflicto v1).
 */
export async function listenSessionConflict(
  uid: string,
  cb: (session: DocumentData | undefined) => void,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  return onSnapshot(doc(db, FS_COL.userSessions, uid), (s) => cb(s.data()));
}

export default {
  getDeviceId,
  getSessionOwnershipDiagnostic,
  startSession,
  heartbeatSession,
  endSession,
  listenSessionConflict,
  isSessionActiveElsewhereError,
};
