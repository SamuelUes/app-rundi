import { normalizeVehicleTypeForMatching } from '../services/ridesService';
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
}
