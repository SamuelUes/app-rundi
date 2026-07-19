import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import MapView, { LatLng, Region, Camera } from 'react-native-maps';

const DEFAULT_ALTITUDE = 140;
const MIN_ALTITUDE = 70;
const MAX_ALTITUDE = 1000;
const EARTH_CIRCUMFERENCE = 40075016.686;
const GOOGLE_MIN_ZOOM = 2;
const GOOGLE_MAX_ZOOM = 22;

export const clampValue = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const altitudeFromZoom = (zoom: number, latitude: number) => {
  const radians = latitude * (Math.PI / 180);
  const cosLat = Math.max(Math.cos(radians), 1e-6);
  const safeZoom = Number.isFinite(zoom) ? zoom : GOOGLE_MIN_ZOOM;
  const power = Math.pow(2, safeZoom);
  return (EARTH_CIRCUMFERENCE * cosLat) / Math.max(power, 1);
};

export const zoomFromAltitudeRaw = (altitude: number, latitude: number) => {
  const radians = latitude * (Math.PI / 180);
  const cosLat = Math.max(Math.cos(radians), 1e-6);
  const safeAltitude = Math.max(altitude, 0.1);
  return Math.log2((EARTH_CIRCUMFERENCE * cosLat) / safeAltitude);
};

export const resolveZoomForAltitude = (altitude: number, latitude: number) => {
  const safeLatitude = Number.isFinite(latitude) ? latitude : 0;
  const clampedAltitude = clampValue(altitude, MIN_ALTITUDE, MAX_ALTITUDE);
  let zoom = zoomFromAltitudeRaw(clampedAltitude, safeLatitude);
  zoom = clampValue(zoom, GOOGLE_MIN_ZOOM, GOOGLE_MAX_ZOOM);
  const adjustedAltitude = clampValue(altitudeFromZoom(zoom, safeLatitude), MIN_ALTITUDE, MAX_ALTITUDE);
  return { altitude: adjustedAltitude, zoom };
};

export function isValidCoord(value: any): value is { latitude: number; longitude: number } {
  if (!value) return false;
  const { latitude: lat, longitude: lng } = value;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

export function toLatLng(coord: { latitude: number; longitude: number }): LatLng {
  return { latitude: coord.latitude, longitude: coord.longitude };
}

export function coordsAreClose(
  a?: { latitude: number; longitude: number } | LatLng | null,
  b?: { latitude: number; longitude: number } | LatLng | null,
  epsilon: number = 0.00001,
): boolean {
  if (!a || !b) return false;
  const latDiff = Math.abs(a.latitude - b.latitude);
  const lngDiff = Math.abs(a.longitude - b.longitude);
  return latDiff <= epsilon && lngDiff <= epsilon;
}

export function toMarkerImageSource(source?: any): number | { uri: string } | undefined {
  if (!source) return undefined;
  if (Array.isArray(source)) return toMarkerImageSource(source[0]);
  if (typeof source === 'number') return source;
  if (typeof source === 'object' && source && 'uri' in source && typeof (source as any).uri === 'string') {
    return { uri: (source as any).uri };
  }
  return undefined;
}

export interface MapCameraApi {
  mapRef: React.RefObject<MapView | null>;
  currentZoom: number;
  isMapReady: boolean;
  setCurrentZoom: React.Dispatch<React.SetStateAction<number>>;
  defaultCameraSettings: { altitude: number; zoom: number };
  minZoomLevel: number;
  maxZoomLevel: number;
  lastCameraAltitudeRef: React.MutableRefObject<number>;
  gestureActiveRef: React.MutableRefObject<boolean>;
  applyCamera: (camera: { center?: LatLng; altitudeMeters?: number; heading?: number; pitch?: number }, duration?: number) => void;
  updateAltitudeFromCamera: () => Promise<number | undefined>;
  animateCameraToCoordinate: (coord: LatLng, duration?: number) => void;
  handleRegionChange: (region: Region) => void;
  handleRegionChangeComplete: (region: Region) => Promise<void>;
  handleMapReady: () => void;
  markGestureActive: () => void;
}

export function useMapCamera(
  latitude: number,
  longitude: number,
  onRegionChangeCenter?: (center: { latitude: number; longitude: number; altitude?: number }) => void,
  onRegionChangeCompleteCenter?: (center: { latitude: number; longitude: number; altitude?: number }) => void,
): MapCameraApi {
  const mapRef = useRef<MapView>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(() => {
    const initial = resolveZoomForAltitude(DEFAULT_ALTITUDE, latitude).zoom;
    return Number.isFinite(initial) ? initial : 15;
  });

  const defaultCameraSettings = useMemo(() => resolveZoomForAltitude(DEFAULT_ALTITUDE, latitude), [latitude]);
  const minZoomSettings = useMemo(() => resolveZoomForAltitude(MIN_ALTITUDE, latitude), [latitude]);
  const maxZoomSettings = useMemo(() => resolveZoomForAltitude(MAX_ALTITUDE, latitude), [latitude]);
  const minZoomLevel = useMemo(() => Math.min(minZoomSettings.zoom, maxZoomSettings.zoom), [minZoomSettings.zoom, maxZoomSettings.zoom]);
  const maxZoomLevel = useMemo(() => Math.max(minZoomSettings.zoom, maxZoomSettings.zoom), [maxZoomSettings.zoom, minZoomSettings.zoom]);

  const lastCameraAltitudeRef = useRef<number>(defaultCameraSettings.altitude);
  const gestureActiveRef = useRef(false);
  const gestureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lastCameraAltitudeRef.current = defaultCameraSettings.altitude;
  }, [defaultCameraSettings.altitude]);

  useEffect(() => () => {
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
  }, []);

  const markGestureActive = useCallback(() => {
    gestureActiveRef.current = true;
    if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
    gestureTimeoutRef.current = setTimeout(() => {
      gestureActiveRef.current = false;
    }, 250);
  }, []);

  const updateAltitudeFromCamera = useCallback(async (): Promise<number | undefined> => {
    if (!isMapReady) return lastCameraAltitudeRef.current;
    const map = mapRef.current as any;
    if (!map || typeof map.getCamera !== 'function') return lastCameraAltitudeRef.current;
    try {
      const camera = await map.getCamera();
      if (camera && typeof camera.altitude === 'number') {
        const clamped = clampValue(camera.altitude, MIN_ALTITUDE, MAX_ALTITUDE);
        lastCameraAltitudeRef.current = clamped;
        return clamped;
      }
    } catch (error) {
      console.warn('[useMapCamera] No se pudo obtener la cámara:', error);
    }
    return lastCameraAltitudeRef.current;
  }, [isMapReady]);

  const applyCamera = useCallback(
    (
      camera: {
        center?: LatLng;
        altitudeMeters?: number;
        heading?: number;
        pitch?: number;
      } = {},
      duration: number = 220,
    ) => {
      const map = mapRef.current;
      if (!map) return;
      const fallbackCenter = isValidCoord({ latitude, longitude })
        ? { latitude, longitude }
        : { latitude: 0, longitude: 0 };
      const center = camera.center && isValidCoord(camera.center) ? camera.center : fallbackCenter;
      const altitudeBase = camera.altitudeMeters ?? lastCameraAltitudeRef.current ?? defaultCameraSettings.altitude;
      const { zoom, altitude } = resolveZoomForAltitude(altitudeBase, center.latitude);
      const payload: Camera = {
        center,
        pitch: camera.pitch ?? 0,
        heading: camera.heading ?? 0,
        altitude,
        zoom,
      };
      if (typeof map.animateCamera === 'function') {
        map.animateCamera(payload, { duration });
      }
      lastCameraAltitudeRef.current = altitude;
    },
    [defaultCameraSettings.altitude, latitude, longitude],
  );

  const animateCameraToCoordinate = useCallback(
    (coord: LatLng, duration: number = 220) => {
      if (!isValidCoord(coord)) return;
      applyCamera({ center: coord, altitudeMeters: lastCameraAltitudeRef.current }, duration);
    },
    [applyCamera],
  );

  const handleRegionChange = useCallback(
    (region: Region) => {
      markGestureActive();
      if (onRegionChangeCenter) {
        onRegionChangeCenter({ latitude: region.latitude, longitude: region.longitude, altitude: lastCameraAltitudeRef.current });
      }
    },
    [markGestureActive, onRegionChangeCenter],
  );

  const handleRegionChangeComplete = useCallback(
    async (region: Region) => {
      markGestureActive();
      const altitude = (await updateAltitudeFromCamera()) ?? lastCameraAltitudeRef.current;
      if (onRegionChangeCompleteCenter) {
        onRegionChangeCompleteCenter({ latitude: region.latitude, longitude: region.longitude, altitude });
      }
    },
    [markGestureActive, updateAltitudeFromCamera, onRegionChangeCompleteCenter],
  );

  const handleMapReady = useCallback(() => {
    setIsMapReady(true);
  }, []);

  useEffect(() => {
    if (!isMapReady) return;
    const map = mapRef.current;
    if (!map || typeof map.getCamera !== 'function') return;
    (async () => {
      try {
        const camera = await map.getCamera();
        if (camera && typeof camera.zoom === 'number') {
          setCurrentZoom(camera.zoom);
        }
      } catch {
        // ignore
      }
    })();
  }, [isMapReady]);

  return {
    mapRef,
    currentZoom,
    isMapReady,
    setCurrentZoom,
    defaultCameraSettings,
    minZoomLevel,
    maxZoomLevel,
    lastCameraAltitudeRef,
    gestureActiveRef,
    applyCamera,
    updateAltitudeFromCamera,
    animateCameraToCoordinate,
    handleRegionChange,
    handleRegionChangeComplete,
    handleMapReady,
    markGestureActive,
  };
}
