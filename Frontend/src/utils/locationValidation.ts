import { Platform } from 'react-native';
import client from '../api/client';
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
    const response = await client.post('/checkRegionAvailabilityHttp', {
      latitude: coordsToCheck.latitude,
      longitude: coordsToCheck.longitude,
      platform: Platform.OS,
    });
    const data = response.data || {};
    const result: LocationValidationResult = {
      allowed: !!data.allowed,
      serviceAreaId:
        typeof data.serviceAreaId === 'string' && data.serviceAreaId.trim().length > 0
          ? data.serviceAreaId.trim()
          : null,
      areaName: typeof data.areaName === 'string' ? data.areaName : undefined,
      message: typeof data.message === 'string' ? data.message : undefined,
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
