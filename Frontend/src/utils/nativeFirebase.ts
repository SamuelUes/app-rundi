import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { resolveLocalEmulatorHost } from '../config/localEmulatorHost';

const executionEnvironment = Constants?.executionEnvironment;
const isExpoGoRuntime = executionEnvironment === 'storeClient';
const isBareOrDevClient = !isExpoGoRuntime;

const cache = {
  auth: { loaded: false, value: null as typeof import('@react-native-firebase/auth') | null },
  app: { loaded: false, value: null as typeof import('@react-native-firebase/app') | null },
  messaging: { loaded: false, value: null as typeof import('@react-native-firebase/messaging') | null },
  appCheck: { loaded: false, value: null as typeof import('@react-native-firebase/app-check') | null },
};

async function loadModule<T>(
  key: keyof typeof cache,
  importer: () => Promise<T>,
): Promise<T | null> {
  const cached = cache[key];
  if (cached.loaded) {
    return cached.value as T | null;
  }

  if (isExpoGoRuntime) {
    cached.loaded = true;
    cached.value = null;
    console.warn(
      `⚠️ [nativeFirebase] Módulo "${String(
        key,
      )}" no está disponible en Expo Go. Usa un Development Build para acceder a funcionalidades nativas.`,
    );
    return null;
  }

  try {
    const module = await importer();
    cached.loaded = true;
    cached.value = module as any;
    return module;
  } catch (error) {
    cached.loaded = true;
    cached.value = null;
    console.warn(`⚠️ [nativeFirebase] No se pudo cargar el módulo "${String(key)}":`, error);
    return null;
  }
}

export function isNativeFirebaseSupported(): boolean {
  return isBareOrDevClient;
}

export function isExpoGo(): boolean {
  return isExpoGoRuntime;
}

let nativeAuthEmulatorConfigured = false;

export async function loadNativeFirebaseAuth() {
  const module = await loadModule('auth', () => import('@react-native-firebase/auth'));
  if (module && process.env.USE_FIREBASE_EMULATORS === 'true' && !nativeAuthEmulatorConfigured) {
    const host = resolveLocalEmulatorHost(
      process.env.FIREBASE_EMULATOR_HOST || 'localhost',
      Platform.OS,
    );
    const emulatorUrl = `http://${host}:9099`;
    if (typeof module.getAuth === 'function' && typeof module.connectAuthEmulator === 'function') {
      module.connectAuthEmulator(module.getAuth(), emulatorUrl);
    } else {
      console.warn('⚠️ [nativeFirebase] API modular de auth no disponible; no se configuró el emulador.');
    }
    nativeAuthEmulatorConfigured = true;
  }
  return module;
}

export async function loadNativeFirebaseApp() {
  return loadModule('app', () => import('@react-native-firebase/app'));
}

export async function loadNativeFirebaseMessaging() {
  return loadModule('messaging', () => import('@react-native-firebase/messaging'));
}

export async function loadNativeFirebaseAppCheck() {
  return loadModule('appCheck', () => import('@react-native-firebase/app-check'));
}
