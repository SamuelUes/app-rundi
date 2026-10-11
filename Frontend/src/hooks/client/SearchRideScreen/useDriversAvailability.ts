import { useEffect, useRef, useState } from 'react';
import driversService from '../../../services/driversService';
import { normalizeVehicleTypeForMatching } from '../../../services/ridesService';
import { metersBetween, type Coords } from '../../../utils/rideCoords';

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';

export interface RideAvailabilityByType {
  moto: number;
  auto: number;
  designatedAuto: number;
  designatedMoto: number;
}

const REFETCH_MIN_INTERVAL_MS = 30_000;
const REFETCH_MIN_DISTANCE_M = 500;
const SEARCH_RADIUS_KM = 15;

const classifyDriver = (driver: any): keyof RideAvailabilityByType | null => {
  const normalized = normalizeVehicleTypeForMatching(driver?.vehicle?.type ?? driver?.vehicleType ?? null);
  if (!normalized) return null;
  if (driver?.isDesignatedDriverMode) {
    return normalized === 'moto' ? 'designatedMoto' : 'designatedAuto';
  }
  return normalized;
};

export function useDriversAvailability(
  coords: Coords | null,
  vehicleType: VehicleType,
  designatedDriverMode: DesignatedDriverMode,
) {
  const [availabilityByType, setAvailabilityByType] = useState<RideAvailabilityByType | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);
  const lastFetchRef = useRef<{ coords: Coords; at: number } | null>(null);

  useEffect(() => {
    if (!coords) return;
    const last = lastFetchRef.current;
    if (last && Date.now() - last.at < REFETCH_MIN_INTERVAL_MS && metersBetween(last.coords, coords) < REFETCH_MIN_DISTANCE_M) {
      return;
    }

    let cancelled = false;
    const check = async () => {
      setCheckingDrivers(true);
      try {
        const result = await driversService.checkAvailableDrivers(coords, SEARCH_RADIUS_KM);
        if (cancelled) return;
        const counts: RideAvailabilityByType = { moto: 0, auto: 0, designatedAuto: 0, designatedMoto: 0 };
        for (const driver of result.drivers ?? []) {
          const bucket = classifyDriver(driver);
          if (bucket) counts[bucket] += 1;
        }
        setAvailabilityByType(counts);
        lastFetchRef.current = { coords, at: Date.now() };
      } catch {
        if (!cancelled) setAvailabilityByType(null);
      } finally {
        if (!cancelled) setCheckingDrivers(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [coords]);

  const driversAvailable =
    availabilityByType == null
      ? null
      : vehicleType === 'designated_driver'
      ? (designatedDriverMode === 'moto' ? availabilityByType.designatedMoto : availabilityByType.designatedAuto) > 0
      : availabilityByType[vehicleType] > 0;

  return { driversAvailable, checkingDrivers, availabilityByType };
}
