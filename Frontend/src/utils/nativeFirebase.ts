import Constants from 'expo-constants';

const executionEnvironment = Constants?.executionEnvironment;
const isExpoGoRuntime = executionEnvironment === 'storeClient';
const isBareOrDevClient = !isExpoGoRuntime;

const cache = {
  auth: { loaded: false, value: null as typeof import('@react-native-firebase/auth') | null },
  app: { loaded: false, value: null as typeof import('@react-native-firebase/app') | null },
  messaging: { loaded: false, value: null as typeof import('@react-native-firebase/messaging') | null },
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

export async function loadNativeFirebaseAuth() {
  return loadModule('auth', () => import('@react-native-firebase/auth'));
}

export async function loadNativeFirebaseApp() {
  return loadModule('app', () => import('@react-native-firebase/app'));
}

export async function loadNativeFirebaseMessaging() {
  return loadModule('messaging', () => import('@react-native-firebase/messaging'));
}
