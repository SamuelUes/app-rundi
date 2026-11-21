import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import googleMapsService, { NearbyPlace } from '../../../services/map/googleMapsService';
import { zoomFromAltitudeRaw } from '../../shared/map/useMapCamera';
import { haversineMeters } from '../../../utils/geo/distance';

type Point = { latitude: number; longitude: number };
type Viewport = Point & { zoom?: number };

const distance = (a: Point, b: Point) =>
  haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);

export function findSnapCandidate(point: Point, places: NearbyPlace[]): NearbyPlace | null {
  let closest: NearbyPlace | null = null;
  let closestDistance = 10;
  for (const place of places) {
    const meters = distance(point, place);
    if (meters <= closestDistance) {
      closest = place;
      closestDistance = meters;
    }
  }
  return closest;
}

export function useNearbyPlaces(center: Point, active = true) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const cacheRef = useRef<{ center: Point; places: NearbyPlace[]; time: number } | null>(null);
  const visiblePlacesRef = useRef<NearbyPlace[]>([]);
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
    // This is a zoom-derived scale, not the camera's physical height.
    const closeEnough = active && typeof viewport.zoom === 'number' &&
      viewport.zoom >= zoomFromAltitudeRaw(250, viewport.latitude);
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
      void promise.then((results) => {
        if (generation !== generationRef.current) return;
        cacheRef.current = { center: point, places: results, time: Date.now() };
        setPlaces(results);
      });
    }, 250);
  }, [active]);

  const resolveSnap = useCallback(async (point: Point): Promise<NearbyPlace | null> => {
    if (!enabledRef.current) return null;
    return findSnapCandidate(point, visiblePlacesRef.current);
  }, []);

  const visiblePlaces = useMemo(
    () => enabled ? places.filter((place) => distance(center, place) <= 100).slice(0, 6) : [],
    [center.latitude, center.longitude, enabled, places],
  );

  useEffect(() => {
    visiblePlacesRef.current = visiblePlaces;
  }, [visiblePlaces]);

  const candidatePlaceId = useMemo(
    () => findSnapCandidate(center, visiblePlaces)?.id ?? null,
    [center.latitude, center.longitude, visiblePlaces],
  );

  return { visiblePlaces, candidatePlaceId, updateViewport, resolveSnap };
}
