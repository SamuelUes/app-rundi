import type { PriceBreakdown } from '../ride/priceCalculatorCentralize';
import { haversineMeters } from './distance';

export const DESIGNATED_DRIVER_MOTO_DISCOUNT = 70;
export const MIN_DESIGNATED_DRIVER_PRICE = 100;

export interface Coords {
  latitude: number;
  longitude: number;
}

export function formatCoords(coords: Coords): string {
  return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}

export function isValidCoordLocal(value: Coords | null | undefined): value is Coords {
  if (!value) return false;
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return true;
}

export function metersBetween(a: Coords, b: Coords): number {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

export function extractCoordsFromSuggestion(suggestion: any): Coords | null {
  if (!suggestion) return null;

  const directLat = suggestion.latitude ?? suggestion.lat;
  const directLng = suggestion.longitude ?? suggestion.lng ?? suggestion.lon;
  if (typeof directLat === 'number' && typeof directLng === 'number') {
    return { latitude: directLat, longitude: directLng };
  }

  if (suggestion.coordinates) {
    const { latitude, longitude, lat, lng } = suggestion.coordinates;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng };
    }
  }

  if (Array.isArray(suggestion.center) && suggestion.center.length >= 2) {
    return { latitude: suggestion.center[1], longitude: suggestion.center[0] };
  }

  if (Array.isArray(suggestion.geometry?.coordinates) && suggestion.geometry.coordinates.length >= 2) {
    return { latitude: suggestion.geometry.coordinates[1], longitude: suggestion.geometry.coordinates[0] };
  }

  const location = suggestion.geometry?.location || suggestion.location || suggestion.position;
  if (location) {
    const lat = location.lat ?? location.latitude;
    const lng = location.lng ?? location.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng };
    }
  }

  if (Array.isArray(suggestion.coordinates) && suggestion.coordinates.length >= 2) {
    return { latitude: suggestion.coordinates[1], longitude: suggestion.coordinates[0] };
  }

  return null;
}

export function applyDesignatedDriverMotoDiscount(
  breakdown: PriceBreakdown | null,
  enabled: boolean,
): PriceBreakdown | null {
  if (!enabled || !breakdown) {
    return breakdown;
  }

  // El descuento aplica únicamente a la variante conductor designado en moto
  if (breakdown.serviceCode !== 'designated_driver_moto') {
    return breakdown;
  }

  const discountedFinalPrice = Math.max(breakdown.finalPrice - DESIGNATED_DRIVER_MOTO_DISCOUNT, 0);
  return {
    ...breakdown,
    finalPrice: discountedFinalPrice,
    breakdown: breakdown.breakdown
      ? `${breakdown.breakdown}\nDescuento conductor designado (moto): -C$${DESIGNATED_DRIVER_MOTO_DISCOUNT.toFixed(2)}`
      : breakdown.breakdown,
  };
}
