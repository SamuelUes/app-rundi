/**
 * Token VoIP (PushKit, iOS) → DATA-MAIN_users/{uid}/voipTokens/{token}.
 * El consumer lo lee para enviar el push que despierta la app y dispara la
 * UI de CallKit cuando llega una llamada con la app muerta. Paridad con
 * fcmService.registerToken/clearToken pero sin permisos ni fallback (VoIP
 * no usa el canal de notificaciones del usuario).
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { callkit } from './callkit';
import { registerVoipToken, removeVoipToken } from '../live/userLive';

const STORAGE_KEY = 'voipToken';
const isIOS = Platform.OS === 'ios';

const bundleId = (): string =>
  Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.gruporzc.rundi';

const writeToken = async (uid: string, token: string) => {
  await registerVoipToken(uid, token, { bundleId: bundleId() });
  await AsyncStorage.setItem(STORAGE_KEY, token);
};

/** Lee el token nativo y lo sube si cambió (o si aún no se registró). */
export async function syncVoipToken(uid: string): Promise<boolean> {
  if (!isIOS || !uid) return false;
  try {
    const token = await callkit.getVoipToken();
    if (!token) return false;
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored !== token) {
      if (stored) {
        await removeVoipToken(uid, stored).catch(() => undefined);
      }
      await writeToken(uid, token);
    } else {
      // Asegura el doc aunque el token no haya rotado (reinstalación, etc.)
      await writeToken(uid, token);
    }
    return true;
  } catch (error) {
    console.warn('[voip] syncVoipToken error:', error);
    return false;
  }
}

/** Suscribe rotación de token VoIP; devuelve unsubscribe (iOS only). */
export function listenVoipToken(uid: string): () => void {
  if (!isIOS || !uid) return () => undefined;
  const sub = callkit.addVoipTokenListener(({ token }) => {
    if (token) {
      void writeToken(uid, token).catch((error) => {
        console.warn('[voip] register rotated token error:', error);
      });
    }
  });
  return () => sub?.remove();
}

/** Quita el token del backend al cerrar sesión (best effort). */
export async function clearVoipToken(uid: string | null | undefined): Promise<void> {
  if (!isIOS) return;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && uid) {
      await removeVoipToken(uid, stored).catch(() => undefined);
    }
    if (stored) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[voip] clearVoipToken error:', error);
  }
}
