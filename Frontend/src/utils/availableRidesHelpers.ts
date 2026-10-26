import {
  normalizeVehicleTypeForMatching,
  extractRideVehicleTypeForMatching,
} from '../services/ridesService';
export { haversineKm } from './distance';

export type RawLocation =
  | { lat?: number; lng?: number; address?: string }
  | { latitude?: number; longitude?: number; address?: string }
  | { coords?: { latitude?: number; longitude?: number; address?: string }; address?: string }
  | undefined
  | null;

export const DEFAULT_COORDINATE: { lat: number; lng: number } = { lat: 0, lng: 0 };

export const normalizeOptionalText = (value: any): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const parseCoordinate = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const normalizeLocation = (
  raw: RawLocation,
  fallbackLatValues: any[] = [],
  fallbackLngValues: any[] = [],
  fallbackAddress?: string,
): { lat: number; lng: number; address?: string } => {
  let lat: number | null = null;
  let lng: number | null = null;
  let address: string | undefined = fallbackAddress;

  if (raw && typeof raw === 'object') {
    if ('coords' in raw && raw.coords) {
      lat = parseCoordinate(raw.coords?.latitude);
      lng = parseCoordinate(raw.coords?.longitude);
      address = raw.address ?? address;
    } else {
      lat = parseCoordinate((raw as any).lat ?? (raw as any).latitude);
      lng = parseCoordinate((raw as any).lng ?? (raw as any).longitude);
      address = (raw as any).address ?? address;
    }
  }

  if (lat === null) {
    for (const candidate of fallbackLatValues) {
      const parsed = parseCoordinate(candidate);
      if (parsed !== null) {
        lat = parsed;
        break;
      }
    }
  }

  if (lng === null) {
    for (const candidate of fallbackLngValues) {
      const parsed = parseCoordinate(candidate);
      if (parsed !== null) {
        lng = parsed;
        break;
      }
    }
  }

  return {
    lat: lat ?? DEFAULT_COORDINATE.lat,
    lng: lng ?? DEFAULT_COORDINATE.lng,
    address,
  };
};

export const normalizeStops = (stops: any[] | undefined | null): Array<{ lat: number; lng: number; address?: string }> => {
  if (!Array.isArray(stops) || stops.length === 0) {
    return [];
  }

  return stops
    .map((stop) =>
      normalizeLocation(stop as RawLocation, [stop?.lat, stop?.latitude], [stop?.lng, stop?.longitude], stop?.address),
    )
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
};

const DESIGNATED_RIDE_SYNONYMS = new Set([
  'designated_driver',
  'designated-driver',
  'designateddriver',
  'conductor_designado',
  'conductor-designado',
]);

export const isDesignatedRideRequest = (rideLike: any): boolean => {
  const rideType = String(rideLike?.rideType ?? rideLike?.ride_type ?? '')
    .trim()
    .toLowerCase();
  if (DESIGNATED_RIDE_SYNONYMS.has(rideType)) {
    return true;
  }
  const vehicleType = String(rideLike?.vehicleType ?? rideLike?.vehicle_type ?? '')
    .trim()
    .toLowerCase();
  return DESIGNATED_RIDE_SYNONYMS.has(vehicleType);
};

/**
 * Réplica de `checkVehicleCompatibility` del backend (rides_sequelize.ts) para
 * que el filtrado client-side de viajes disponibles muestre solo viajes que el
 * conductor realmente puede aceptar.
 */
export const checkRideDriverCompatibility = (
  rideLike: any,
  driverVehicleType: 'moto' | 'auto' | null,
  driverIsDesignatedMode: boolean,
): { ok: boolean; reason?: string } => {
  const driverType = driverVehicleType === 'moto' ? 'moto' : 'auto';
  const rideVehicleType = extractRideVehicleTypeForMatching(rideLike);

  if (isDesignatedRideRequest(rideLike)) {
    if (!driverIsDesignatedMode) {
      return { ok: false, reason: 'designated_mode_required' };
    }
    if (rideVehicleType && driverType !== rideVehicleType) {
      return { ok: false, reason: 'designated_vehicle_mismatch' };
    }
    return { ok: true };
  }

  if (rideVehicleType === 'moto') {
    return driverType === 'moto'
      ? { ok: true }
      : { ok: false, reason: 'moto_vehicle_required' };
  }

  if (driverType === 'moto') {
    return { ok: false, reason: 'auto_vehicle_required' };
  }

  return { ok: true };
};

interface RideRejectionSnapshot {
  clientSuggestedPriceAtRejection?: number | null;
  estimatedPriceAtRejection?: number | null;
}

/**
 * Un viaje rechazado vuelve a ser visible solo si el precio relevante cambió
 * desde el rechazo (misma semántica que proximityService.hasPriceChangedForDriver).
 */
export const shouldShowRejectedRide = (
  rejections: Record<string, RideRejectionSnapshot> | undefined | null,
  driverId: string | undefined,
  currentClientSuggestedPrice: number | null,
  currentEstimatedPrice: number | null,
): boolean => {
  if (!driverId) {
    return true;
  }
  const rejection = rejections?.[driverId];
  if (!rejection) {
    return true;
  }

  const savedSuggested = rejection.clientSuggestedPriceAtRejection ?? null;
  const savedEstimated = rejection.estimatedPriceAtRejection ?? null;

  const sameSuggested =
    (currentClientSuggestedPrice === null && savedSuggested === null) ||
    Number(currentClientSuggestedPrice) === Number(savedSuggested);
  const sameEstimated =
    (currentEstimatedPrice === null && savedEstimated === null) ||
    Number(currentEstimatedPrice) === Number(savedEstimated);

  return !(sameSuggested && sameEstimated);
};

export const extractProgrammedRideId = (input: string): string | null => {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const uuidRegex =
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
  const uuidMatch = trimmed.match(uuidRegex);
  if (uuidMatch && uuidMatch[0]) {
    return uuidMatch[0].toLowerCase();
  }

  const genericMatch = trimmed.match(/[A-Za-z0-9_-]{10,}/g);
  if (genericMatch && genericMatch.length) {
    return genericMatch[genericMatch.length - 1];
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
};

export const resolveSelectedDriverVehicleType = (driverInfo: any): 'moto' | 'auto' | null => {
  if (!driverInfo || typeof driverInfo !== 'object') {
    return null;
  }

  const selectedVehicleId =
    (typeof driverInfo.vehicle === 'string' ? driverInfo.vehicle : null) ??
    driverInfo?.vehicle?.id ??
    driverInfo?.activeVehicle?.id ??
    null;

  const candidateTypes: Array<string | null | undefined> = [
    driverInfo?.currentVehicle?.type,
    driverInfo?.activeVehicle?.type,
    driverInfo?.vehicle?.type,
    driverInfo?.vehicleType,
    driverInfo?.active_vehicle?.type,
  ];

  if (selectedVehicleId && Array.isArray(driverInfo?.vehicles)) {
    const selectedVehicle = driverInfo.vehicles.find(
      (vehicle: any) => String(vehicle?.id ?? '') === String(selectedVehicleId),
    );
    candidateTypes.push(selectedVehicle?.type);
  } else if (selectedVehicleId && driverInfo?.vehicles && typeof driverInfo.vehicles === 'object') {
    const selectedVehicle = Object.values<any>(driverInfo.vehicles).find(
      (vehicle: any) => String(vehicle?.id ?? '') === String(selectedVehicleId),
    );
    candidateTypes.push(selectedVehicle?.type);
  }

  if (Array.isArray(driverInfo?.vehicles)) {
    const activeVehicle = driverInfo.vehicles.find((vehicle: any) => vehicle?.is_active || vehicle?.isActive);
    candidateTypes.push(activeVehicle?.type);
  } else if (driverInfo?.vehicles && typeof driverInfo.vehicles === 'object') {
    const activeVehicle = Object.values<any>(driverInfo.vehicles).find(
      (vehicle: any) => vehicle?.is_active || vehicle?.isActive,
    );
    candidateTypes.push(activeVehicle?.type);
  }

  for (const candidate of candidateTypes) {
    const normalized = normalizeVehicleTypeForMatching(candidate ?? null);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

export interface Ride {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  client?: { name?: string | null; phone?: string | null; rating?: number; photoUrl?: string | null };
  origin: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  status: string;
  clientSuggestedPrice?: number;
  dynamicMinimumFare?: number | null;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  passengers?: number;
  rideType?: string;
  vehicleType?: string;
  paymentMethod?: 'cash' | 'card';
  createdAt?: string | number;
  requestedAt: number;
  extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
  clientVehiclePhoto?: string | null;
  clientComment?: string;
  distanceToOriginKm?: number;
  isProgrammed?: boolean;
  scheduledAt?: number | null;
  clientConfirmed?: boolean;
  driverConfirmed?: boolean;
  driverConfirmationRequestedAt?: number | null;
}
