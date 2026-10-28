import { useEffect, useState } from 'react';
import driversService from '../../services/driversService';

export function useDriverRideFeatureCapabilities(
  userId: string | undefined,
  vehicleId: string | null,
) {
  const [driverFeatureCodes, setDriverFeatureCodes] = useState<string[]>([]);
  const [vehicleFeatureCodes, setVehicleFeatureCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) {
      setDriverFeatureCodes([]);
      setVehicleFeatureCodes([]);
      return;
    }

    let cancelled = false;
    driversService.getMyRideFeatureCapabilities(vehicleId ?? undefined)
      .then((result) => {
        if (cancelled) return;
        setDriverFeatureCodes(result.driverFeatureCodes ?? []);
        setVehicleFeatureCodes(result.vehicleFeatureCodes ?? []);
      })
      .catch((error) => {
        console.warn('[RideFeatures] No se pudieron obtener las capacidades:', error);
        if (!cancelled) {
          setDriverFeatureCodes([]);
          setVehicleFeatureCodes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, vehicleId]);

  return { driverFeatureCodes, vehicleFeatureCodes };
}
