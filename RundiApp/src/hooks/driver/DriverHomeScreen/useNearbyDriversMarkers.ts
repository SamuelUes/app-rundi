import { useEffect, useMemo, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { haversineKm } from '../../../utils/geo/distance';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../../utils/driver/vehicleIcons';

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
  const [drivers, setDrivers] = useState<Array<{ id: string; data: any }>>([]);
  const hasCoords = !!coords;

  const nearbyDriversMarkers = useMemo(() => {
    if (!coords || !isAvailable) return [];
    const markers: NearbyDriverMarker[] = [];
    for (const { id, data: payload } of drivers) {
      if (!payload || id === currentDriverId) continue;
      const loc = payload.location;
      const lat = parseCoordinate(loc?.latitude ?? payload.latitude);
      const lng = parseCoordinate(loc?.longitude ?? payload.longitude);
      if (lat === null || lng === null) continue;
      const distance = haversineKm(coords.latitude, coords.longitude, lat, lng);
      if (!Number.isFinite(distance) || distance > SEARCH_RADIUS_KM) continue;
      const vehicleType = payload.vehicleType ?? extractVehicleTypeFromInfo(driverInfoCache.current?.[id]);
      markers.push({
        id, latitude: lat, longitude: lng,
        heading: typeof payload.heading === 'number' ? payload.heading : undefined,
        vehicleType,
        vehicleIconSource: ensureVehicleIconSource(vehicleType),
      });
    }
    return markers.sort((a, b) => a.id.localeCompare(b.id));
  }, [drivers, coords?.latitude, coords?.longitude, isAvailable, currentDriverId, driverInfoCache]);

  useEffect(() => {
    setDrivers([]);
    if (!hasCoords || !isAvailable) {
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const db = await getFirebaseFirestore();
        if (!isMounted) return;

        // REALTIME_drivers_live — conductores online (el resto no es despachable).
        const driversQuery = serviceAreaId
          ? query(
              collection(db, FS_COL.driversLive),
              where('status', '==', 'online'),
              where('serviceAreaId', '==', serviceAreaId),
            )
          : query(collection(db, FS_COL.driversLive), where('status', '==', 'online'));

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;

          setDrivers(snapshot.docs.map((d: any) => ({ id: d.id, data: d.data() })));
        };

        const unsub = onSnapshot(driversQuery, handleSnapshot, (err: any) => {
          console.error('❌ [useNearbyDriversMarkers] Error escuchando drivers_live:', err);
          if (isMounted) setDrivers([]);
        });

        cleanup = () => unsub();
      } catch (err) {
        console.error('❌ [useNearbyDriversMarkers] Error iniciando listener:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [hasCoords, isAvailable, serviceAreaId]);

  return nearbyDriversMarkers;
}
