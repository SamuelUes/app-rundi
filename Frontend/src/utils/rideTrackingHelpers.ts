import { extractVehicleTypeFromInfo } from './vehicleIcons';
import { haversineMeters } from './distance';

export { haversineMeters as haversineDistanceMeters };

export type LatLngPoint = { latitude: number; longitude: number };

const DEG_TO_RAD = Math.PI / 180;

const toRadians = (deg: number) => deg * DEG_TO_RAD;

export const computeDistanceMeters = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): number => {
  const earthRadius = 6371000;
  const dLat = toRadians(end.latitude - start.latitude);
  const dLon = toRadians(end.longitude - start.longitude);
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

export const calculatePolylineDistance = (coords: Array<{ latitude: number; longitude: number }>): number => {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += computeDistanceMeters(coords[i - 1], coords[i]);
  }
  return total;
};

export const isValidCoord = (coord: { latitude: number; longitude: number }): boolean =>
  typeof coord.latitude === 'number' &&
  typeof coord.longitude === 'number' &&
  Number.isFinite(coord.latitude) &&
  Number.isFinite(coord.longitude) &&
  coord.latitude >= -90 &&
  coord.latitude <= 90 &&
  coord.longitude >= -180 &&
  coord.longitude <= 180;

export const calculateRealRoute = async (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): Promise<Array<{ latitude: number; longitude: number }>> => {
  if (!isValidCoord(start) || !isValidCoord(end)) {
    console.warn('⚠️ Coordenadas inválidas para OSRM, usando ruta directa', { start, end });
    return [start, end];
  }

  if (start.latitude === end.latitude && start.longitude === end.longitude) {
    return [start, end];
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('⚠️ OSRM respondió estado no OK, usando ruta directa', {
        status: response.status,
        url,
      });
      return [start, end];
    }

    const data = await response.json();
    const coordinates: Array<[number, number]> = data?.routes?.[0]?.geometry?.coordinates ?? [];
    if (!coordinates.length) return [start, end];
    return coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch (error) {
    console.error('❌ Error de red al llamar OSRM, usando ruta directa', error);
    return [start, end];
  }
};

export const calculateMultiPointRoute = async (
  points: Array<{ latitude: number; longitude: number }>,
): Promise<{ route: Array<{ latitude: number; longitude: number }>; totalDistance: number }> => {
  if (points.length < 2) {
    return { route: [], totalDistance: 0 };
  }

  const combined: Array<{ latitude: number; longitude: number }> = [];
  let cumulativeDistance = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const segment = await calculateRealRoute(start, end);
    cumulativeDistance += calculatePolylineDistance(segment);

    segment.forEach((coord, index) => {
      if (i > 0 && index === 0) return;
      combined.push(coord);
    });
  }

  return { route: combined, totalDistance: cumulativeDistance };
};

export const parseDate = (value: any): Date | null => {
  if (!value) return null;
  try {
    if (typeof value === 'number') {
      return new Date(value);
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
      if (value._seconds) {
        return new Date(value._seconds * 1000);
      }
      if (value.seconds) {
        return new Date(value.seconds * 1000);
      }
    }
  } catch (error) {
    console.warn('⚠️ No se pudo parsear fecha', value, error);
  }
  return null;
};

export const formatDistanceLabel = (
  meters: number | null | undefined,
  tr: (path: string, options?: Record<string, any>) => string,
): string => {
  if (!meters || meters <= 0) return tr('labels.distanceFallback');
  const km = meters / 1000;
  const decimals = km >= 100 ? 0 : km >= 10 ? 1 : 2;
  return tr('labels.distanceValue', { value: km.toFixed(decimals) });
};

export const formatDurationLabel = (
  seconds: number | null | undefined,
  tr: (path: string, options?: Record<string, any>) => string,
): string => {
  if (!seconds || seconds <= 0) return tr('labels.durationFallback');
  const minutes = Math.max(1, Math.round(seconds / 60));
  return tr('labels.durationValue', { value: minutes });
};

export const formatEtaLabel = (
  rideData: any,
  durationSeconds: number | null,
  tr: (path: string, options?: Record<string, any>) => string,
): string => {
  const status = rideData?.status;

  if (status === 'pending_payment') return tr('eta.pendingPayment');
  if (status === 'completed') return tr('eta.completed');
  if (status === 'canceled') return tr('eta.canceled');

  const etaCandidates = [
    rideData?.estimatedArrivalTime,
    rideData?.estimatedArrival,
    rideData?.etaTime,
    rideData?.etaTimestamp,
    rideData?.driverEta?.arrivalTime,
    rideData?.arrivalAt,
  ];

  for (const candidate of etaCandidates) {
    const date = parseDate(candidate);
    if (date) {
      return tr('eta.arrivesAt', {
        time: date.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
  }

  if (durationSeconds && durationSeconds > 0) {
    const startDate =
      parseDate(rideData?.startedAt) ||
      parseDate(rideData?.acceptedAt) ||
      new Date();
    const etaDate = new Date(startDate.getTime() + durationSeconds * 1000);
    return tr('eta.arrivesAt', {
      time: etaDate.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  }

  if (rideData?.status === 'accepted') {
    return tr('eta.driverOnTheWay');
  }

  return tr('eta.calculating');
};

export const deriveVehicleType = (vehicleDataType: string | null, rideData: any): string | null => {
  if (vehicleDataType) return vehicleDataType;

  const rideVehicleType = extractVehicleTypeFromInfo({ vehicle: rideData?.vehicle, vehicleType: rideData?.vehicleType });
  if (rideVehicleType) return rideVehicleType;

  const driverVehicleType = extractVehicleTypeFromInfo(rideData?.driver);
  if (driverVehicleType) return driverVehicleType;

  return rideData?.vehicleType ?? null;
};

export const extractLatLng = (value: any): LatLngPoint | null => {
  if (!value) return null;
  const latitude = value.latitude ?? value.lat ?? value._latitude ?? null;
  const longitude = value.longitude ?? value.lng ?? value._longitude ?? null;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return { latitude, longitude };
  }
  return null;
};

export const computeTotalDistanceKm = (data: any): number | null => {
  const points: Array<{ lat: number; lng: number }> = [];
  if (data?.origin) points.push({ lat: data.origin.lat || data.origin.latitude, lng: data.origin.lng || data.origin.longitude });
  if (Array.isArray(data?.extraDestinations)) {
    for (const stop of data.extraDestinations) {
      const lat = stop?.lat || stop?.latitude;
      const lng = stop?.lng || stop?.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') points.push({ lat, lng });
    }
  }
  if (data?.destination) points.push({ lat: data.destination.lat || data.destination.latitude, lng: data.destination.lng || data.destination.longitude });
  if (points.length < 2) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    total += R * c;
  }
  return total;
};

export const buildOsrmUrl = (pts: Array<{ latitude: number; longitude: number }>): string => {
  const coordsStr = pts
    .map((p) => `${p.longitude},${p.latitude}`)
    .join(';');
  return `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
};

export const fetchOsrmRoute = async (
  points: Array<{ latitude: number; longitude: number }>,
): Promise<Array<{ latitude: number; longitude: number }>> => {
  if (points.length < 2) return [];
  try {
    const url = buildOsrmUrl(points);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates as Array<[number, number]> | undefined;
    if (!coords || coords.length === 0) throw new Error('No geometry');
    return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch {
    return points;
  }
};
