/**
 * Identidad de dispositivo persistente — habilita reconocer la cuenta tras
 * reinstalar la app y hacer un login directo (un tap o silencioso).
 *
 * deviceId:
 *   - iOS: UUID propio en Keychain (SecureStore sobrevive uninstall).
 *   - Android: ANDROID_ID (estable entre instalaciones, mismo signing key).
 *   - Migra el id legacy de AsyncStorage ('deviceId' de sessionService) al
 *     Keychain para no romper la sesión activa ni el historial.
 *
 * deviceSecret: credencial aleatoria solo en SecureStore; el servidor guarda
 * su sha256. Si el SO la borra, se requiere un login manual para registrar
 * una nueva credencial.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { signInWithCustomToken } from 'firebase/auth';
import { getFirebaseAuth } from '../../config/firebase';
import * as devicesApi from '../../api/devices';
import type { RecognizedDevice } from '../../api/devices';

const SECURE_DEVICE_ID_KEY = 'rundi.device.id';
const SECURE_DEVICE_SECRET_KEY = 'rundi.device.secret';
const LEGACY_DEVICE_ID_KEY = 'deviceId'; // clave vieja de sessionService (AsyncStorage)

let deviceIdPromise: Promise<string> | null = null;

function randomId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${uuid}`;
}

async function tryGetAndroidId(): Promise<string | null> {
  try {
    const Application = await import('expo-application');
    const androidId = (Application as any).getAndroidId?.() || (Application as any).androidId;
    return androidId && typeof androidId === 'string' ? `android-${androidId}` : null;
  } catch {
    return null;
  }
}

/**
 * Id de dispositivo estable entre installs. En iOS el IDFV se resetea al
 * desinstalar — por eso se genera un UUID propio persistido en Keychain.
 */
export function getStableDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const persisted = await SecureStore.getItemAsync(SECURE_DEVICE_ID_KEY).catch(() => null);
      if (persisted) return persisted;

      const legacy = await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY).catch(() => null);
      const nativeId = Platform.OS === 'android' ? await tryGetAndroidId() : null;
      const id = legacy || nativeId || randomId(Platform.OS);
      await SecureStore.setItemAsync(SECURE_DEVICE_ID_KEY, id).catch(() => {});
      return id;
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}

/**
 * ¿El secret persistió de esta instalación? Tras uninstall en Android el
 * almacenamiento se borra → el secret sería nuevo y el hash del servidor no
 * matchea (401 seguro): el caller puede saltar el exchange e ir a login.
 */
export async function hasPersistedDeviceSecret(): Promise<boolean> {
  return (await SecureStore.getItemAsync(SECURE_DEVICE_SECRET_KEY).catch(() => null)) !== null;
}

/**
 * Registra/rota el par (deviceId, uid) en el backend. Llamar tras cualquier
 * login exitoso — también cubre la rotación cuando el secret se regeneró
 * (reinstall en Android) o el dispositivo cambió de cuenta.
 */
let registrationPromise: Promise<void> | null = null;
let recognitionPromise: Promise<RecognizedDevice | null> | null = null;

export function registerDevice(): Promise<void> {
  const previous = registrationPromise;
  const operation = (async () => {
    if (previous) await previous.catch(() => {});
    const auth = await getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) return;
    const [deviceId, bytes] = await Promise.all([
      getStableDeviceId(),
      Crypto.getRandomBytesAsync(32),
    ]);
    if (auth.currentUser?.uid !== user.uid) return;
    const deviceSecret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    // Persist first: if the request fails or its response is lost, manual login
    // remains available and the server never receives an unrecoverable secret.
    await SecureStore.setItemAsync(SECURE_DEVICE_SECRET_KEY, deviceSecret);
    recognitionPromise = null;
    if (auth.currentUser?.uid !== user.uid) return;
    await devicesApi.registerMyDevice({
      deviceId,
      deviceSecret,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? undefined,
    });
  })();
  registrationPromise = operation;
  void operation.finally(() => {
    recognitionPromise = null;
    if (registrationPromise === operation) registrationPromise = null;
  }).catch(() => {});
  return operation;
}

/** Hint pre-login: ¿este dispositivo tuvo una cuenta? (no autentica). */
export async function recognizeDevice(): Promise<RecognizedDevice> {
  const [deviceId, secret] = await Promise.all([
    getStableDeviceId(),
    SecureStore.getItemAsync(SECURE_DEVICE_SECRET_KEY),
  ]);
  if (!secret) return { recognized: false };
  return devicesApi.recognizeDevice(deviceId, secret);
}

// La llamada paga Firebase init + App Check en frío (~1-3 s). Prewarm la
// dispara al arrancar la app en paralelo con el auth listener, así la
// tarjeta "continuar como X" ya está resuelta cuando el landing monta.
export function prewarmDeviceRecognition(): void {
  if (!recognitionPromise) {
    recognitionPromise = recognizeDevice().catch(() => null);
  }
}

export async function getRecognizedDevice(): Promise<RecognizedDevice | null> {
  if (registrationPromise) await registrationPromise.catch(() => {});
  prewarmDeviceRecognition();
  const pending = recognitionPromise;
  const result = await pending;
  if (recognitionPromise === pending) recognitionPromise = null;
  return result;
}

/**
 * Login directo: cambia deviceId+secret por un custom token y abre sesión en
 * el JS SDK. Lanza si el secret ya no es válido (caller hace fallback a
 * login manual). Tras signInWithCustomToken el auth listener toma el flujo.
 */
export async function continueWithRecognizedDevice(): Promise<void> {
  const [deviceId, deviceSecret] = await Promise.all([
    getStableDeviceId(),
    SecureStore.getItemAsync(SECURE_DEVICE_SECRET_KEY),
  ]);
  if (!deviceSecret) throw new Error('DEVICE_SECRET_MISSING');
  const { customToken } = await devicesApi.deviceToken(deviceId, deviceSecret);
  const auth = await getFirebaseAuth();
  await signInWithCustomToken(auth, customToken);
}

export default {
  getStableDeviceId,
  registerDevice,
  recognizeDevice,
  hasPersistedDeviceSecret,
  prewarmDeviceRecognition,
  getRecognizedDevice,
  continueWithRecognizedDevice,
};
