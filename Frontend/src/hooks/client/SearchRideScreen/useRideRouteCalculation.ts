import { useState, useCallback, useEffect, useRef } from 'react';
import mapsService from '../../../services/mapsService';
import {
  calculateRidePrice,
  type PriceBreakdown,
} from '../../../utils/priceCalculatorCentralize';
import {
  applyDesignatedDriverMotoDiscount,
  MIN_DESIGNATED_DRIVER_PRICE,
  type Coords,
} from '../../../utils/rideCoords';
import alertService from '../../../services/alertService';

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';

const VEHICLE_TYPES: VehicleType[] = ['moto', 'auto', 'designated_driver'];

interface VehicleEstimate {
  price: number | null;
  breakdown: PriceBreakdown | null;
}

interface UseRideRouteCalculationOptions {
  vehicleType: VehicleType;
  designatedDriverMode: DesignatedDriverMode;
  tr: (path: string, options?: Record<string, any>) => string;
}

export function useRideRouteCalculation({
  vehicleType,
  designatedDriverMode,
  tr,
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

  const designatedDriverEligibility = {
    autoPrice: designatedDriverEstimates.auto.price ?? null,
    motoPrice: designatedDriverEstimates.moto.price ?? null,
    autoEligible:
      typeof designatedDriverEstimates.auto.price === 'number' &&
      designatedDriverEstimates.auto.price >= MIN_DESIGNATED_DRIVER_PRICE,
    motoEligible:
      typeof designatedDriverEstimates.moto.price === 'number' &&
      designatedDriverEstimates.moto.price >= MIN_DESIGNATED_DRIVER_PRICE,
    anyEligible: false,
  };
  designatedDriverEligibility.anyEligible =
    designatedDriverEligibility.autoEligible || designatedDriverEligibility.motoEligible;

  const updateVehicleEstimates = useCallback(
    async (distanceMeters: number, durationSeconds: number, stopsCount: number, startPoint: Coords) => {
      try {
        const pricing = await Promise.all(
          VEHICLE_TYPES.map(async (type) => {
            try {
              const breakdown = await calculateRidePrice(
                distanceMeters,
                durationSeconds,
                type === 'moto' ? 'motorcycle' : 'car',
                type === 'designated_driver' ? 'designated_driver' : 'normal',
                startPoint.latitude,
                startPoint.longitude,
                { extraStops: stopsCount },
              );
              return { type, price: breakdown.finalPrice, breakdown } as const;
            } catch {
              return { type, price: null, breakdown: null } as const;
            }
          }),
        );

        const mapped = pricing.reduce<Record<VehicleType, VehicleEstimate>>((acc, item) => {
          acc[item.type] = { price: item.price, breakdown: item.breakdown };
          return acc;
        }, { moto: { price: null, breakdown: null }, auto: { price: null, breakdown: null }, designated_driver: { price: null, breakdown: null } });

        setVehicleEstimates(mapped);

        let designatedDriverMotoBreakdown: PriceBreakdown | null = null;
        try {
          designatedDriverMotoBreakdown = await calculateRidePrice(
            distanceMeters,
            durationSeconds,
            'motorcycle',
            'designated_driver',
            startPoint.latitude,
            startPoint.longitude,
            { extraStops: stopsCount },
          );
        } catch {
          // ignore
        }

        const designatedDriverAutoEstimate = mapped.designated_driver || { price: null, breakdown: null };
        const discountedMotoBreakdown = applyDesignatedDriverMotoDiscount(designatedDriverMotoBreakdown, true);
        const designatedDriverMotoEstimate: VehicleEstimate = {
          price: discountedMotoBreakdown?.finalPrice ?? null,
          breakdown: discountedMotoBreakdown,
        };
        setDesignatedDriverEstimates({
          auto: designatedDriverAutoEstimate,
          moto: designatedDriverMotoEstimate,
        });

        const valid = pricing.filter(
          (item) => typeof item.price === 'number' && item.price !== null && !Number.isNaN(item.price),
        );
        if (valid.length > 0) {
          const lowest = valid.reduce((prev, current) => (prev.price! <= current.price! ? prev : current));
          setRecommendedVehicle(lowest.type);
        } else {
          setRecommendedVehicle(null);
        }

        const current =
          vehicleType === 'designated_driver'
            ? designatedDriverMode === 'moto'
              ? designatedDriverMotoEstimate
              : designatedDriverAutoEstimate
            : mapped[vehicleType];

        if (current?.price != null) {
          setEstimatedPrice(current.price);
          setPriceBreakdown(current.breakdown);
        } else {
          setEstimatedPrice(0);
          setPriceBreakdown(null);
        }
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

  const calculateRouteWithStops = useCallback(
    async (startPoint: Coords | null, stops: Coords[], endPoint: Coords | null) => {
      if (!startPoint || !endPoint) return;

      try {
        setCalculatingRoute(true);
        const all = [startPoint, ...stops, endPoint];
        let totalDistance = 0;
        let totalDuration = 0;
        let poly: Coords[] = [];

        for (let i = 0; i < all.length - 1; i += 1) {
          const segment = await mapsService.getDirections(all[i], all[i + 1]);
          if (!segment) throw new Error('Routing failed');
          totalDistance += segment.distance;
          totalDuration += segment.duration;
          poly = poly.concat(segment.polyline);
        }

        setRouteCoordinates(poly);

        const distanceKm = totalDistance / 1000;
        const durationMin = Math.ceil(totalDuration / 60);
        setEstimatedDistance(Number(distanceKm.toFixed(2)));
        setEstimatedDuration(durationMin);

        const useMotorcycle =
          vehicleType === 'moto' || (vehicleType === 'designated_driver' && designatedDriverMode === 'moto');
        const vehicleTypeForCalc = useMotorcycle ? 'motorcycle' : 'car';
        const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
        let breakdown = await calculateRidePrice(
          totalDistance,
          totalDuration,
          vehicleTypeForCalc,
          rideTypeForCalc,
          startPoint.latitude,
          startPoint.longitude,
          { extraStops: stops.length },
        );
        const discountedBreakdown = applyDesignatedDriverMotoDiscount(
          breakdown,
          vehicleType === 'designated_driver' && designatedDriverMode === 'moto',
        );
        breakdown = discountedBreakdown ?? breakdown;
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
        await updateVehicleEstimates(totalDistance, totalDuration, stops.length, startPoint);
      } catch (error) {
        console.warn('calculateRouteWithStops', error);
        alertService.showErrorAlert(trRef.current('alerts.priceCalculationFailed'));
      } finally {
        setCalculatingRoute(false);
      }
    },
    [vehicleType, designatedDriverMode, updateVehicleEstimates],
  );

  const calculateSimpleRoute = useCallback(
    async (start: Coords, end: Coords, stopsCount: number) => {
      try {
        setCalculatingRoute(true);
        const route = await mapsService.getDirections(start, end);
        if (!route) throw new Error('Routing failed');
        setRouteCoordinates(route.polyline);

        const distanceKm = route.distance / 1000;
        const durationMin = Math.ceil(route.duration / 60);
        setEstimatedDistance(Number(distanceKm.toFixed(2)));
        setEstimatedDuration(durationMin);

        const vehicleTypeForCalc = vehicleType === 'moto' ? 'motorcycle' : 'car';
        const rideTypeForCalc = vehicleType === 'designated_driver' ? 'designated_driver' : 'normal';
        let breakdown = await calculateRidePrice(
          route.distance,
          route.duration,
          vehicleTypeForCalc,
          rideTypeForCalc,
          start.latitude,
          start.longitude,
          { extraStops: stopsCount },
        );
        const discountedBreakdown = applyDesignatedDriverMotoDiscount(
          breakdown,
          vehicleType === 'designated_driver' && designatedDriverMode === 'moto',
        );
        breakdown = discountedBreakdown ?? breakdown;
        setEstimatedPrice(breakdown.finalPrice);
        setPriceBreakdown(breakdown);
        await updateVehicleEstimates(route.distance, route.duration, stopsCount, start);
      } catch (error) {
        console.warn('calculateSimpleRoute', error);
        alertService.showErrorAlert(trRef.current('alerts.priceCalculationFailed'));
      } finally {
        setCalculatingRoute(false);
      }
    },
    [vehicleType, designatedDriverMode, updateVehicleEstimates],
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

      if (stopsCoords.length > 0) {
        await calculateRouteWithStops(originPoint, stopsCoords, destinationPoint);
      } else {
        await calculateSimpleRoute(originPoint, destinationPoint, 0);
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
