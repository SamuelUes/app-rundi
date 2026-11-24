// Motor turn-by-turn: snap a ruta, paso actual, off-route con histeresis,
// reroute con cooldown, heading suavizado y ETA por pasos restantes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOsrmNavRoute } from '../../../utils/navigation/osrmNavRoute';
import type { NavRoute, NavStep } from '../../../utils/navigation/osrmNavRoute';
import {
  bearingDegrees,
  blendHeading,
  snapToRoute,
} from '../../../utils/navigation/routeSnapper';
import type { RoutePoint } from '../../../utils/navigation/routeSnapper';
import {
  maneuverFallbackEs,
  maneuverIcon,
  maneuverTextKey,
} from '../../../utils/navigation/maneuverIcons';
import type { NavIconName } from '../../../utils/navigation/maneuverIcons';

export interface NavGpsSample {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}

export type TurnByTurnStatus =
  | 'idle'
  | 'loading'
  | 'navigating'
  | 'rerouting'
  | 'arrived'
  | 'unavailable';

export interface NavVoiceCue {
  kind: 'approach' | 'now' | 'arrived' | 'rerouted';
  /** Índice del paso objetivo (-1 en cues sin paso, ej. rerouted). */
  stepIndex: number;
  step?: NavStep;
  distanceM: number;
}

export interface TurnByTurnBanner {
  icon: NavIconName;
  textKey: string;
  fallback: string;
  streetName: string;
  distanceM: number;
  thenIcon?: NavIconName;
  thenFallback?: string;
}

export interface TurnByTurnCamera {
  latitude: number;
  longitude: number;
  heading: number;
  pitch: number;
  zoom: number;
}

export interface TurnByTurnState {
  status: TurnByTurnStatus;
  banner: TurnByTurnBanner | null;
  camera: TurnByTurnCamera | null;
  remainingDistanceM: number;
  remainingDurationSec: number;
  speedKmh: number | null;
  offRoute: boolean;
  route: NavRoute | null;
}

interface UseTurnByTurnOptions {
  active: boolean;
  coords?: NavGpsSample | null;
  /** Siguiente objetivo: navTarget ya calculado en la pantalla. */
  target: RoutePoint | null;
  /** Paradas restantes entre la posición actual y target. */
  viaPoints?: RoutePoint[];
  onVoiceCue?: (cue: NavVoiceCue) => void;
  pitch?: number;
  zoom?: number;
}

const OFF_ROUTE_ENTER_M = 45;
const OFF_ROUTE_EXIT_M = 18;
const OFF_ROUTE_MIN_SAMPLES = 2;
const REROUTE_COOLDOWN_MS = 15000;
const MAX_ACCURACY_FOR_OFFROUTE_M = 60;
const ANNOUNCE_APPROACH_M = 150;
const ANNOUNCE_NOW_M = 45;
const ARRIVE_RADIUS_M = 30;
const HEADING_EMA_ALPHA = 0.35;
const MIN_GPS_HEADING_SPEED_MS = 2.5;
const THEN_MAX_STEP_M = 120;
const DEFAULT_PITCH = 52;
const DEFAULT_ZOOM = 17.4;
const RETRY_UNAVAILABLE_MS = 20000;

const INITIAL_STATE: TurnByTurnState = {
  status: 'idle',
  banner: null,
  camera: null,
  remainingDistanceM: 0,
  remainingDurationSec: 0,
  speedKmh: null,
  offRoute: false,
  route: null,
};

export function useTurnByTurnNavigation({
  active,
  coords,
  target,
  viaPoints,
  onVoiceCue,
  pitch = DEFAULT_PITCH,
  zoom = DEFAULT_ZOOM,
}: UseTurnByTurnOptions) {
  const [state, setState] = useState<TurnByTurnState>(INITIAL_STATE);

  const routeRef = useRef<NavRoute | null>(null);
  const stepIndexRef = useRef(0);
  const segmentHintRef = useRef<number | null>(null);
  const offRouteRef = useRef(false);
  const offRouteStreakRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const rerouteInFlightRef = useRef(false);
  const smoothedHeadingRef = useRef<number | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
  const arrivedRef = useRef(false);
  const generationRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetRef = useRef(target);
  targetRef.current = target;
  const viaRef = useRef(viaPoints);
  viaRef.current = viaPoints;
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const voiceCueRef = useRef(onVoiceCue);
  voiceCueRef.current = onVoiceCue;

  const resetProgressRefs = useCallback(() => {
    stepIndexRef.current = 0;
    segmentHintRef.current = null;
    offRouteRef.current = false;
    offRouteStreakRef.current = 0;
    arrivedRef.current = false;
    announcedRef.current = new Set();
  }, []);

  const loadRouteRef = useRef<() => Promise<void>>(async () => {});

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (routeRef.current) return;
      void loadRouteRef.current();
    }, RETRY_UNAVAILABLE_MS);
  }, []);

  const loadRoute = useCallback(async () => {
    const dest = targetRef.current;
    const start = coordsRef.current;
    if (!dest || !start) {
      routeRef.current = null;
      setState((s) => ({ ...s, status: 'idle', route: null, banner: null }));
      return;
    }
    const gen = generationRef.current;
    const route = await fetchOsrmNavRoute([
      { latitude: start.latitude, longitude: start.longitude },
      ...(viaRef.current ?? []),
      dest,
    ]);
    if (gen !== generationRef.current) return;
    if (!route) {
      routeRef.current = null;
      setState((s) => ({ ...s, status: 'unavailable', route: null, banner: null }));
      scheduleRetry();
      return;
    }
    routeRef.current = route;
    resetProgressRefs();
    setState((s) => ({ ...s, status: 'navigating', route }));
  }, [resetProgressRefs, scheduleRetry]);

  loadRouteRef.current = loadRoute;

  const rerouteNow = useCallback(async () => {
    const dest = targetRef.current;
    const start = coordsRef.current;
    if (!dest || !start || rerouteInFlightRef.current) return;
    rerouteInFlightRef.current = true;
    lastRerouteAtRef.current = Date.now();
    const gen = generationRef.current;
    const route = await fetchOsrmNavRoute([
      { latitude: start.latitude, longitude: start.longitude },
      ...(viaRef.current ?? []),
      dest,
    ]);
    rerouteInFlightRef.current = false;
    if (gen !== generationRef.current) return;
    if (!route) {
      setState((s) => ({
        ...s,
        status: routeRef.current ? 'navigating' : 'unavailable',
      }));
      if (!routeRef.current) scheduleRetry();
      return;
    }
    routeRef.current = route;
    resetProgressRefs();
    voiceCueRef.current?.({ kind: 'rerouted', stepIndex: -1, distanceM: 0 });
    setState((s) => ({ ...s, status: 'navigating', route }));
  }, [resetProgressRefs, scheduleRetry]);

  // Activación / cambio de objetivo: refetch (espera el primer fix GPS como origen).
  const targetSig = target
    ? `${target.latitude.toFixed(5)},${target.longitude.toFixed(5)}`
    : '';
  const viaSig = (viaPoints ?? [])
    .map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
    .join('|');
  const hasCoords = !!coords;

  useEffect(() => {
    if (!active || !target) {
      generationRef.current += 1;
      routeRef.current = null;
      resetProgressRefs();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setState(INITIAL_STATE);
      return;
    }
    if (!hasCoords) {
      setState((s) => ({ ...s, status: 'loading', banner: null }));
      return;
    }
    generationRef.current += 1;
    resetProgressRefs();
    routeRef.current = null;
    setState((s) => ({ ...s, status: 'loading', banner: null, route: null, offRoute: false }));
    void loadRouteRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetSig, viaSig, hasCoords, resetProgressRefs]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  // Procesamiento por tick GPS.
  useEffect(() => {
    if (!active || !coords || !routeRef.current) return;
    const route = routeRef.current;
    const sample: RoutePoint = { latitude: coords.latitude, longitude: coords.longitude };
    const snap = snapToRoute(sample, route.coords, route.cumulative, segmentHintRef.current);
    if (!snap) return;
    segmentHintRef.current = snap.segmentIndex;

    // Paso actual: pointer monótono (con corrección atrás tras reroute).
    const steps = route.steps;
    let idx = stepIndexRef.current;
    while (idx < steps.length - 1 && snap.distanceAlongRoute >= steps[idx + 1].startDist) idx++;
    while (idx > 0 && snap.distanceAlongRoute < steps[idx].startDist) idx--;
    stepIndexRef.current = idx;

    // La próxima maniobra es la del paso siguiente (ocurre en su startDist).
    const nextIdx = Math.min(idx + 1, steps.length - 1);
    const nextStep = steps[nextIdx];
    const thenStep = steps[nextIdx + 1];
    const distToManeuver = Math.max(0, nextStep.startDist - snap.distanceAlongRoute);
    const remainingDistanceM = Math.max(0, route.totalDistanceM - snap.distanceAlongRoute);

    // ETA: fracción restante del paso actual + pasos completos posteriores.
    let remainingSec = 0;
    for (let i = idx; i < steps.length; i++) {
      const s = steps[i];
      if (s.endDist <= snap.distanceAlongRoute) continue;
      const span = s.endDist - s.startDist;
      const frac = span > 0 ? Math.min(1, (s.endDist - snap.distanceAlongRoute) / span) : 1;
      remainingSec += s.durationSec * frac;
    }

    // Off-route con histeresis; se ignoran fixes de baja precisión.
    const accuracyBad =
      typeof coords.accuracy === 'number' && coords.accuracy > MAX_ACCURACY_FOR_OFFROUTE_M;
    if (!accuracyBad) {
      if (!offRouteRef.current && snap.perpDistance > OFF_ROUTE_ENTER_M) {
        offRouteStreakRef.current += 1;
        if (offRouteStreakRef.current >= OFF_ROUTE_MIN_SAMPLES) offRouteRef.current = true;
      } else if (snap.perpDistance <= OFF_ROUTE_EXIT_M) {
        offRouteStreakRef.current = 0;
        offRouteRef.current = false;
      }
    }

    const arrived =
      nextIdx === steps.length - 1 &&
      nextStep.type === 'arrive' &&
      distToManeuver <= ARRIVE_RADIUS_M;

    // Avisos de voz: una vez por paso y por umbral.
    const cue = voiceCueRef.current;
    if (arrived) {
      if (!arrivedRef.current) {
        arrivedRef.current = true;
        cue?.({ kind: 'arrived', stepIndex: nextIdx, step: nextStep, distanceM: distToManeuver });
      }
    } else if (!offRouteRef.current) {
      const base = `${nextIdx}`;
      if (distToManeuver <= ANNOUNCE_NOW_M && !announcedRef.current.has(`${base}:now`)) {
        announcedRef.current.add(`${base}:now`);
        cue?.({ kind: 'now', stepIndex: nextIdx, step: nextStep, distanceM: distToManeuver });
      } else if (
        distToManeuver <= ANNOUNCE_APPROACH_M &&
        !announcedRef.current.has(`${base}:approach`)
      ) {
        announcedRef.current.add(`${base}:approach`);
        cue?.({ kind: 'approach', stepIndex: nextIdx, step: nextStep, distanceM: distToManeuver });
      }
    }

    // Heading: GPS si hay velocidad suficiente; si no, bearing del tramo de ruta.
    let rawHeading: number | null = null;
    if (
      typeof coords.heading === 'number' &&
      Number.isFinite(coords.heading) &&
      coords.heading >= 0 &&
      (coords.speed == null || coords.speed >= MIN_GPS_HEADING_SPEED_MS)
    ) {
      rawHeading = coords.heading;
    } else {
      const a = route.coords[snap.segmentIndex];
      const b = route.coords[Math.min(snap.segmentIndex + 1, route.coords.length - 1)];
      if (a && b && (a.latitude !== b.latitude || a.longitude !== b.longitude)) {
        rawHeading = bearingDegrees(a, b);
      }
    }
    if (rawHeading != null) {
      smoothedHeadingRef.current =
        smoothedHeadingRef.current == null
          ? rawHeading
          : blendHeading(smoothedHeadingRef.current, rawHeading, HEADING_EMA_ALPHA);
    }

    if (
      offRouteRef.current &&
      !arrived &&
      Date.now() - lastRerouteAtRef.current > REROUTE_COOLDOWN_MS
    ) {
      void rerouteNow();
    }

    const speedKmh =
      typeof coords.speed === 'number' && Number.isFinite(coords.speed) && coords.speed >= 0
        ? Math.round(coords.speed * 3.6)
        : null;

    setState({
      status: arrived ? 'arrived' : rerouteInFlightRef.current ? 'rerouting' : 'navigating',
      banner: {
        icon: maneuverIcon(nextStep),
        textKey: maneuverTextKey(nextStep),
        fallback: maneuverFallbackEs(nextStep),
        streetName: nextStep.streetName,
        distanceM: distToManeuver,
        thenIcon:
          thenStep && nextStep.distanceM <= THEN_MAX_STEP_M
            ? maneuverIcon(thenStep)
            : undefined,
        thenFallback:
          thenStep && nextStep.distanceM <= THEN_MAX_STEP_M
            ? maneuverFallbackEs(thenStep)
            : undefined,
      },
      camera: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: smoothedHeadingRef.current ?? 0,
        pitch,
        zoom,
      },
      remainingDistanceM,
      remainingDurationSec: remainingSec,
      speedKmh,
      offRoute: offRouteRef.current,
      route,
    });
  }, [
    active,
    coords?.latitude,
    coords?.longitude,
    coords?.heading,
    coords?.speed,
    coords?.accuracy,
    state.route,
    pitch,
    zoom,
    rerouteNow,
  ]);

  const retry = useCallback(() => {
    void loadRouteRef.current();
  }, []);

  const reroute = useCallback(() => {
    void rerouteNow();
  }, [rerouteNow]);

  return { ...state, retry, reroute };
}
