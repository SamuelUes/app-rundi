import { Platform } from 'react-native';
import { getRegionAvailability } from '../../api/platform';
import type { Coords } from './rideCoords';

export interface LocationValidationResult {
  allowed: boolean;
  serviceAreaId: string | null;
  areaName?: string;
  message?: string;
}

export async function checkLocationAllowed(
  coordsToCheck: Coords,
  cache: Record<string, LocationValidationResult>,
  errorMessage: string,
): Promise<LocationValidationResult> {
  const cacheKey = `${coordsToCheck.latitude.toFixed(5)},${coordsToCheck.longitude.toFixed(5)}`;
  const cached = cache[cacheKey];
  if (cached) {
    return cached;
  }

  try {
    const res = await getRegionAvailability(coordsToCheck.latitude, coordsToCheck.longitude);
    const result: LocationValidationResult = {
      allowed: !!res?.available,
      serviceAreaId:
        typeof res?.areaId === 'string' && res.areaId.trim().length > 0
          ? res.areaId.trim()
          : null,
      areaName: typeof res?.areaName === 'string' ? res.areaName : undefined,
    };
    cache[cacheKey] = result;
    return result;
  } catch (error: any) {
    console.warn('[locationValidation] Error verificando área de servicio:', error?.response?.data || error);
    return {
      allowed: false,
      serviceAreaId: null,
      message: errorMessage,
    };
  }
}
