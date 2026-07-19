import { useCallback, useEffect, useRef, useState } from 'react';
import { getDatabase, ref, onValue, get } from 'firebase/database';
import {
  extractRideVehicleTypeForMatching,
  rideMatchesVehicleType,
} from '../../../services/ridesService';
import { getActiveRidesByAreaPath } from '../../../utils/serviceArea';
import { RIDES_RADIUS_KM } from '../../../constants/rideRadius';
import {
  type Ride,
  type RawLocation,
  normalizeLocation,
  normalizeStops,
  normalizeOptionalText,
  resolveSelectedDriverVehicleType,
  haversineKm,
} from '../../../utils/availableRidesHelpers';

export function useAvailableRidesData(
  userId: string | undefined,
  coords: { latitude?: number; longitude?: number } | null,
  serviceAreaId: string | null,
) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [activeRideGuard, setActiveRideGuard] = useState<{ id: string } | null>(null);
  const [selectedDriverVehicleType, setSelectedDriverVehicleType] = useState<'moto' | 'auto' | null>(null);
  const ridesSnapshotsRef = useRef<Record<string, Record<string, any> | null | undefined>>({});

  // Listener: driver vehicle type
  useEffect(() => {
    if (!userId) {
      setSelectedDriverVehicleType(null);
      return;
    }

    const db = getDatabase();
    const infoRef = ref(db, `driversInfo/${userId}`);

    const unsubscribe = onValue(
      infoRef,
      (snapshot) => {
        const info = snapshot.val();
        const resolvedType = resolveSelectedDriverVehicleType(info);
        setSelectedDriverVehicleType(resolvedType);
      },
      (error) => {
        console.warn('[AvailableRides] Error leyendo vehículo activo del conductor:', error);
      },
    );

    return () => unsubscribe();
  }, [userId]);

  // Listener: active ride guard
  useEffect(() => {
    if (!userId) return;

    const db = getDatabase();
    const activeRef = ref(db, getActiveRidesByAreaPath(serviceAreaId || undefined));

    const unsubscribe = onValue(activeRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setActiveRideGuard(null);
        return;
      }

      let found: string | null = null;
      for (const [id, ride] of Object.entries<any>(data)) {
        const status = String(ride?.status || '').toLowerCase();
        if (ride?.driverId === userId && ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) {
          found = id;
          break;
        }
      }

      if (found) {
        setActiveRideGuard({ id: found });
      } else {
        setActiveRideGuard(null);
      }
    });

    return () => unsubscribe();
  }, [userId, serviceAreaId]);

  const selectSnapshotData = useCallback((): Record<string, any> | null => {
    const ridesPath = getActiveRidesByAreaPath(serviceAreaId || undefined);
    const areaKey = `area:${ridesPath}`;
    return ridesSnapshotsRef.current[areaKey] ?? null;
  }, [serviceAreaId]);

  const applySnapshot = useCallback(
    (data: Record<string, any> | null | undefined) => {
      const rideKeys = data ? Object.keys(data) : [];

      if (!data) {
        setRides([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const availableRides: Ride[] = [];

      Object.entries(data).forEach(([rideId, rideData]: [string, any]) => {
        const statusRaw = typeof rideData?.status === 'string' ? rideData.status.trim().toLowerCase() : '';
        const driverId = rideData?.driverId ?? rideData?.driver_id ?? null;

        const isCancelled =
          statusRaw.startsWith('cancel') ||
          statusRaw === 'cancelled' ||
          Boolean(rideData?.cancelReason) ||
          rideData?.paymentCanceled === true ||
          rideData?.cancelled === true ||
          rideData?.canceled === true;
        if (isCancelled) return;

        const isRequested = statusRaw === 'requested' && !driverId;
        const isNegotiatingWithMe = Boolean(userId) && driverId === userId && ['pending_confirm', 'driver_assigned'].includes(statusRaw);

        if (!(isRequested || isNegotiatingWithMe)) return;

        const rideVehicleType = extractRideVehicleTypeForMatching(rideData);
        const vehicleTypeMatches = rideMatchesVehicleType(rideData, selectedDriverVehicleType);
        if (!vehicleTypeMatches) return;

        const offers = rideData.offers || {};
        const myOffer = userId ? offers[userId] : null;

        const origin = normalizeLocation(
          rideData.origin as RawLocation,
          [rideData.originLat, rideData.originLatitude, rideData.pickupLat, rideData.pickupLatitude],
          [rideData.originLng, rideData.originLongitude, rideData.pickupLng, rideData.pickupLongitude],
          rideData.originAddress,
        );
        const destination = normalizeLocation(
          rideData.destination as RawLocation,
          [rideData.destinationLat, rideData.destinationLatitude, rideData.dropoffLat, rideData.dropoffLatitude],
          [rideData.destinationLng, rideData.destinationLongitude, rideData.dropoffLng, rideData.dropoffLongitude],
          rideData.destinationAddress,
        );

        const extraStops = normalizeStops(rideData.extraDestinations || rideData.extra_stops || rideData.additionalStops);

        const requestedAtRaw = rideData.requestedAt ?? rideData.createdAt ?? rideData.created_at ?? Date.now();
        const requestedAt = typeof requestedAtRaw === 'number' ? requestedAtRaw : parseInt(requestedAtRaw, 10) || 0;

        const driverLat = coords?.latitude ?? null;
        const driverLng = coords?.longitude ?? null;

        if (
          driverLat !== null &&
          driverLng !== null &&
          Number.isFinite(origin.lat) &&
          Number.isFinite(origin.lng)
        ) {
          const distanceKm = haversineKm(driverLat, driverLng, origin.lat, origin.lng);
          if (!Number.isFinite(distanceKm) || distanceKm > RIDES_RADIUS_KM) {
            return;
          }
        }

        availableRides.push({
          id: rideId,
          clientId: rideData.clientId || '',
          clientName: rideData.clientName || rideData.client?.name || rideData.clientInfo?.name,
          clientPhone: rideData.clientPhone || rideData.client?.phone || rideData.clientInfo?.phone,
          origin,
          destination,
          estimatedDistance: rideData.estimatedDistance || 0,
          estimatedDuration: rideData.estimatedDuration || 0,
          estimatedPrice: rideData.estimatedPrice || 0,
          status: statusRaw || 'requested',
          clientSuggestedPrice: rideData.clientSuggestedPrice,
          driverOfferedPrice: myOffer?.offeredPrice ?? null,
          driverOfferStatus: myOffer?.status ?? null,
          passengers: rideData.passengers || 1,
          rideType: rideData.rideType || 'normal',
          vehicleType: rideVehicleType ?? undefined,
          paymentMethod: rideData.paymentMethod,
          requestedAt,
          extraDestinations: extraStops,
          waypointsCount: rideData.waypointsCount || extraStops.length || 0,
          hasMultipleDestinations: rideData.hasMultipleDestinations || extraStops.length > 0,
          clientVehiclePhoto: rideData.clientVehiclePhoto || null,
          clientComment: normalizeOptionalText(rideData.clientComment ?? rideData.comment ?? rideData.notes),
        });
      });

      availableRides.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));

      setRides(availableRides);
      setSelectedRideId((current) => (current && availableRides.some((ride) => ride.id === current) ? current : null));
      setLoading(false);
      setRefreshing(false);
    },
    [userId, coords?.latitude, coords?.longitude, selectedDriverVehicleType],
  );

  const applySnapshotRef = useRef(applySnapshot);
  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
  }, [applySnapshot]);

  const selectSnapshotDataRef = useRef(selectSnapshotData);
  useEffect(() => {
    selectSnapshotDataRef.current = selectSnapshotData;
  }, [selectSnapshotData]);

  useEffect(() => {
    applySnapshot(selectSnapshotData());
  }, [applySnapshot, selectSnapshotData, selectedDriverVehicleType]);

  // Listener: rides by area
  useEffect(() => {
    const db = getDatabase();
    const ridesPath = getActiveRidesByAreaPath(serviceAreaId || undefined);
    const pathConfigs = [
      { key: `area:${ridesPath}`, path: ridesPath },
    ];

    const unsubscribes = pathConfigs.map(({ key, path }) => {
      const ridesRef = ref(db, path);
      return onValue(
        ridesRef,
        (snapshot) => {
          const raw = snapshot.val();
          const normalized = raw && typeof raw === 'object' ? raw : null;
          ridesSnapshotsRef.current[key] = normalized;
          const selector = selectSnapshotDataRef.current;
          const handler = applySnapshotRef.current;
          if (handler && selector) {
            handler(selector());
          }
        },
        (error) => {
          console.error(`❌ [AvailableRides] Error escuchando ${path}:`, error);
          ridesSnapshotsRef.current[key] = null;
          const selector = selectSnapshotDataRef.current;
          const handler = applySnapshotRef.current;
          if (handler && selector) {
            handler(selector());
          }
          setLoading(false);
          setRefreshing(false);
        },
      );
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
      });
    };
  }, [serviceAreaId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const db = getDatabase();
      const ridesPath = getActiveRidesByAreaPath(serviceAreaId || undefined);
      const pathConfigs = [
        { key: `area:${ridesPath}`, path: ridesPath },
      ];

      await Promise.all(
        pathConfigs.map(async ({ key, path }) => {
          const ridesRef = ref(db, path);
          const snapshot = await get(ridesRef);
          const raw = snapshot.val();
          ridesSnapshotsRef.current[key] = raw && typeof raw === 'object' ? raw : null;
        }),
      );
      applySnapshot(selectSnapshotData());
    } catch (error) {
      console.error('❌ [AvailableRides] Error refrescando manualmente:', error);
    } finally {
      setRefreshing(false);
    }
  }, [applySnapshot, selectSnapshotData, serviceAreaId]);

  return {
    rides,
    setRides,
    loading,
    refreshing,
    selectedRideId,
    setSelectedRideId,
    activeRideGuard,
    selectedDriverVehicleType,
    handleRefresh,
  };
}
