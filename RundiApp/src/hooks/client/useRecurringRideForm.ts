import { useCallback, useEffect, useRef, useState } from 'react';
import mapsService from '../../services/map/mapsService';
import type { Coords } from '../../utils/geo/rideCoords';
import type {
  RecurringRide,
  RecurringRideDesignatedMode,
  RecurringRideInput,
  RecurringRidePaymentMethod,
  RecurringRideVehicleType,
} from '../../types/recurringRide';

export type RecurringRideFieldTarget = 'origin' | 'destination' | 'new-stop' | number;

export interface RecurringRideStop {
  address: string;
  coords: Coords | null;
}

const MAX_EXTRA_STOPS = 3;

export function useRecurringRideForm(initialRide?: RecurringRide) {
  const [rideId] = useState<string | undefined>(initialRide?.id);
  const [title, setTitle] = useState(initialRide?.title ?? '');
  const [originAddress, setOriginAddress] = useState(initialRide?.origin.address ?? '');
  const [originCoords, setOriginCoords] = useState<Coords | null>(
    initialRide ? { latitude: initialRide.origin.lat, longitude: initialRide.origin.lng } : null,
  );
  const [destinationAddress, setDestinationAddress] = useState(initialRide?.destination.address ?? '');
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(
    initialRide ? { latitude: initialRide.destination.lat, longitude: initialRide.destination.lng } : null,
  );
  const [extraStops, setExtraStops] = useState<RecurringRideStop[]>(
    initialRide?.extraStops.map((s) => ({
      address: s.address,
      coords: { latitude: s.lat, longitude: s.lng },
    })) ?? [],
  );
  const [vehicleType, setVehicleType] = useState<RecurringRideVehicleType>(initialRide?.vehicleType ?? 'auto');
  const [designatedDriverMode, setDesignatedDriverMode] = useState<RecurringRideDesignatedMode>(
    initialRide?.designatedDriverMode ?? 'auto',
  );
  const [paymentMethod, setPaymentMethod] = useState<RecurringRidePaymentMethod>(initialRide?.paymentMethod ?? 'cash');
  const [passengers, setPassengers] = useState(initialRide?.passengers ?? 1);
  const [comment, setComment] = useState(initialRide?.comment ?? '');

  const [routeCoordinates, setRouteCoordinates] = useState<Coords[]>([]);
  const [estimatedDistance, setEstimatedDistance] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const routeRequestRef = useRef(0);

  const applySelection = useCallback(
    (target: RecurringRideFieldTarget, address: string, coordsValue: Coords) => {
      if (target === 'origin') {
        setOriginAddress(address);
        setOriginCoords(coordsValue);
      } else if (target === 'destination') {
        setDestinationAddress(address);
        setDestinationCoords(coordsValue);
      } else if (target === 'new-stop') {
        setExtraStops((prev) =>
          prev.length >= MAX_EXTRA_STOPS ? prev : [...prev, { address, coords: coordsValue }],
        );
      } else if (typeof target === 'number') {
        setExtraStops((prev) =>
          prev.map((stop, i) => (i === target ? { address, coords: coordsValue } : stop)),
        );
      }
    },
    [],
  );

  const removeStop = useCallback((index: number) => {
    setExtraStops((prev) => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    if (!originCoords || !destinationCoords) {
      setRouteCoordinates([]);
      setEstimatedDistance(0);
      setEstimatedDuration(0);
      return;
    }
    const requestId = ++routeRequestRef.current;
    const run = async () => {
      setCalculatingRoute(true);
      try {
        const stopsCoords = extraStops.map((s) => s.coords).filter(Boolean) as Coords[];
        const all = [originCoords, ...stopsCoords, destinationCoords];
        let totalDistance = 0;
        let totalDuration = 0;
        let poly: Coords[] = [];
        for (let i = 0; i < all.length - 1; i += 1) {
          const segment = await mapsService.getDirections(all[i], all[i + 1]);
          if (routeRequestRef.current !== requestId) return;
          if (!segment) throw new Error('Routing failed');
          totalDistance += segment.distance;
          totalDuration += segment.duration;
          poly = poly.concat(segment.polyline);
        }
        if (routeRequestRef.current !== requestId) return;
        setRouteCoordinates(poly);
        setEstimatedDistance(Number((totalDistance / 1000).toFixed(2)));
        setEstimatedDuration(Math.ceil(totalDuration / 60));
      } catch (error) {
        if (routeRequestRef.current === requestId) {
          console.warn('[recurringRideForm] route calc failed', error);
          setRouteCoordinates([]);
        }
      } finally {
        if (routeRequestRef.current === requestId) setCalculatingRoute(false);
      }
    };
    void run();
  }, [originCoords, destinationCoords, extraStops]);

  const buildInput = useCallback((): RecurringRideInput & { id?: string } | null => {
    if (!originCoords || !destinationCoords) return null;
    const trimmedTitle = title.trim();
    return {
      id: rideId,
      title: trimmedTitle,
      origin: { lat: originCoords.latitude, lng: originCoords.longitude, address: originAddress },
      destination: {
        lat: destinationCoords.latitude,
        lng: destinationCoords.longitude,
        address: destinationAddress,
      },
      extraStops: extraStops
        .filter((s) => s.coords)
        .map((s) => ({ lat: s.coords!.latitude, lng: s.coords!.longitude, address: s.address })),
      vehicleType,
      designatedDriverMode: vehicleType === 'designated_driver' ? designatedDriverMode : undefined,
      paymentMethod,
      passengers,
      comment: comment.trim() || undefined,
    };
  }, [
    rideId, title, originCoords, originAddress, destinationCoords, destinationAddress,
    extraStops, vehicleType, designatedDriverMode, paymentMethod, passengers, comment,
  ]);

  const canSave =
    title.trim().length > 0 && !!originCoords && !!destinationCoords && !calculatingRoute;

  return {
    rideId,
    title, setTitle,
    originAddress, originCoords,
    destinationAddress, destinationCoords,
    extraStops,
    vehicleType, setVehicleType,
    designatedDriverMode, setDesignatedDriverMode,
    paymentMethod, setPaymentMethod,
    passengers, setPassengers,
    comment, setComment,
    routeCoordinates, estimatedDistance, estimatedDuration, calculatingRoute,
    applySelection, removeStop,
    buildInput, canSave,
    maxExtraStops: MAX_EXTRA_STOPS,
  };
}
