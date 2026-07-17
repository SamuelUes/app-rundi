import { useCallback, useMemo, useRef } from 'react';
import { LatLng } from 'react-native-maps';
import { coordsAreClose, toLatLng, isValidCoord, clampValue } from './useMapCamera';
import { VEHICLE_ICON_BASE_SIZE } from '../constants/mapIcons';

export function normalizeHeading(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function shortestAngularDifference(from: number, to: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return diff;
}

function toHeading(from: LatLng, to: LatLng): number {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const lat1 = from.latitude * toRad;
  const lat2 = to.latitude * toRad;
  const dLon = (to.longitude - from.longitude) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeHeading(Math.atan2(y, x) * toDeg);
}

function distanceToSegment(
  point: LatLng,
  segStart: LatLng,
  segEnd: LatLng,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(segStart.latitude);
  const lon1 = toRad(segStart.longitude);
  const lat2 = toRad(segEnd.latitude);
  const lon2 = toRad(segEnd.longitude);
  const latP = toRad(point.latitude);
  const lonP = toRad(point.longitude);
  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const dxP = lonP - lon1;
  const dyP = latP - lat1;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1e-12) {
    const dLat = latP - lat1;
    const dLon = lonP - lon1;
    return R * Math.sqrt(dLat * dLat + dLon * dLon);
  }
  const t = Math.max(0, Math.min(1, (dxP * dx + dyP * dy) / segLenSq));
  const projLat = lat1 + t * dy;
  const projLon = lon1 + t * dx;
  const dLat = latP - projLat;
  const dLon = lonP - projLon;
  return R * Math.sqrt(dLat * dLat + dLon * dLon);
}

export function headingToCardinal(heading: number): string {
  const normalized = normalizeHeading(heading);
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}

export interface DriverMarker {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleIconSource?: any;
  isSelected?: boolean;
  rating?: number | null;
  photoURL?: string | null;
}

export interface MarkerHeadingApi {
  resolvedMarkerHeading: number | undefined;
  resolveDriverHeading: (driver: DriverMarker) => number;
  getVehicleScaleForZoom: (zoom: number) => number;
  getVehicleIconSizeForZoom: (zoom: number) => number;
}

export function useMarkerHeading(
  markerPositionLatLng: LatLng | null,
  markerVehicleHeading: number | undefined,
  effectiveMarkerType: string,
  routeCoordinates: Array<{ latitude: number; longitude: number }>,
  baseVehicleZoom: number,
): MarkerHeadingApi {
  const markerHeadingCacheRef = useRef<{ coord: LatLng | null; heading: number | null }>({
    coord: null,
    heading: typeof markerVehicleHeading === 'number' ? normalizeHeading(markerVehicleHeading) : null,
  });
  const markerHeadingSmoothRef = useRef<number | null>(null);
  const driverHeadingCacheRef = useRef<Record<string, { coord: LatLng; heading: number }>>({});

  const applyHeadingSmoothing = useCallback(
    (candidate?: number, speed?: number): number | undefined => {
      if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        return markerHeadingSmoothRef.current ?? undefined;
      }
      const normalizedCandidate = normalizeHeading(candidate);
      const last = markerHeadingSmoothRef.current;
      if (typeof speed === 'number' && speed < 1.5) {
        return last ?? normalizedCandidate;
      }
      if (last == null) {
        markerHeadingSmoothRef.current = normalizedCandidate;
        return normalizedCandidate;
      }
      const diff = shortestAngularDifference(last, normalizedCandidate);
      const absDiff = Math.abs(diff);
      if (absDiff >= 120) {
        markerHeadingSmoothRef.current = normalizedCandidate;
        return normalizedCandidate;
      }
      if (absDiff <= 5) {
        markerHeadingSmoothRef.current = normalizedCandidate;
        return normalizedCandidate;
      }
      let smoothingFactor = 0.38;
      if (typeof speed === 'number') {
        if (speed > 10) smoothingFactor = 0.65;
        else if (speed < 2) smoothingFactor = 0.20;
      }
      const smoothed = normalizeHeading(last + diff * smoothingFactor);
      markerHeadingSmoothRef.current = smoothed;
      return smoothed;
    },
    [],
  );

  const routeHeadingAtMarker = useMemo(() => {
    if (!markerPositionLatLng || routeCoordinates.length < 2) return undefined;
    const markerLatRad = markerPositionLatLng.latitude * (Math.PI / 180);
    const markerLonRad = markerPositionLatLng.longitude * (Math.PI / 180);
    const cosMarkerLat = Math.cos(markerLatRad);
    const toXY = (coord: LatLng) => {
      const latRad = coord.latitude * (Math.PI / 180);
      const lonRad = coord.longitude * (Math.PI / 180);
      return {
        x: (lonRad - markerLonRad) * cosMarkerLat,
        y: latRad - markerLatRad,
      };
    };
    const validRoute = routeCoordinates.filter(isValidCoord).map(toLatLng);
    if (validRoute.length < 2) return undefined;
    let bestHeading: number | undefined;
    let bestDistSq = Number.POSITIVE_INFINITY;
    let bestSegment: { start: LatLng; end: LatLng } | null = null;
    for (let i = 0; i < validRoute.length - 1; i += 1) {
      const start = validRoute[i];
      const end = validRoute[i + 1];
      if (!start || !end) continue;
      const startVec = toXY(start);
      const endVec = toXY(end);
      const segVec = { x: endVec.x - startVec.x, y: endVec.y - startVec.y };
      const segLenSq = segVec.x * segVec.x + segVec.y * segVec.y;
      if (segLenSq < 1e-12) continue;
      const markerVec = { x: 0, y: 0 };
      const tNumerator = (markerVec.x - startVec.x) * segVec.x + (markerVec.y - startVec.y) * segVec.y;
      const t = Math.min(1, Math.max(0, tNumerator / segLenSq));
      const closestPoint = {
        x: startVec.x + segVec.x * t,
        y: startVec.y + segVec.y * t,
      };
      const distSq = closestPoint.x * closestPoint.x + closestPoint.y * closestPoint.y;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestHeading = normalizeHeading(toHeading(start, end));
        bestSegment = { start, end };
      }
    }
    if (bestSegment) {
      const distMeters = distanceToSegment(markerPositionLatLng, bestSegment.start, bestSegment.end);
      const MAX_SNAP_DISTANCE = 30;
      if (distMeters <= MAX_SNAP_DISTANCE) return bestHeading;
    }
    return undefined;
  }, [markerPositionLatLng, routeCoordinates]);

  const resolvedMarkerHeading = useMemo(() => {
    if (effectiveMarkerType !== 'car') {
      markerHeadingCacheRef.current = { coord: markerPositionLatLng ?? null, heading: null };
      markerHeadingSmoothRef.current = null;
      return undefined;
    }
    const incoming = markerVehicleHeading;
    const speed = undefined;
    if (!markerPositionLatLng) {
      const normalized = typeof incoming === 'number' && Number.isFinite(incoming)
        ? normalizeHeading(incoming)
        : null;
      markerHeadingCacheRef.current = { coord: null, heading: normalized };
      const smoothed = applyHeadingSmoothing(normalized ?? undefined, speed);
      return smoothed ?? undefined;
    }
    let candidate: number | undefined;
    if (typeof incoming === 'number' && Number.isFinite(incoming)) {
      candidate = normalizeHeading(incoming);
    } else if (typeof routeHeadingAtMarker === 'number' && Number.isFinite(routeHeadingAtMarker)) {
      candidate = normalizeHeading(routeHeadingAtMarker);
    } else {
      const cache = markerHeadingCacheRef.current;
      if (cache.coord && !coordsAreClose(cache.coord, markerPositionLatLng)) {
        candidate = normalizeHeading(toHeading(cache.coord, markerPositionLatLng));
      } else if (typeof cache.heading === 'number') {
        candidate = normalizeHeading(cache.heading);
      }
    }
    const smoothed = applyHeadingSmoothing(candidate, speed);
    const headingToPersist = smoothed ?? candidate ?? markerHeadingCacheRef.current.heading ?? null;
    markerHeadingCacheRef.current = { coord: markerPositionLatLng, heading: headingToPersist };
    return smoothed ?? candidate ?? undefined;
  }, [markerPositionLatLng, markerVehicleHeading, effectiveMarkerType, routeHeadingAtMarker, applyHeadingSmoothing]);

  const resolveDriverHeading = useCallback(
    (driver: DriverMarker): number => {
      const coord = toLatLng(driver);
      if (typeof driver.heading === 'number' && Number.isFinite(driver.heading)) {
        const normalized = normalizeHeading(driver.heading);
        driverHeadingCacheRef.current[driver.id] = { coord, heading: normalized };
        return normalized;
      }
      const cached = driverHeadingCacheRef.current[driver.id];
      if (cached && !coordsAreClose(cached.coord, coord)) {
        const derived = toHeading(cached.coord, coord);
        driverHeadingCacheRef.current[driver.id] = { coord, heading: derived };
        return derived;
      }
      const fallback = cached?.heading ?? 0;
      driverHeadingCacheRef.current[driver.id] = { coord, heading: fallback };
      return fallback;
    },
    [],
  );

  const getVehicleScaleForZoom = useCallback(
    (zoom: number): number => {
      if (!Number.isFinite(zoom)) return 1;
      if (zoom >= baseVehicleZoom) return 1;
      const zoomDiff = zoom - baseVehicleZoom;
      const scale = Math.pow(2, zoomDiff / 2);
      return clampValue(scale, 0.1, 1);
    },
    [baseVehicleZoom],
  );

  const getVehicleIconSizeForZoom = useCallback(
    (zoom: number): number => {
      const scale = getVehicleScaleForZoom(zoom);
      return Math.max(8, Math.round(VEHICLE_ICON_BASE_SIZE * scale));
    },
    [getVehicleScaleForZoom],
  );

  return {
    resolvedMarkerHeading,
    resolveDriverHeading,
    getVehicleScaleForZoom,
    getVehicleIconSizeForZoom,
  };
}
