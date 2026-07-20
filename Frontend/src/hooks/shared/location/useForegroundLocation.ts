import { useState, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/useAuth';
import { ensureActivityRecognitionPermission } from '../../../utils/activityPermission';
import { requestNotificationsPermissionIfNeeded } from '../../../utils/notificationPermission';
import type { Coordinates } from './useLocation';

export const DEFAULT_LOCATION: Coordinates = {
  latitude: 12.1364,
  longitude: -86.2514,
};

export const LAST_KNOWN_LOCATION_KEY = 'last-known-location';

const LOCATION_TIMEOUT_ERROR = 'LOCATION_REQUEST_TIMEOUT';
const FOREGROUND_TIMEOUT_MS = 15000;
const FOREGROUND_TIMEOUT_HIGH_ACCURACY_MS = 25000;

export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, timeoutLabel: string) => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutLabel)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

export async function persistLastKnownLocation(location: Coordinates) {
  try {
    await AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(location));
  } catch (storageError) {
    console.warn('⚠️ No se pudo guardar la última ubicación conocida:', storageError);
  }
}

export async function loadLastKnownLocation(): Promise<Coordinates | null> {
  try {
    const stored = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Coordinates;
      if (
        parsed &&
        typeof parsed.latitude === 'number' &&
        typeof parsed.longitude === 'number'
      ) {
        return parsed;
      }
    }
  } catch (storageError) {
    console.warn('⚠️ No se pudo cargar la última ubicación conocida:', storageError);
  }
  return null;
}

export interface UseForegroundLocationOptions {
  highAccuracy?: boolean;
  initialCoords?: Coordinates;
}

export function useForegroundLocation(options: UseForegroundLocationOptions = {}) {
  const { highAccuracy = false, initialCoords } = options;
  const { user, userMode } = useAuth();

  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUsingMockLocation, setIsUsingMockLocation] = useState(false);

  const isRefreshingLocation = useRef(false);
  const lastSuccessfulRefresh = useRef(0);
  const coordsRef = useRef<Coordinates | null>(null);

  const updateCoords = useCallback(
    (newCoords: Coordinates | null, opts?: { isMock?: boolean }) => {
      coordsRef.current = newCoords;
      setCoords(newCoords);
      if (opts && opts.isMock !== undefined) {
        setIsUsingMockLocation(opts.isMock);
      }
    },
    [],
  );

  const getLocation = useCallback(async () => {
    if (isRefreshingLocation.current) return;

    try {
      isRefreshingLocation.current = true;
      setLoading(true);
      setIsUsingMockLocation(false);

      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      console.log('📍 Permiso de ubicación (foreground):', status, 'canAskAgain:', canAskAgain);

      if (status !== 'granted') {
        console.warn('⚠️ Permiso de ubicación denegado. Usando ubicación mock: Managua');
        setError('Permiso de ubicación denegado');
        updateCoords(DEFAULT_LOCATION, { isMock: true });
        return;
      }

      const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
      if (isDriverCapable && userMode === 'driver') {
        await ensureActivityRecognitionPermission();
      }

      await requestNotificationsPermissionIfNeeded();

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      console.log('📍 Servicios de ubicación activos:', servicesEnabled);
      if (!servicesEnabled) {
        console.warn('⚠️ Servicios de ubicación desactivados. Usando ubicación mock: Managua');
        setError('Servicios de ubicación desactivados');
        updateCoords(DEFAULT_LOCATION, { isMock: true });
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && lastKnown.coords) {
        const candidate: Coordinates = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          heading: lastKnown.coords.heading,
          speed: lastKnown.coords.speed,
          accuracy: lastKnown.coords.accuracy,
          timestamp: lastKnown.timestamp,
        };
        console.log('📍 Última ubicación conocida encontrada:', candidate);
        updateCoords(candidate, { isMock: false });
      }

      const currentPositionOptions: Location.LocationOptions & {
        maximumAge?: number;
        timeout?: number;
        mayShowUserSettingsDialog?: boolean;
      } = {
        accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
        maximumAge: 10000,
        timeout: highAccuracy ? 20000 : 12000,
        mayShowUserSettingsDialog: true,
      };

      const timeoutMs = highAccuracy ? FOREGROUND_TIMEOUT_HIGH_ACCURACY_MS : FOREGROUND_TIMEOUT_MS;
      const location = await withTimeout(
        Location.getCurrentPositionAsync(currentPositionOptions),
        timeoutMs,
        LOCATION_TIMEOUT_ERROR,
      );

      console.log('✅ Ubicación obtenida:', location.coords.latitude, location.coords.longitude);
      const nextCoords: Coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };

      updateCoords(nextCoords, { isMock: false });
      await persistLastKnownLocation(nextCoords);
    } catch (err: any) {
      const message = err?.message || String(err);
      const hadPreviousCoords = !!coordsRef.current;

      if (message === LOCATION_TIMEOUT_ERROR) {
        console.warn('⌛ Tiempo de espera agotado al obtener GPS (forzado).');
      }

      if (message?.toLowerCase?.().includes('timeout')) {
        console.warn('⌛ Tiempo de espera agotado al obtener GPS. Reusando última ubicación conocida.');
      } else {
        console.warn('⚠️ Error al obtener ubicación GPS:', message);
      }

      if (hadPreviousCoords && coordsRef.current) {
        setError('No se pudo actualizar la ubicación, se mantiene la última válida');
        updateCoords(coordsRef.current, { isMock: false });
      } else {
        console.warn('⚠️ Sin ubicación previa, usando ubicación mock: Managua');
        setError(null);
        updateCoords(DEFAULT_LOCATION, { isMock: true });
      }
    } finally {
      setLoading(false);
      isRefreshingLocation.current = false;
      lastSuccessfulRefresh.current = Date.now();
    }
  }, [highAccuracy, user, userMode, updateCoords]);

  const seedInitialCoords = useCallback(() => {
    if (initialCoords && !coordsRef.current) {
      const seeded: Coordinates = {
        latitude: initialCoords.latitude,
        longitude: initialCoords.longitude,
        heading: null,
        speed: null,
        accuracy: null,
        timestamp: Date.now(),
      };
      updateCoords(seeded, { isMock: false });
      setLoading(false);
    }
  }, [initialCoords, updateCoords]);

  const loadStoredLocation = useCallback(async () => {
    const stored = await loadLastKnownLocation();
    if (stored) {
      updateCoords(stored, { isMock: false });
      setLoading(false);
    }
  }, [updateCoords]);

  return {
    coords,
    coordsRef,
    error,
    setError,
    loading,
    isUsingMockLocation,
    updateCoords,
    getLocation,
    refreshLocation: getLocation,
    seedInitialCoords,
    loadStoredLocation,
    lastSuccessfulRefresh,
    isRefreshingLocation,
  };
}
