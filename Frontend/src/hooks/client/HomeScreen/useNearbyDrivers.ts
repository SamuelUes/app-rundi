import { useEffect, useState } from 'react';
import { haversineKm } from '../../../utils/distance';
import { ensureVehicleIconSource, extractVehicleTypeFromInfo } from '../../../utils/vehicleIcons';

const SEARCH_RADIUS_KM = 3;

const parseCoordinate = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

interface NearbyDriver {
  id: string;
  latitude: number;
  longitude: number;
  heading: number;
  vehicleIconSource: any;
  distance: number;
}

export function useNearbyDrivers(
  coords: { latitude: number; longitude: number } | null | undefined,
  clientLocationCoords: { latitude: number; longitude: number } | null | undefined,
  manualOverride: { active: boolean; coords: { latitude: number; longitude: number } } | null,
  driversInfo: Record<string, any> | null,
  driverLocationsSnapshot: Record<string, any> | null,
  loadingDrivers: boolean,
): NearbyDriver[] {
  const [availableDrivers, setAvailableDrivers] = useState<NearbyDriver[]>([]);

  useEffect(() => {
    if (!coords && !clientLocationCoords && !manualOverride?.active) {
      setAvailableDrivers([]);
      return;
    }

    const effectiveLocation =
      (manualOverride?.active && manualOverride.coords) ||
      coords ||
      clientLocationCoords;

    if (!effectiveLocation) {
      return;
    }

    try {
      const driverIds = new Set<string>();
      if (driversInfo) {
        Object.keys(driversInfo).forEach((id) => driverIds.add(id));
      }
      if (driverLocationsSnapshot) {
        Object.keys(driverLocationsSnapshot).forEach((id) => driverIds.add(id));
      }

      const allDrivers = Array.from(driverIds)
        .map((driverId) => {
          const infoData = driversInfo?.[driverId];
          const realtimeData = driverLocationsSnapshot?.[driverId];

          const latitude =
            parseCoordinate(realtimeData?.lat ?? realtimeData?.latitude ?? realtimeData?.coords?.latitude) ??
            parseCoordinate(infoData?.coords?.latitude ?? infoData?.lat ?? infoData?.latitude);
          const longitude =
            parseCoordinate(realtimeData?.lng ?? realtimeData?.longitude ?? realtimeData?.coords?.longitude) ??
            parseCoordinate(infoData?.coords?.longitude ?? infoData?.lng ?? infoData?.longitude);

          if (latitude === null || longitude === null) return null;

          const statusCandidate =
            realtimeData?.status ?? realtimeData?.driverStatus ?? realtimeData?.availability;
          const normalizedStatus = typeof statusCandidate === 'string' ? statusCandidate.toLowerCase() : '';
          const isAvailable = normalizedStatus === 'available';

          const heading =
            (typeof realtimeData?.heading === 'number' && Number.isFinite(realtimeData.heading)
              ? realtimeData.heading : undefined) ??
            (typeof infoData?.heading === 'number' ? infoData.heading : undefined) ?? 0;

          return {
            id: driverId,
            latitude,
            longitude,
            heading,
            isAvailable,
            name: infoData?.name || realtimeData?.name || 'Conductor',
            vehicle: infoData?.vehicle || {},
          };
        })
        .filter((driver): driver is NonNullable<typeof driver> => driver !== null)
        .filter((driver) => {
          if (!driver.isAvailable) return false;
          const distance = haversineKm(
            effectiveLocation.latitude, effectiveLocation.longitude,
            driver.latitude, driver.longitude,
          );
          return Number.isFinite(distance) && distance <= SEARCH_RADIUS_KM;
        })
        .map((driver) => ({
          ...driver,
          distance: haversineKm(
            effectiveLocation.latitude, effectiveLocation.longitude,
            driver.latitude, driver.longitude,
          ),
        }));

      allDrivers.sort((a, b) => a.distance - b.distance);

      const driversWithIcons = allDrivers.map((driver) => {
        const infoData = driversInfo?.[driver.id];
        const inferredVehicleType = extractVehicleTypeFromInfo({
          vehicle: driver.vehicle,
          ...(infoData || {}),
        });
        return {
          id: driver.id,
          latitude: driver.latitude,
          longitude: driver.longitude,
          heading: driver.heading,
          vehicleIconSource: ensureVehicleIconSource(inferredVehicleType),
          distance: driver.distance,
        };
      });

      setAvailableDrivers(driversWithIcons);
    } catch (error) {
      console.error('❌ Error procesando conductores:', error);
      setAvailableDrivers([]);
    }
  }, [
    coords,
    clientLocationCoords,
    manualOverride?.active,
    manualOverride?.coords,
    driversInfo,
    driverLocationsSnapshot,
    loadingDrivers,
  ]);

  return availableDrivers;
}
