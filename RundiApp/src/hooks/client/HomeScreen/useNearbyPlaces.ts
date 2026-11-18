import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import googleMapsService, { NearbyPlace } from '../../../services/map/googleMapsService';
import { zoomFromAltitudeRaw } from '../../shared/map/useMapCamera';
import { haversineMeters } from '../../../utils/geo/distance';

type Point = { latitude: number; longitude: number };
type Viewport = Point & { zoom?: number };

const distance = (a: Point, b: Point) =>
  haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);

export function useNearbyPlaces(center: Point, active = true) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const cacheRef = useRef<{ center: Point; places: NearbyPlace[]; time: number } | null>(null);
  const requestRef = useRef<{ center: Point; promise: Promise<NearbyPlace[]> } | null>(null);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    generationRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (active) return;
    generationRef.current++;
    enabledRef.current = false;
    setEnabled(false);
    setPlaces([]);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [active]);

  const updateViewport = useCallback((viewport: Viewport) => {
    // The existing map's closest zoom corresponds to an approximate 70 m altitude.
    const closeEnough = active && typeof viewport.zoom === 'number' &&
      viewport.zoom >= zoomFromAltitudeRaw(85, viewport.latitude);
    enabledRef.current = closeEnough;
    setEnabled(closeEnough);
    const generation = ++generationRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!closeEnough) {
      setPlaces([]);
      return;
    }
    const cache = cacheRef.current;
    if (cache && Date.now() - cache.time < 30000 && distance(cache.center, viewport) < 30) {
      setPlaces(cache.places);
      return;
    }
    setPlaces([]);
    timerRef.current = setTimeout(() => {
      const point = { latitude: viewport.latitude, longitude: viewport.longitude };
      const promise = googleMapsService.getNearbyPlaces(point);
      requestRef.current = { center: point, promise };
      void promise.then((results) => {
        if (generation !== generationRef.current) return;
        cacheRef.current = { center: point, places: results, time: Date.now() };
        setPlaces(results);
      });
    }, 250);
  }, [active]);

  const resolveSnap = useCallback(async (point: Point): Promise<NearbyPlace | null> => {
    if (!enabledRef.current) return null;
    const cache = cacheRef.current;
    const validCache = cache && Date.now() - cache.time < 30000 && distance(cache.center, point) < 30;
    let candidates = validCache ? cache.places : [];
    const request = requestRef.current;
    if (!validCache && request && distance(request.center, point) < 1) {
      candidates = await Promise.race([
        request.promise,
        new Promise<NearbyPlace[]>((resolve) => setTimeout(() => resolve([]), 1200)),
      ]);
    }
    if (!enabledRef.current) return null;
    let closest: NearbyPlace | null = null;
    let closestDistance = 10;
    for (const place of candidates) {
      const meters = distance(point, place);
      if (meters <= closestDistance) {
        closest = place;
        closestDistance = meters;
      }
    }
    return closest;
  }, []);

  const visiblePlaces = useMemo(
    () => enabled ? places.filter((place) => distance(center, place) <= 100) : [],
    [center.latitude, center.longitude, enabled, places],
  );

  return { visiblePlaces, updateViewport, resolveSnap };
}
