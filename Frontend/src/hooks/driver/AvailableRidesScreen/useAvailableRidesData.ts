import { useCallback, useEffect, useRef, useState } from 'react';
import { getDatabase, ref, onValue, get, query, orderByChild, equalTo } from 'firebase/database';
import { extractRideVehicleTypeForMatching } from '../../../services/ridesService';
import { getActiveRidesByAreaPath } from '../../../utils/serviceArea';
import { RIDES_RADIUS_KM } from '../../../constants/rideRadius';
import {
  type Ride,
  type RawLocation,
  normalizeLocation,
  normalizeStops,
  normalizeOptionalText,
  resolveSelectedDriverVehicleType,
  checkRideDriverCompatibility,
  shouldShowRejectedRide,
  haversineKm,
} from '../../../utils/availableRidesHelpers';

const toNullableNumber = (value: any): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildRide = (
  rideId: string,
  rideData: any,
  statusRaw: string,
  userId: string | undefined,
  distanceToOriginKm?: number,
): Ride => {
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

  return {
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
    vehicleType: extractRideVehicleTypeForMatching(rideData) ?? undefined,
    paymentMethod: rideData.paymentMethod,
    requestedAt,
    extraDestinations: extraStops,
    waypointsCount: rideData.waypointsCount || extraStops.length || 0,
    hasMultipleDestinations: rideData.hasMultipleDestinations || extraStops.length > 0,
    clientVehiclePhoto: rideData.clientVehiclePhoto || null,
    clientComment: normalizeOptionalText(rideData.clientComment ?? rideData.comment ?? rideData.notes),
    distanceToOriginKm,
  };
};

export function useAvailableRidesData(
  userId: string | undefined,
  coords: { latitude?: number; longitude?: number } | null,
  serviceAreaId: string | null,
) {
  const [rides, setRides] = useState<Ride[]>([]);
  const [scheduledRides, setScheduledRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [activeRideGuard, setActiveRideGuard] = useState<{ id: string } | null>(null);
  const [selectedDriverVehicleType, setSelectedDriverVehicleType] = useState<'moto' | 'auto' | null>(null);
  const [driverIsDesignatedMode, setDriverIsDesignatedMode] = useState(false);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [driverStatusLoaded, setDriverStatusLoaded] = useState(false);
  const ridesSnapshotsRef = useRef<Record<string, Record<string, any> | null | undefined>>({});

  // Listener: driver online/offline status (driverLocations es la fuente de verdad)
  useEffect(() => {
    if (!userId) {
      setDriverStatus(null);
      setDriverStatusLoaded(false);
      return;
    }

    const db = getDatabase();
    const statusRef = ref(db, `driverLocations/${userId}/status`);

    const unsubscribe = onValue(
      statusRef,
      (snapshot) => {
        const raw = snapshot.val();
        setDriverStatus(typeof raw === 'string' ? raw.trim().toLowerCase() : 'offline');
        setDriverStatusLoaded(true);
      },
      (error) => {
        console.warn('[AvailableRides] Error leyendo estado del conductor:', error);
        setDriverStatus('offline');
        setDriverStatusLoaded(true);
      },
    );

    return () => unsubscribe();
  }, [userId]);

  // Listener: programmed rides assigned to this driver (viven en nodo separado
  // hasta que el scheduler los promueve a activeRides en la hora programada)
  useEffect(() => {
    if (!userId) {
      setScheduledRides([]);
      return;
    }

    const db = getDatabase();
    const programmedQuery = query(
      ref(db, 'programmedRides'),
      orderByChild('driverId'),
      equalTo(userId),
    );

    const unsubscribe = onValue(
      programmedQuery,
      (snapshot) => {
        const data = snapshot.val() || {};
        const upcoming: Ride[] = [];

        Object.entries<any>(data).forEach(([rideId, rideData]) => {
          const statusRaw = typeof rideData?.status === 'string' ? rideData.status.trim().toLowerCase() : '';
          if (statusRaw === 'canceled' || statusRaw === 'cancelled') return;

          const scheduledAtRaw = rideData?.scheduledAt;
          const scheduledAt = Number.isFinite(Number(scheduledAtRaw)) ? Number(scheduledAtRaw) : null;

          upcoming.push({
            ...buildRide(rideId, rideData, statusRaw || 'driver_assigned', userId),
            isProgrammed: true,
            scheduledAt,
            clientConfirmed: Boolean(rideData?.clientConfirmed || rideData?.clientConfirmedAt),
            driverConfirmed: Boolean(rideData?.driverConfirmed || rideData?.driverConfirmedAt),
            driverConfirmationRequestedAt: Number.isFinite(Number(rideData?.driverConfirmationRequestedAt))
              ? Number(rideData.driverConfirmationRequestedAt)
              : null,
          });
        });

        upcoming.sort((a, b) => (a.scheduledAt ?? Number.MAX_SAFE_INTEGER) - (b.scheduledAt ?? Number.MAX_SAFE_INTEGER));
        setScheduledRides(upcoming);
      },
      (error) => {
        console.warn('[AvailableRides] Error escuchando viajes programados:', error);
        setScheduledRides([]);
      },
    );

    return () => unsubscribe();
  }, [userId]);

  // Listener: driver vehicle type
  useEffect(() => {
    if (!userId) {
      setSelectedDriverVehicleType(null);
      setDriverIsDesignatedMode(false);
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
        setDriverIsDesignatedMode(Boolean(info?.isDesignatedDriverMode));
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

  // Fallback del guard de shard: cuando un viaje programado asignado (ya
  // confirmado por el conductor) desaparece de programmedRides, fue promovido
  // — el trigger de sharding puede tardar, así que se verifica activeRides/{id}
  // directo (legible por el conductor asignado).
  const prevScheduledIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!userId) {
      prevScheduledIdsRef.current = null;
      return;
    }
    const confirmedIds = new Set(
      scheduledRides.filter((r) => r.driverConfirmed).map((r) => r.id),
    );
    const prev = prevScheduledIdsRef.current;
    prevScheduledIdsRef.current = confirmedIds;
    if (!prev || !prev.size) {
      return;
    }
    const disappeared = [...prev].filter((id) => !confirmedIds.has(id));
    const db = getDatabase();
    disappeared.forEach(async (rideId) => {
      try {
        const snap = await get(ref(db, `activeRides/${rideId}`));
        const ride = snap.val();
        const status = String(ride?.status || '').toLowerCase();
        if (
          ride &&
          ride.driverId === userId &&
          ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)
        ) {
          setActiveRideGuard({ id: rideId });
        }
      } catch (error) {
        console.warn('[AvailableRides] Fallback activeRideGuard falló:', error);
      }
    });
  }, [scheduledRides, userId]);

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
        const isNegotiatingWithMe = Boolean(userId) && driverId === userId && ['pending_confirm', 'driver_assigned', 'driver_offered'].includes(statusRaw);

        if (!(isRequested || isNegotiatingWithMe)) return;

        if (isRequested) {
          const compatibility = checkRideDriverCompatibility(
            rideData,
            selectedDriverVehicleType,
            driverIsDesignatedMode,
          );
          if (!compatibility.ok) return;

          const visibleAfterRejection = shouldShowRejectedRide(
            rideData?.rejections,
            userId,
            toNullableNumber(rideData?.clientSuggestedPrice),
            toNullableNumber(rideData?.estimatedPrice),
          );
          if (!visibleAfterRejection) return;
        }

        const ride = buildRide(rideId, rideData, statusRaw, userId);

        const driverLat = coords?.latitude ?? null;
        const driverLng = coords?.longitude ?? null;

        if (
          driverLat !== null &&
          driverLng !== null &&
          Number.isFinite(ride.origin.lat) &&
          Number.isFinite(ride.origin.lng)
        ) {
          const distanceKm = haversineKm(driverLat, driverLng, ride.origin.lat, ride.origin.lng);
          if (!Number.isFinite(distanceKm) || distanceKm > RIDES_RADIUS_KM) {
            return;
          }
          ride.distanceToOriginKm = distanceKm;
        }

        availableRides.push(ride);
      });

      availableRides.sort((a, b) => {
        const distA = a.distanceToOriginKm ?? Number.MAX_SAFE_INTEGER;
        const distB = b.distanceToOriginKm ?? Number.MAX_SAFE_INTEGER;
        if (distA !== distB) {
          return distA - distB;
        }
        return (b.requestedAt || 0) - (a.requestedAt || 0);
      });

      setRides(availableRides);
      setSelectedRideId((current) => (current && availableRides.some((ride) => ride.id === current) ? current : null));
      setLoading(false);
      setRefreshing(false);
    },
    [userId, coords?.latitude, coords?.longitude, selectedDriverVehicleType, driverIsDesignatedMode],
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
  }, [applySnapshot, selectSnapshotData, selectedDriverVehicleType, driverIsDesignatedMode]);

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
    scheduledRides,
    loading,
    refreshing,
    selectedRideId,
    setSelectedRideId,
    activeRideGuard,
    selectedDriverVehicleType,
    driverIsDesignatedMode,
    driverStatus,
    driverStatusLoaded,
    isDriverOnline: driverStatus === 'available' || driverStatus === 'busy',
    handleRefresh,
  };
}
