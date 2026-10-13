import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirebaseAuth, getFirebaseDatabase } from '../config/firebase';

const DEVICE_ID_KEY = 'deviceId';
let deviceIdPromise: Promise<string> | null = null;
const sessionStartPromises = new Map<string, Promise<{ success: boolean }>>();

export function isSessionActiveElsewhereError(error: any): boolean {
  return error?.code === 'SESSION_ACTIVE_ELSEWHERE' ||
    (typeof error?.message === 'string' && error.message.includes('SESSION_ACTIVE_ELSEWHERE'));
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
  const database = await getFirebaseDatabase();
  const { get, ref } = await import('firebase/database');
  const snapshot = await get(ref(database, `sessions/${currentUser.uid}`));
  const session = snapshot.val();
  const lastSeen = typeof session?.lastSeen === 'number' ? session.lastSeen : null;

  return {
    authReady: true,
    sameDevice: session?.deviceId === deviceId,
    sessionExists: Boolean(session),
    sessionPlatform: session?.platform ?? null,
    sessionActive: session?.isActive ?? null,
    lastSeenAgeSeconds: lastSeen === null ? null : Math.max(0, Math.round((Date.now() - lastSeen) / 1000)),
  };
}

async function callStartSession(payload: Record<string, unknown>) {
  const functions = await getFirebaseFunctions();
  const callable = httpsCallable(functions, 'startSession');
  try {
    await callable(payload);
    return { success: true };
  } catch (err: any) {
    const message = `${err?.message || ''} ${err?.details || ''}`;
    if (message.includes('SESSION_ACTIVE_ELSEWHERE')) {
      const error = new Error('SESSION_ACTIVE_ELSEWHERE');
      (error as any).code = 'SESSION_ACTIVE_ELSEWHERE';
      throw error;
    }
    throw err;
  }
}

export async function startSession(options?: { policy?: 'deny'; model?: string; fcmToken?: string; source?: string }) {
  const auth = await getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('UNAUTHENTICATED');
  }

  const pending = sessionStartPromises.get(uid);
  if (pending) return pending;

  const deviceId = await getDeviceId();
  const concurrent = sessionStartPromises.get(uid);
  if (concurrent) return concurrent;

  const request = callStartSession({
    deviceId,
    platform: Platform.OS,
    model: options?.model,
    fcmToken: options?.fcmToken,
    policy: options?.policy || 'deny',
    source: options?.source,
  });
  sessionStartPromises.set(uid, request);
  try {
    return await request;
  } finally {
    if (sessionStartPromises.get(uid) === request) sessionStartPromises.delete(uid);
  }
}

export async function heartbeatSession(options?: { source?: string }) {
  const auth = await getFirebaseAuth();
  if (!auth.currentUser) {
    throw new Error('UNAUTHENTICATED');
  }

  return callStartSession({
    deviceId: await getDeviceId(),
    heartbeatOnly: true,
    source: options?.source,
  });
}

export async function endSession() {
  try {
    const auth = await getFirebaseAuth();
    if (!auth.currentUser) return;
    const functions = await getFirebaseFunctions();
    const callable = httpsCallable(functions, 'endSession');
    await callable({ deviceId: await getDeviceId() });
  } catch (e) {
    // No bloquear logout por error de endSession
  }
}

export default {
  getDeviceId,
  getSessionOwnershipDiagnostic,
  startSession,
  heartbeatSession,
  endSession,
  isSessionActiveElsewhereError,
};
