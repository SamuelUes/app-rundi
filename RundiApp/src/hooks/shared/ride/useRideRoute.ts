import { useEffect, useState, useMemo, useRef } from 'react';
import {
  type LatLngPoint,
  extractLatLng,
  calculatePolylineDistance,
  calculateMultiPointRoute,
  calculateRealRoute,
  computeDistanceMeters,
} from '../../../utils/ride/rideTrackingHelpers';

interface UseRideRouteResult {
  destinationCoords: LatLngPoint | null;
  originCoords: LatLngPoint | null;
  waypointCoords: LatLngPoint[];
  routeCoordinates: LatLngPoint[];
  routeDistanceMeters: number | null;
  routeDurationSeconds: number | null;
}

const resolveDurationFromRide = (rideData: any): number | null => {
  const candidates = [
    rideData?.routeDuration,
    rideData?.duration,
    rideData?.estimatedDuration,
    rideData?.driverEta?.duration,
    rideData?.driverEta?.durationSeconds,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
};

export function useRideRoute(rideData: any): UseRideRouteResult {
  const [destinationCoords, setDestinationCoords] = useState<LatLngPoint | null>(null);
  const [originCoords, setOriginCoords] = useState<LatLngPoint | null>(null);
  const [waypointCoords, setWaypointCoords] = useState<LatLngPoint[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<LatLngPoint[]>([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState<number | null>(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const updateStaticData = () => {
      const destination = extractLatLng(rideData?.destination);
      if (destination) setDestinationCoords(destination);

      const origin = extractLatLng(rideData?.origin);
      if (origin) setOriginCoords(origin);

      if (Array.isArray(rideData?.extraDestinations)) {
        const waypoints = rideData.extraDestinations
          .map((value: any) => extractLatLng(value))
          .filter((point: LatLngPoint | null): point is LatLngPoint => !!point);
        setWaypointCoords(waypoints);
      } else {
        setWaypointCoords([]);
      }
    };

    const buildRoute = async () => {
      if (!isMounted) return;

      const sanitizeRouteCoords = (rawRoute: any[]): LatLngPoint[] =>
        rawRoute
          .map((value: any) => extractLatLng(value))
          .filter((point: LatLngPoint | null): point is LatLngPoint => !!point);

      const backendRoute = Array.isArray(rideData?.route) ? sanitizeRouteCoords(rideData.route) : [];
      if (backendRoute.length >= 2) {
        if (!isMounted) return;
        setRouteCoordinates(backendRoute);
        const backendDistance =
          typeof rideData?.routeDistance === 'number'
            ? rideData.routeDistance
            : typeof rideData?.distance === 'number'
            ? rideData.distance
            : typeof rideData?.estimatedDistance === 'number'
            ? rideData.estimatedDistance
            : calculatePolylineDistance(backendRoute);
        setRouteDistanceMeters(backendDistance);
        setRouteDurationSeconds(resolveDurationFromRide(rideData));
        return;
      }

      const origin = extractLatLng(rideData?.origin);
      const destination = extractLatLng(rideData?.destination);
      const stops = Array.isArray(rideData?.extraDestinations)
        ? rideData.extraDestinations
            .map((value: any) => extractLatLng(value))
            .filter((point: LatLngPoint | null): point is LatLngPoint => !!point)
        : [];

      if (!origin || !destination) {
        setRouteCoordinates([]);
        setRouteDistanceMeters(null);
        setRouteDurationSeconds(resolveDurationFromRide(rideData));
        return;
      }

      const points: LatLngPoint[] = [origin, ...stops, destination];
      const { route, totalDistance } = await calculateMultiPointRoute(points);

      if (!isMounted) return;
      setRouteCoordinates(route);
      setRouteDistanceMeters(totalDistance > 0 ? totalDistance : null);
      setRouteDurationSeconds(resolveDurationFromRide(rideData));
    };

    updateStaticData();
    setRouteDurationSeconds(resolveDurationFromRide(rideData));
    buildRoute();

    return () => {
      isMounted = false;
    };
  }, [rideData]);

  return {
    destinationCoords,
    originCoords,
    waypointCoords,
    routeCoordinates,
    routeDistanceMeters,
    routeDurationSeconds,
  };
}

interface UseDynamicRouteResult {
  driverToOriginRoute: LatLngPoint[];
  dynamicRouteCoordinates: LatLngPoint[];
  secondaryRouteCoordinates: LatLngPoint[];
  activeRouteCoordinates: LatLngPoint[];
}

export function useDynamicRoute(
  isAccepted: boolean,
  isInProgress: boolean,
  driverLocation: LatLngPoint | null,
  originCoords: LatLngPoint | null,
  destinationCoords: LatLngPoint | null,
  waypointCoords: LatLngPoint[],
  routeCoordinates: LatLngPoint[],
): UseDynamicRouteResult {
  const [driverToOriginRoute, setDriverToOriginRoute] = useState<LatLngPoint[]>([]);
  const [dynamicRouteCoordinates, setDynamicRouteCoordinates] = useState<LatLngPoint[]>([]);
  const lastDynamicRouteStartRef = useRef<LatLngPoint | null>(null);

  useEffect(() => {
    if (!isAccepted || !originCoords || !driverLocation) {
      setDriverToOriginRoute([]);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const start = {
          latitude: driverLocation.latitude,
          longitude: driverLocation.longitude,
        };
        const route = await calculateRealRoute(start, originCoords);
        if (isMounted) {
          setDriverToOriginRoute(route);
        }
      } catch (error) {
        console.error('Error calculando ruta conductor → origen', error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAccepted, originCoords?.latitude, originCoords?.longitude, driverLocation?.latitude, driverLocation?.longitude]);

  useEffect(() => {
    if (!isInProgress || !driverLocation) {
      setDynamicRouteCoordinates([]);
      lastDynamicRouteStartRef.current = null;
      return;
    }

    const targets: LatLngPoint[] = [];
    if (Array.isArray(waypointCoords) && waypointCoords.length > 0) {
      targets.push(...waypointCoords);
    }
    if (destinationCoords) {
      targets.push(destinationCoords);
    }

    if (targets.length === 0) {
      setDynamicRouteCoordinates([]);
      lastDynamicRouteStartRef.current = null;
      return;
    }

    const start: LatLngPoint = {
      latitude: driverLocation.latitude,
      longitude: driverLocation.longitude,
    };

    const last = lastDynamicRouteStartRef.current;
    if (last) {
      const movedMeters = computeDistanceMeters(last, start);
      if (Number.isFinite(movedMeters) && movedMeters < 25) {
        return;
      }
    }

    let isMounted = true;

    (async () => {
      try {
        const allPoints: LatLngPoint[] = [start, ...targets];
        const { route } = await calculateMultiPointRoute(allPoints);

        if (!isMounted) return;
        setDynamicRouteCoordinates(route);
        lastDynamicRouteStartRef.current = start;
      } catch (error) {
        console.error('Error recalculando ruta dinámica del viaje', error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isInProgress, driverLocation?.latitude, driverLocation?.longitude, destinationCoords, waypointCoords]);

  const secondaryRouteCoordinates = useMemo(
    () => (driverToOriginRoute && driverToOriginRoute.length > 1 ? driverToOriginRoute : []),
    [driverToOriginRoute],
  );

  const activeRouteCoordinates = useMemo(
    () => (isInProgress && dynamicRouteCoordinates.length > 1 ? dynamicRouteCoordinates : routeCoordinates),
    [isInProgress, dynamicRouteCoordinates, routeCoordinates],
  );

  return {
    driverToOriginRoute,
    dynamicRouteCoordinates,
    secondaryRouteCoordinates,
    activeRouteCoordinates,
  };
}
