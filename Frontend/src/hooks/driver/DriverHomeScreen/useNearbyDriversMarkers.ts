import { useEffect, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { haversineKm } from '../../../utils/distance';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../../utils/vehicleIcons';

type NearbyDriverMarker = {
  id: string;
  latitude: number;
  longitude: number;
  heading?: number;
  vehicleType?: string | null;
  vehicleIconSource?: ImageSourcePropType;
};

const parseCoordinate = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const SEARCH_RADIUS_KM = 15;

export function useNearbyDriversMarkers(
  coords: { latitude: number; longitude: number } | null | undefined,
  isAvailable: boolean,
  currentDriverId: string | undefined,
  serviceAreaId: string | null,
  driverInfoCache: React.MutableRefObject<Record<string, any> | null>,
): NearbyDriverMarker[] {
  const [nearbyDriversMarkers, setNearbyDriversMarkers] = useState<NearbyDriverMarker[]>([]);
  const driverLocationsSignatureRef = useRef<string>('');

  useEffect(() => {
    if (!coords || !isAvailable) {
      driverLocationsSignatureRef.current = '';
      setNearbyDriversMarkers([]);
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const path = serviceAreaId ? `driverLocationsByArea/${serviceAreaId}` : 'driverLocations';
        const driverLocationsRef = dbRef(db, path);

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;

          const data = snapshot.val();
          if (!data || typeof data !== 'object') {
            if (driverLocationsSignatureRef.current !== '') {
              driverLocationsSignatureRef.current = '';
              setNearbyDriversMarkers([]);
            }
            return;
          }

          const markers: NearbyDriverMarker[] = [];

          Object.entries<any>(data).forEach(([driverId, payload]) => {
            if (!payload || driverId === currentDriverId) return;

            const lat = parseCoordinate(payload?.lat ?? payload?.latitude ?? payload?.coords?.latitude);
            const lng = parseCoordinate(payload?.lng ?? payload?.longitude ?? payload?.coords?.longitude);
            if (lat === null || lng === null) return;

            const distance = haversineKm(coords.latitude, coords.longitude, lat, lng);
            if (!Number.isFinite(distance) || distance > SEARCH_RADIUS_KM) return;

            const status = payload?.status ?? payload?.driverStatus ?? payload?.availability;
            if (status && String(status).toLowerCase().includes('offline')) return;

            const heading = typeof payload?.heading === 'number' ? payload.heading : undefined;
            const driverInfo = driverInfoCache.current?.[driverId];
            const vehicleType = extractVehicleTypeFromInfo(driverInfo);
            const vehicleIconSource = ensureVehicleIconSource(vehicleType);

            markers.push({ id: driverId, latitude: lat, longitude: lng, heading, vehicleType, vehicleIconSource });
          });

          markers.sort((a, b) => a.id.localeCompare(b.id));

          const signature = markers
            .map((marker) =>
              `${marker.id}:${marker.latitude.toFixed(5)}:${marker.longitude.toFixed(5)}:${(marker.heading ?? 0).toFixed(2)}:${marker.vehicleType ?? 'na'}`,
            )
            .join('|');

          if (signature !== driverLocationsSignatureRef.current) {
            driverLocationsSignatureRef.current = signature;
            setNearbyDriversMarkers(markers);
          }
        };

        onValue(driverLocationsRef, handleSnapshot, (err) => {
          console.error('❌ [useNearbyDriversMarkers] Error escuchando driverLocations:', err);
          setNearbyDriversMarkers([]);
        });

        cleanup = () => off(driverLocationsRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [useNearbyDriversMarkers] Error iniciando listener:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [coords?.latitude, coords?.longitude, isAvailable, currentDriverId, serviceAreaId, driverInfoCache]);

  return nearbyDriversMarkers;
}
