import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PedometerModule = {
  getPermissionsAsync?: () => Promise<{ status: string }>;
  requestPermissionsAsync?: () => Promise<{ status: string }>;
};

let pedometerModule: PedometerModule | null = null;

const loadPedometerModule = async (): Promise<PedometerModule | null> => {
  if (pedometerModule !== null) {
    return pedometerModule;
  }

  try {
    const sensors = await import('expo-sensors');
    pedometerModule = sensors?.Pedometer ?? null;
    return pedometerModule;
  } catch (error) {
    console.warn('ℹ️ [ActivityPermission] expo-sensors no disponible:', error);
    pedometerModule = null;
    return pedometerModule;
  }
};

type CachedPermission = 'granted' | 'denied' | null;

const STORAGE_KEY = 'activity-recognition-permission';

let cachedResult: boolean | null = null;
let cachedStoredStatus: CachedPermission = null;

const loadStoredStatus = async (): Promise<CachedPermission> => {
  if (cachedStoredStatus !== null) {
    return cachedStoredStatus;
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'granted' || stored === 'denied') {
      cachedStoredStatus = stored;
      return cachedStoredStatus;
    }
  } catch (storageError) {
    console.warn('⚠️ [ActivityPermission] No se pudo leer preferencia guardada:', storageError);
  }

  cachedStoredStatus = null;
  return cachedStoredStatus;
};

const storeStatus = async (status: CachedPermission) => {
  cachedStoredStatus = status;
  if (!status) {
    return;
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEY, status);
  } catch (storageError) {
    console.warn('⚠️ [ActivityPermission] No se pudo guardar preferencia:', storageError);
  }
};

const parseAndroidVersion = (): number => {
  const version = Platform.Version;
  if (typeof version === 'number') {
    return version;
  }
  const parsed = parseInt(String(version), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Solicita permiso de reconocimiento de actividad/movimiento.
 * Retorna true si el permiso está otorgado o no es necesario.
 */
export const ensureActivityRecognitionPermission = async (): Promise<boolean> => {
  if (cachedResult !== null) {
    return cachedResult;
  }

  try {
    if (Platform.OS === 'android') {
      const androidVersion = parseAndroidVersion();

      if (androidVersion < 29) {
        cachedResult = true;
        return cachedResult;
      }

      const { ACTIVITY_RECOGNITION } = PermissionsAndroid.PERMISSIONS;

      if (!ACTIVITY_RECOGNITION) {
        console.warn('ℹ️ [ActivityPermission] ACTIVITY_RECOGNITION no disponible en esta build.');
        cachedResult = true;
        return cachedResult;
      }

      const alreadyGranted = await PermissionsAndroid.check(ACTIVITY_RECOGNITION);
      if (alreadyGranted) {
        await storeStatus('granted');
        cachedResult = true;
        return cachedResult;
      }

      const storedStatus = await loadStoredStatus();
      if (storedStatus === 'denied') {
        console.log('ℹ️ [ActivityPermission] Usuario rechazó previamente actividad física; omitiendo nueva solicitud.');
        cachedResult = false;
        return cachedResult;
      }

      const status = await PermissionsAndroid.request(ACTIVITY_RECOGNITION);
      cachedResult = status === PermissionsAndroid.RESULTS.GRANTED;
      await storeStatus(cachedResult ? 'granted' : 'denied');
      if (!cachedResult) {
        console.warn('⚠️ [ActivityPermission] Permiso de actividad física denegado en Android.');
      }
      return cachedResult;
    }

    if (Platform.OS === 'ios') {
      const pedometer = await loadPedometerModule();

      if (!pedometer) {
        cachedResult = true;
        await storeStatus('granted');
        return cachedResult;
      }

      const storedStatus = await loadStoredStatus();
      if (storedStatus === 'denied') {
        console.log('ℹ️ [ActivityPermission] Usuario rechazó previamente actividad física en iOS; omitiendo nueva solicitud.');
        cachedResult = false;
        return cachedResult;
      }

      if (typeof pedometer.getPermissionsAsync === 'function') {
        const current = await pedometer.getPermissionsAsync();
        if (current.status === 'granted') {
          await storeStatus('granted');
          cachedResult = true;
          return cachedResult;
        }
      }

      if (typeof pedometer.requestPermissionsAsync === 'function') {
        const request = await pedometer.requestPermissionsAsync();
        cachedResult = request.status === 'granted';
        await storeStatus(cachedResult ? 'granted' : 'denied');
        if (!cachedResult) {
          console.warn('⚠️ [ActivityPermission] Permiso de actividad física denegado en iOS.');
        }
        return cachedResult;
      }

      console.warn('ℹ️ [ActivityPermission] API de Pedometer no disponible; asumiendo permiso concedido.');
      await storeStatus('granted');
      cachedResult = true;
      return cachedResult;
    }

    cachedResult = true;
    return cachedResult;
  } catch (error) {
    console.error('❌ [ActivityPermission] Error solicitando permiso de actividad física:', error);
    cachedResult = false;
    return cachedResult;
  }
};
