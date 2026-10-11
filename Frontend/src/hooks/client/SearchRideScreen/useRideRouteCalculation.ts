import { useState, useCallback, useEffect, useRef } from 'react';
import mapsService from '../../../services/mapsService';
import {
  calculateRidePrice,
  calculateRidePricesBatch,
  getDesignatedDriverMinimumFares,
  type PriceBatchVariant,
  type PriceBreakdown,
} from '../../../utils/priceCalculatorCentralize';
import {
  applyDesignatedDriverMotoDiscount,
  MIN_DESIGNATED_DRIVER_PRICE,
  type Coords,
} from '../../../utils/rideCoords';
import alertService from '../../../services/alertService';
import type { RideAvailabilityByType } from './useDriversAvailability';

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';

// Ventanas horarias (hora local del viaje) para la recomendación contextual:
// horas pico -> moto, noche -> auto, madrugada jue-dom -> conductor designado.
const TRAFFIC_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [11, 13],
  [17, 19],
];
const NIGHT_AUTO_WINDOW: readonly [number, number] = [21, 23];
const DD_NIGHT_DAYS = new Set([0, 4, 5, 6]); // domingo, jueves, viernes, sábado
const DD_NIGHT_START = 22;
const DD_NIGHT_END = 4; // exclusivo

const getTimeBasedPreference = (date: Date): VehicleType | null => {
  const hour = date.getHours();
  if (DD_NIGHT_DAYS.has(date.getDay()) && (hour >= DD_NIGHT_START || hour < DD_NIGHT_END)) {
    return 'designated_driver';
  }
  if (hour >= NIGHT_AUTO_WINDOW[0] && hour < NIGHT_AUTO_WINDOW[1]) return 'auto';
  if (TRAFFIC_WINDOWS.some(([start, end]) => hour >= start && hour < end)) return 'moto';
  return null;
};

const PRICE_VARIANTS: PriceBatchVariant[] = [
  { key: 'moto', vehicleType: 'motorcycle', rideType: 'normal' },
  { key: 'auto', vehicleType: 'car', rideType: 'normal' },
  { key: 'dd_auto', vehicleType: 'car', rideType: 'designated_driver' },
  { key: 'dd_moto', vehicleType: 'motorcycle', rideType: 'designated_driver' },
];

interface VehicleEstimate {
  price: number | null;
  breakdown: PriceBreakdown | null;
}

interface UseRideRouteCalculationOptions {
  vehicleType: VehicleType;
  designatedDriverMode: DesignatedDriverMode;
  tr: (path: string, options?: Record<string, any>) => string;
  /** Tamaño de grupo que el usuario indicó en el vehículo seleccionado */
  partySize?: number;
  /** Conteo de conductores disponibles por tipo; null mientras se desconoce */
  availabilityByType?: RideAvailabilityByType | null;
  /** Timestamp del viaje programado para la recomendación horaria; null = ahora */
  scheduledAt?: number | null;
}

const wrapEstimate = (breakdown: PriceBreakdown | null): VehicleEstimate => ({
  price: breakdown?.finalPrice ?? null,
  breakdown,
});

export function useRideRouteCalculation({
  vehicleType,
  designatedDriverMode,
  tr,
  partySize = 1,
  availabilityByType = null,
  scheduledAt = null,
}: UseRideRouteCalculationOptions) {
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<Coords[]>([]);
  const [estimatedDistance, setEstimatedDistance] = useState(0);
  const [estimatedDuration, setEstimatedDuration] = useState(0);
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [vehicleEstimates, setVehicleEstimates] = useState<Record<VehicleType, VehicleEstimate>>({
    moto: { price: null, breakdown: null },
    auto: { price: null, breakdown: null },
    designated_driver: { price: null, breakdown: null },
  });
  const [designatedDriverEstimates, setDesignatedDriverEstimates] = useState<
    Record<DesignatedDriverMode, VehicleEstimate>
  >({
    auto: { price: null, breakdown: null },
    moto: { price: null, breakdown: null },
  });
  const [recommendedVehicle, setRecommendedVehicle] = useState<VehicleType | null>(null);

  const trRef = useRef(tr);
  trRef.current = tr;
  const routeRequestRef = useRef(0);
  const isCurrentRequest = (id: number) => id === routeRequestRef.current;

  // Umbral de elegibilidad DD desde la config real del servicio (Supabase),
  // con la constante local solo como valor inicial mientras carga.
  const [ddMinimumFares, setDdMinimumFares] = useState<{ auto: number; moto: number }>({
    auto: MIN_DESIGNATED_DRIVER_PRICE,
    moto: MIN_DESIGNATED_DRIVER_PRICE,
  });
  useEffect(() => {
    let cancelled = false;
    getDesignatedDriverMinimumFares()
      .then((fares) => {
        if (!cancelled) setDdMinimumFares(fares);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const designatedDriverEligibility = {
    autoPrice: designatedDriverEstimates.auto.price ?? null,
    motoPrice: designatedDriverEstimates.moto.price ?? null,
    autoEligible:
      typeof designatedDriverEstimates.auto.price === 'number' &&
      designatedDriverEstimates.auto.price >= ddMinimumFares.auto,
    motoEligible:
      typeof designatedDriverEstimates.moto.price === 'number' &&
      designatedDriverEstimates.moto.price >= ddMinimumFares.moto,
    anyEligible: false,
  };
  designatedDriverEligibility.anyEligible =
    designatedDriverEligibility.autoEligible || designatedDriverEligibility.motoEligible;
  const { autoEligible: ddAutoEligible, motoEligible: ddMotoEligible } = designatedDriverEligibility;

  const updateVehicleEstimates = useCallback(
    async (distanceMeters: number, durationSeconds: number, stopsCount: number, startPoint: Coords, requestId: number) => {
      try {
        const results = await calculateRidePricesBatch(
          distanceMeters,
          durationSeconds,
          startPoint.latitude,
          startPoint.longitude,
          PRICE_VARIANTS,
          { extraStops: stopsCount },
        );
        if (!isCurrentRequest(requestId)) return;

        const mapped: Record<VehicleType, VehicleEstimate> = {
          moto: wrapEstimate(results.moto ?? null),
          auto: wrapEstimate(results.auto ?? null),
          designated_driver: wrapEstimate(results.dd_auto ?? null),
        };
        const designatedDriverMotoEstimate = wrapEstimate(
          applyDesignatedDriverMotoDiscount(results.dd_moto ?? null, true),
        );

        setVehicleEstimates(mapped);
        setDesignatedDriverEstimates({
          auto: mapped.designated_driver,
          moto: designatedDriverMotoEstimate,
        });

        const current =
          vehicleType === 'designated_driver'
            ? designatedDriverMode === 'moto'
              ? designatedDriverMotoEstimate
              : mapped.designated_driver
            : mapped[vehicleType];

        setEstimatedPrice(current?.price ?? 0);
        setPriceBreakdown(current?.breakdown ?? null);
      } catch (error) {
        console.warn('updateVehicleEstimates', error);
      }
    },
    [vehicleType, designatedDriverMode],
  );

  useEffect(() => {
    if (vehicleType === 'designated_driver') {
      const current = designatedDriverEstimates[designatedDriverMode];
      if (current?.price != null) {
        setEstimatedPrice(current.price);
        setPriceBreakdown(current.breakdown);
      } else {
        setEstimatedPrice(0);
        setPriceBreakdown(null);
      }
      return;
    }

    const current = vehicleEstimates[vehicleType];
    if (current?.price != null) {
      setEstimatedPrice(current.price);
      setPriceBreakdown(current.breakdown);
    }
  }, [vehicleType, vehicleEstimates, designatedDriverMode, designatedDriverEstimates]);

  // Recomendación contextual: primero la preferencia por horario del viaje
  // (tráfico -> moto, noche -> auto, madrugada jue-dom -> conductor designado),
  // sujeta a capacidad del grupo, precio válido y conductores disponibles
  // cuando hay datos; si el preferido no es elegible cae al normal más barato.
  useEffect(() => {
    const referenceTime = scheduledAt != null ? new Date(scheduledAt) : new Date();
    const preference = getTimeBasedPreference(referenceTime);

    const candidates: Array<{ type: VehicleType; price: number | null; capacity: number; available: number | null }> = [
      { type: 'moto', price: vehicleEstimates.moto.price, capacity: 1, available: availabilityByType?.moto ?? null },
      { type: 'auto', price: vehicleEstimates.auto.price, capacity: 4, available: availabilityByType?.auto ?? null },
    ];
    const eligible = candidates.filter(
      (c) => typeof c.price === 'number' && Number.isFinite(c.price) && c.capacity >= partySize,
    );
    const withDrivers = eligible.filter((c) => c.available != null && c.available > 0);
    const pool = withDrivers.length ? withDrivers : eligible;
    const cheapest = pool.length
      ? pool.reduce((a, b) => ((a.price ?? 0) <= (b.price ?? 0) ? a : b)).type
      : null;

    const ddModeEligible = designatedDriverMode === 'moto' ? ddMotoEligible : ddAutoEligible;
    const ddCapacity = designatedDriverMode === 'moto' ? 1 : 4;
    const ddModeAvailable = availabilityByType
      ? designatedDriverMode === 'moto'
        ? availabilityByType.designatedMoto
        : availabilityByType.designatedAuto
      : null;
    const ddEligible =
      ddModeEligible && ddCapacity >= partySize && (ddModeAvailable == null || ddModeAvailable > 0);

    let next: VehicleType | null;
    if (preference === 'designated_driver') {
      next = ddEligible ? 'designated_driver' : cheapest;
    } else if (preference === 'moto' || preference === 'auto') {
      const forced = eligible.find((c) => c.type === preference);
      next = forced && (forced.available == null || forced.available > 0) ? preference : cheapest;
    } else {
      next = cheapest;
    }
    setRecommendedVehicle(next);
  }, [
    vehicleEstimates,
    availabilityByType,
    partySize,
    scheduledAt,
    designatedDriverMode,
    ddAutoEligible,
    ddMotoEligible,
  ]);

  const calculateRouteWithStops = useCallback(
    async (startPoint: Coords | null, stops: Coords[], endPoint: Coords | null, requestId: number) => {
      if (!startPoint || !endPoint) return;

      try {
        setCalculatingRoute(true);
        const all = [startPoint, ...stops, endPoint];
        let totalDistance = 0;
        let totalDuration = 0;
        let poly: Coords[] = [];

        for (let i = 0; i < all.length - 1; i += 1) {
          const segment = await mapsService.getDirections(all[i], all[i + 1]);
          if (!isCurrentRequest(requestId)) return;
          if (!segment) throw new Error('Routing failed');
          totalDistance += segment.distance;
          totalDuration += segment.duration;
          poly = poly.concat(segment.polyline);
        }

        if (!isCurrentRequest(requestId)) return;
        setRouteCoordinates(poly);

        const distanceKm = totalDistance / 1000;
        const durationMin = Math.ceil(totalDuration / 60);
        setEstimatedDistance(Number(distanceKm.toFixed(2)));
        setEstimatedDuration(durationMin);

        await updateVehicleEstimates(totalDistance, totalDuration, stops.length, startPoint, requestId);
      } catch (error) {
        if (isCurrentRequest(requestId)) {
          console.warn('calculateRouteWithStops', error);
          alertService.showErrorAlert(trRef.current('alerts.priceCalculationFailed'));
        }
      } finally {
        if (isCurrentRequest(requestId)) setCalculatingRoute(false);
      }
    },
    [updateVehicleEstimates],
  );

  const calculateSimpleRoute = useCallback(
    async (start: Coords, end: Coords, stopsCount: number, requestId: number) => {
      try {
        setCalculatingRoute(true);
        const route = await mapsService.getDirections(start, end);
        if (!isCurrentRequest(requestId)) return;
        if (!route) throw new Error('Routing failed');
        setRouteCoordinates(route.polyline);

        const distanceKm = route.distance / 1000;
        const durationMin = Math.ceil(route.duration / 60);
        setEstimatedDistance(Number(distanceKm.toFixed(2)));
        setEstimatedDuration(durationMin);

        await updateVehicleEstimates(route.distance, route.duration, stopsCount, start, requestId);
      } catch (error) {
        if (isCurrentRequest(requestId)) {
          console.warn('calculateSimpleRoute', error);
          alertService.showErrorAlert(trRef.current('alerts.priceCalculationFailed'));
        }
      } finally {
        if (isCurrentRequest(requestId)) setCalculatingRoute(false);
      }
    },
    [updateVehicleEstimates],
  );

  const recomputeRoute = useCallback(
    async (
      overrideOrigin: Coords | null | undefined,
      overrideDestination: Coords | null | undefined,
      overrideStops: Array<{ address: string; coords: Coords | null }> | undefined,
      fallbackOrigin: Coords | null,
      currentOrigin: Coords | null,
      currentDestination: Coords | null,
      currentStops: Array<{ address: string; coords: Coords | null }>,
    ) => {
      const originPoint = overrideOrigin ?? currentOrigin ?? fallbackOrigin ?? null;
      const destinationPoint = overrideDestination ?? currentDestination ?? null;
      const stopsSource = overrideStops ?? currentStops;
      const stopsCoords = stopsSource.map((stop) => stop.coords).filter(Boolean) as Coords[];

      if (!originPoint || !destinationPoint) return;

      const requestId = ++routeRequestRef.current;
      if (stopsCoords.length > 0) {
        await calculateRouteWithStops(originPoint, stopsCoords, destinationPoint, requestId);
      } else {
        await calculateSimpleRoute(originPoint, destinationPoint, 0, requestId);
      }
    },
    [calculateRouteWithStops, calculateSimpleRoute],
  );

  const recalcPriceOnly = useCallback(
    async (
      originCoords: Coords | null,
      gpsCoords: Coords | null,
      destinationCoords: Coords | null,
      stopsCount: number,
    ) => {
      const start = originCoords || gpsCoords;
      if (!start || !destinationCoords) return;

      const useMotorcycle =
        vehicleType === 'moto' || (vehicleType === 'designated_driver' && designatedDriverMode === 'moto');
      const vehicleTypeForCalc = useMotorcycle ? 'motorcycle' : 'car';
      const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';

      const distMeters = Math.max(1, Math.round(estimatedDistance * 1000));
      const durSeconds = Math.max(1, Math.round(estimatedDuration * 60));

      try {
        const breakdown = await calculateRidePrice(
          distMeters,
          durSeconds,
          vehicleTypeForCalc,
          rideTypeForCalc,
          start.latitude,
          start.longitude,
          { extraStops: stopsCount },
        );
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
      } catch (error) {
        console.warn('recalcPriceOnly', error);
      }
    },
    [vehicleType, designatedDriverMode, estimatedDistance, estimatedDuration],
  );

  return {
    calculatingRoute,
    routeCoordinates,
    estimatedDistance,
    estimatedDuration,
    estimatedPrice,
    priceBreakdown,
    vehicleEstimates,
    designatedDriverEstimates,
    recommendedVehicle,
    designatedDriverEligibility,
    calculateRouteWithStops,
    calculateSimpleRoute,
    recomputeRoute,
    recalcPriceOnly,
    setEstimatedPrice,
    setPriceBreakdown,
  };
}
