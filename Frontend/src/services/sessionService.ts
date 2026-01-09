import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirebaseAuth } from '../config/firebase';

const DEVICE_ID_KEY = 'deviceId';

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
  const cached = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (cached) return cached;

  const nativeId = await tryGetNativeDeviceId();
  const id = nativeId || generateLocalId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export async function startSession(options?: { policy?: 'deny' | 'takeover'; model?: string; fcmToken?: string }) {
  const auth = await getFirebaseAuth();
  const current = auth.currentUser;
  if (!current) {
    // Si no hay usuario autenticado, no se puede abrir sesión remota
    throw new Error('UNAUTHENTICATED');
  }

  const functions = await getFirebaseFunctions();
  const callable = httpsCallable(functions, 'startSession');
  const deviceId = await getDeviceId();

  try {
    await callable({
      deviceId,
      platform: Platform.OS,
      model: options?.model,
      fcmToken: options?.fcmToken,
      policy: options?.policy || 'deny',
    });
    return { success: true };
  } catch (err: any) {
    const code = err?.code || err?.error?.code;
    const message = err?.message || '';
    // Mapear HttpsError 'failed-precondition' con detalle de sesión activa
    if (code === 'functions/failed-precondition' || message.includes('SESSION_ACTIVE_ELSEWHERE')) {
      const error = new Error('SESSION_ACTIVE_ELSEWHERE');
      (error as any).code = 'SESSION_ACTIVE_ELSEWHERE';
      throw error;
    }
    throw err;
  }
}

export async function endSession() {
  try {
    const auth = await getFirebaseAuth();
    if (!auth.currentUser) return;
    const functions = await getFirebaseFunctions();
    const callable = httpsCallable(functions, 'endSession');
    await callable({});
  } catch (e) {
    // No bloquear logout por error de endSession
  }
}

export default {
  getDeviceId,
  startSession,
  endSession,
};
