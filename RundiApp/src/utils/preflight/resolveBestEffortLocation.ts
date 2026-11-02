import * as Location from 'expo-location';
import {
  loadLastKnownLocation,
  withTimeout,
} from '../../hooks/shared/location/useForegroundLocation';

// El fix actual es el último recurso: el preflight debe validar la región
// contra el backend antes de entrar a Home, así que se intenta acotado
// en lugar de esperar el timeout completo del GPS.
const CURRENT_FIX_TIMEOUT_MS = 8_000;
const FRESH_LAST_KNOWN_MAX_AGE_MS = 60_000;

export type PreflightLocation = { lat: number; lng: number };

const toLatLng = (
  coords: { latitude?: number | null; longitude?: number | null } | null | undefined,
): PreflightLocation | null => {
  const { latitude, longitude } = coords ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return { lat: latitude, lng: longitude };
};

export async function resolveBestEffortLocation(): Promise<PreflightLocation | null> {
  try {
    const fresh = await Location.getLastKnownPositionAsync({
      maxAge: FRESH_LAST_KNOWN_MAX_AGE_MS,
    });
    const freshCoords = toLatLng(fresh?.coords);
    if (freshCoords) return freshCoords;

    const last = await Location.getLastKnownPositionAsync();
    const lastCoords = toLatLng(last?.coords);
    if (lastCoords) return lastCoords;

    const stored = await loadLastKnownLocation();
    const storedCoords = toLatLng(stored);
    if (storedCoords) return storedCoords;
  } catch (_error) {
    // Sigue al intento de fix actual abajo.
  }

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const current = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      CURRENT_FIX_TIMEOUT_MS,
      'preflight-location-timeout',
    );
    return toLatLng(current?.coords);
  } catch (_error) {
    return null;
  }
}
