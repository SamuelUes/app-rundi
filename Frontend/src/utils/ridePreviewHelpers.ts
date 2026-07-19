import type { RideLocation, RidePreviewData } from '../hooks/driver/RidePreviewScreen/useRidePreviewData';
import { toNumberOrNull } from '../hooks/driver/RidePreviewScreen/useRidePreviewData';
import type { DriverOfferCacheEntry } from '../services/driverOfferCacheService';

export const formatCurrency = (
  value: number | null | undefined,
  t: (path: string, options?: Record<string, any>) => string,
): string => {
  if (value === undefined || value === null) {
    return t('driver.ridePreview.labels.notAvailable');
  }
  return t('driver.ridePreview.labels.currency', { amount: Math.round(value) });
};

export const calculateTotalDistanceKm = (
  ride: RidePreviewData,
): number | null => {
  const d = ride.estimatedDistance;
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
    return d > 50 ? d / 1000 : d;
  }
  const points: Array<{ lat: number; lng: number }> = [];
  if (ride.origin) points.push({ lat: ride.origin.lat, lng: ride.origin.lng });
  if (Array.isArray(ride.extraDestinations)) {
    ride.extraDestinations.forEach((s) => points.push({ lat: s.lat, lng: s.lng }));
  }
  if (ride.destination) points.push({ lat: ride.destination.lat, lng: ride.destination.lng });
  if (points.length < 2) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    sum += R * c;
  }
  return sum;
};

export const normalizeLocationForCache = (
  location: RideLocation | undefined | null,
): RideLocation => {
  const lat = toNumberOrNull(location?.lat) ?? 0;
  const lng = toNumberOrNull(location?.lng) ?? 0;
  return {
    lat,
    lng,
    address: location?.address,
  };
};

export const normalizeStopsForCache = (
  stops: RideLocation[] | undefined,
): Array<{ lat: number; lng: number; address?: string }> | undefined => {
  if (!Array.isArray(stops) || stops.length === 0) return undefined;
  const normalized: Array<{ lat: number; lng: number; address?: string }> = [];
  stops.forEach((stop: RideLocation) => {
    const lat = toNumberOrNull(stop?.lat);
    const lng = toNumberOrNull(stop?.lng);
    if (lat === null || lng === null) return;
    const entry: { lat: number; lng: number; address?: string } = { lat, lng };
    if (typeof stop?.address === 'string' && stop.address.trim().length > 0) {
      entry.address = stop.address;
    }
    normalized.push(entry);
  });
  return normalized.length > 0 ? normalized : undefined;
};

export const buildOfferCacheEntry = (
  currentRide: RidePreviewData,
  userId: string,
  resolvedClientName: string,
  overrides?: Partial<DriverOfferCacheEntry>,
): DriverOfferCacheEntry => ({
  rideId: currentRide.id,
  driverId: userId,
  clientId: currentRide.clientId,
  clientName: resolvedClientName,
  origin: normalizeLocationForCache(currentRide.origin),
  destination: normalizeLocationForCache(currentRide.destination),
  extraDestinations: normalizeStopsForCache(currentRide.extraDestinations),
  offeredPrice:
    overrides?.offeredPrice ??
    (typeof currentRide.driverOfferedPrice === 'number' ? currentRide.driverOfferedPrice : null),
  clientSuggestedPrice:
    typeof currentRide.clientSuggestedPrice === 'number' ? currentRide.clientSuggestedPrice : null,
  estimatedPrice: typeof currentRide.estimatedPrice === 'number' ? currentRide.estimatedPrice : null,
  estimatedDistance:
    overrides?.estimatedDistance ??
    (typeof currentRide.estimatedDistance === 'number' ? currentRide.estimatedDistance : null),
  estimatedDuration:
    overrides?.estimatedDuration ??
    (typeof currentRide.estimatedDuration === 'number' ? currentRide.estimatedDuration : null),
  paymentMethod: currentRide.paymentMethod ?? null,
  clientVehiclePhoto: currentRide.clientVehiclePhoto ?? null,
  rideType: currentRide.rideType ?? null,
  negotiationStatus: overrides?.negotiationStatus ?? currentRide.negotiationStatus ?? null,
  createdAt: Date.now(),
});

export const computeQuickSuggestions = (basePrice: number): number[] => {
  if (!basePrice) return [];
  const low = Math.max(50, Math.round(basePrice * 0.9));
  const mid = Math.round(basePrice);
  const high = Math.round(basePrice * 1.1);
  return Array.from(new Set([low, mid, high]));
};

export const computeFinalPricePreview = (
  counterOffer: string,
  currentRide: RidePreviewData,
  t: (path: string, options?: Record<string, any>) => string,
): string => {
  if (counterOffer) {
    const parsed = parseFloat(counterOffer);
    if (!Number.isNaN(parsed)) {
      return formatCurrency(parsed, t);
    }
  }
  const candidates: number[] = [];
  if (
    typeof currentRide.driverOfferedPrice === 'number' &&
    Number.isFinite(currentRide.driverOfferedPrice) &&
    currentRide.driverOfferedPrice > 0
  ) {
    candidates.push(currentRide.driverOfferedPrice);
  }
  if (
    typeof currentRide.clientSuggestedPrice === 'number' &&
    Number.isFinite(currentRide.clientSuggestedPrice) &&
    currentRide.clientSuggestedPrice > 0
  ) {
    candidates.push(currentRide.clientSuggestedPrice);
  }
  if (
    typeof currentRide.estimatedPrice === 'number' &&
    Number.isFinite(currentRide.estimatedPrice) &&
    currentRide.estimatedPrice > 0
  ) {
    candidates.push(currentRide.estimatedPrice);
  }
  const value = candidates.find((v) => v > 0) ?? currentRide.estimatedPrice;
  return formatCurrency(value || 0, t);
};
