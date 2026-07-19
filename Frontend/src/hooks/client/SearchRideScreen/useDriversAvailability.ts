import { useEffect, useState } from 'react';
import driversService from '../../../services/driversService';
import type { Coords } from '../../../utils/rideCoords';

type VehicleType = 'moto' | 'auto' | 'designated_driver';
type DesignatedDriverMode = 'auto' | 'moto';

export function useDriversAvailability(
  coords: Coords | null,
  vehicleType: VehicleType,
  designatedDriverMode: DesignatedDriverMode,
) {
  const [driversAvailable, setDriversAvailable] = useState<boolean | null>(null);
  const [checkingDrivers, setCheckingDrivers] = useState(false);

  useEffect(() => {
    if (!coords) return;
    const check = async () => {
      setCheckingDrivers(true);
      try {
        const designatedDriverVehicle =
          vehicleType === 'designated_driver' ? designatedDriverMode : undefined;
        const result = await driversService.checkAvailableDrivers(
          coords,
          15,
          vehicleType,
          designatedDriverVehicle,
        );
        setDriversAvailable(result.available && result.count > 0);
      } catch {
        setDriversAvailable(null);
      } finally {
        setCheckingDrivers(false);
      }
    };
    check();
  }, [coords, vehicleType, designatedDriverMode]);

  return { driversAvailable, checkingDrivers };
}
