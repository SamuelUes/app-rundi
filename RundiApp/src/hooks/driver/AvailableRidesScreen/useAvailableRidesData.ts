import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { getRideDetail } from '../../../api/rides';
import { extractRideVehicleTypeForMatching } from '../../../services/ride/ridesService';
import { RIDES_RADIUS_KM } from '../../../constants/rideRadius';
import { useDriverRideFeatureCapabilities } from '../useDriverRideFeatureCapabilities';
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
} from '../../../utils/ride/availableRidesHelpers';
import { liveTripDocId } from '../../../live/tripIds';

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
    dynamicMinimumFare: rideData.dynamicMinimumFare ?? rideData.pricingSnapshot?.dynamicMinimumFare ?? null,
    driverOfferedPrice: myOffer?.offeredPrice ?? null,
    driverOfferStatus: myOffer?.status ?? null,
    passengers: rideData.passengers || 1,
    rideType: rideData.rideType || 'normal',
    vehicleType: extractRideVehicleTypeForMatching(rideData) ?? undefined,
    designatedDriverVehicle: rideData.designatedDriverVehicle ?? rideData.designated_driver_vehicle ?? null,
    serviceCode: rideData.serviceCode ?? rideData.service_code ?? rideData.pricingSnapshot?.serviceCode ?? undefined,
    featureCodes: Array.isArray(rideData.featureCodes)
      ? rideData.featureCodes.filter((code: unknown): code is string => typeof code === 'string')
      : Array.isArray(rideData.feature_codes)
        ? rideData.feature_codes.filter((code: unknown): code is string => typeof code === 'string')
        : Array.isArray(rideData.pricingSnapshot?.featureCodes)
          ? rideData.pricingSnapshot.featureCodes.filter((code: unknown): code is string => typeof code === 'string')
          : [],
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
  const [selectedDriverVehicleId, setSelectedDriverVehicleId] = useState<string | null>(null);
  const { driverFeatureCodes, vehicleFeatureCodes } =
    useDriverRideFeatureCapabilities(userId, selectedDriverVehicleId);
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

    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      unsub = onSnapshot(
        doc(db, FS_COL.driversLive, userId),
        (snapshot) => {
          const raw = snapshot.data()?.status;
          setDriverStatus(typeof raw === 'string' ? raw.trim().toLowerCase() : 'offline');
          setDriverStatusLoaded(true);
        },
        (error) => {
          console.warn('[AvailableRides] Error leyendo estado del conductor:', error);
          setDriverStatus('offline');
          setDriverStatusLoaded(true);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [userId]);

  // Listener: programmed rides assigned to this driver (viven en nodo separado
  // hasta que el scheduler los promueve a activeRides en la hora programada)
  useEffect(() => {
    if (!userId) {
      setScheduledRides([]);
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      const programmedQuery = query(
        collection(db, FS_COL.programmed),
        where('driverId', '==', userId),
      );

      unsub = onSnapshot(
      programmedQuery,
      (snapshot) => {
        const data: Record<string, any> = {};
        snapshot.docs.forEach((d) => { data[d.id] = { id: d.id, ...d.data() }; });
        const upcoming: Ride[] = [];

        Object.entries<any>(data).forEach(([rideId, rideData]) => {
          const statusRaw = typeof rideData?.status === 'string' ? rideData.status.trim().toLowerCase() : '';
          if (statusRaw === 'canceled' || statusRaw === 'cancelled') return;
          if (!checkRideDriverCompatibility(
            rideData,
            selectedDriverVehicleType,
            driverIsDesignatedMode,
            driverFeatureCodes,
            vehicleFeatureCodes,
          ).ok) return;

          const scheduledAtRaw = rideData?.scheduledAt;
          const scheduledAt = Number.isFinite(Number(scheduledAtRaw)) ? Number(scheduledAtRaw) : null;

          upcoming.push({
            ...buildRide(rideId, rideData, statusRaw || 'accepted', userId),
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
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [
    userId,
    selectedDriverVehicleType,
    driverIsDesignatedMode,
    driverFeatureCodes,
    vehicleFeatureCodes,
  ]);

  // Listener: driver vehicle type
  useEffect(() => {
    if (!userId) {
      setSelectedDriverVehicleType(null);
      setDriverIsDesignatedMode(false);
      setSelectedDriverVehicleId(null);
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      // v2: drivers_live lleva vehicleType + activeServiceCodes (heartbeat del
      // driver). isDesignatedDriverMode queda en el doc DATA-MAIN_drivers.
      unsub = onSnapshot(
        doc(db, FS_COL.driversLive, userId),
        (snapshot) => {
          const info = snapshot.data() as any;
          const resolvedType = resolveSelectedDriverVehicleType(info);
          setSelectedDriverVehicleType(resolvedType);
          setDriverIsDesignatedMode(Boolean(info?.isDesignatedDriverMode));
          setSelectedDriverVehicleId(typeof info?.vehicleId === 'string' ? info.vehicleId : null);
        },
        (error) => {
          console.warn('[AvailableRides] Error leyendo vehículo activo del conductor:', error);
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [userId]);

  // Listener: active ride guard
  useEffect(() => {
    if (!userId) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      // trips_live solo es legible por participante — query por mi driverId.
      unsub = onSnapshot(
        query(collection(db, FS_COL.tripsLive), where('driverId', '==', userId)),
        (snapshot) => {
          let found: string | null = null;
          for (const d of snapshot.docs) {
            const ride = d.data();
            const status = String(ride?.status || '').toLowerCase();
            if (['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) {
              // id = UUID SQL proyectado (REST); liveId = doc id de trips_live.
              found = String(ride?.rideId ?? d.id);
              break;
            }
          }
          setActiveRideGuard(found ? { id: found } : null);
        },
        () => setActiveRideGuard(null),
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
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
    disappeared.forEach(async (rideId) => {
      try {
        const db = await getFirebaseFirestore();
        const snap = await getDoc(doc(db, FS_COL.tripsLive, await liveTripDocId(rideId)));
        const ride = snap.data();
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
    const offers = ridesSnapshotsRef.current['offers'] ?? {};
    const mine = ridesSnapshotsRef.current['mine'] ?? {};
    return { ...offers, ...mine };
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
        const isNegotiatingWithMe = Boolean(userId) && driverId === userId && ['accepted', 'driver_offered'].includes(statusRaw);

        if (!(isRequested || isNegotiatingWithMe)) return;

        if (isRequested) {
          const compatibility = checkRideDriverCompatibility(
            rideData,
            selectedDriverVehicleType,
            driverIsDesignatedMode,
            driverFeatureCodes,
            vehicleFeatureCodes,
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
    [
      userId,
      coords?.latitude,
      coords?.longitude,
      selectedDriverVehicleType,
      driverIsDesignatedMode,
      driverFeatureCodes,
      vehicleFeatureCodes,
    ],
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

  // Listener: ofertas de dispatch (REALTIME_driver_offers donde driverId==yo)
  // + mis trips_live en negociación. En v2 el driver NO puede escanear
  // trips_live ajenos — el matching del consumer crea los docs de oferta.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;

      const reapply = () => {
        const selector = selectSnapshotDataRef.current;
        const handler = applySnapshotRef.current;
        if (handler && selector) handler(selector());
      };

      unsubs.push(
        onSnapshot(
          query(collection(db, FS_COL.driverOffers), where('driverId', '==', userId)),
          async (snap) => {
            const offers: Record<string, any> = {};
            const detailFetches: Array<Promise<void>> = [];
            snap.docs.forEach((d) => {
              const offer = d.data();
              const rideId = String(offer?.rideId ?? '');
              if (!rideId) return;
              // El doc de oferta trae {rideId, clientId, status, distanceKm,
              // expiresAt}; los detalles del viaje van por REST best-effort
              // (403 si el backend no expone detalle a oferentes).
              offers[rideId] = {
                ...offers[rideId],
                rideId,
                clientId: offer?.clientId,
                status: offer?.status === 'pending' ? 'requested' : offer?.status,
                distanceToOriginKm: offer?.distanceKm,
                __offerStatus: offer?.status,
                __offeredPrice: offer?.offeredPrice,
                offers: { [userId]: { offeredPrice: offer?.offeredPrice, status: offer?.status } },
              };
              detailFetches.push(
                getRideDetail(rideId)
                  .then((res: any) => {
                    const detail = res?.ride ?? res;
                    if (detail && typeof detail === 'object') {
                      offers[rideId] = { ...offers[rideId], ...detail, rideId };
                    }
                  })
                  .catch(() => {}),
              );
            });
            await Promise.all(detailFetches);
            ridesSnapshotsRef.current['offers'] = offers;
            reapply();
          },
          (error) => {
            console.error('❌ [AvailableRides] Error escuchando driver_offers:', error);
            ridesSnapshotsRef.current['offers'] = null;
            reapply();
            setLoading(false);
            setRefreshing(false);
          },
        ),
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, FS_COL.tripsLive), where('driverId', '==', userId)),
          (snap) => {
            const mine: Record<string, any> = {};
            snap.docs.forEach((d) => { mine[d.id] = { liveId: d.id, ...d.data() }; });
            ridesSnapshotsRef.current['mine'] = mine;
            reapply();
          },
          (error) => {
            console.error('❌ [AvailableRides] Error escuchando trips_live:', error);
          },
        ),
      );
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [serviceAreaId, userId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const db = await getFirebaseFirestore();
      const offersSnap = await getDocs(
        query(collection(db, FS_COL.driverOffers), where('driverId', '==', userId)),
      );
      const offers: Record<string, any> = {};
      await Promise.all(
        offersSnap.docs.map(async (d) => {
          const offer = d.data();
          const rideId = String(offer?.rideId ?? '');
          if (!rideId) return;
          offers[rideId] = {
            rideId,
            clientId: offer?.clientId,
            status: offer?.status === 'pending' ? 'requested' : offer?.status,
            distanceToOriginKm: offer?.distanceKm,
          };
          try {
            const res: any = await getRideDetail(rideId);
            const detail = (res as any)?.ride ?? res;
            if (detail && typeof detail === 'object') {
              offers[rideId] = { ...offers[rideId], ...detail, rideId };
            }
          } catch {}
        }),
      );
      ridesSnapshotsRef.current['offers'] = offers;
      applySnapshot(selectSnapshotData());
    } catch (error) {
      console.error('❌ [AvailableRides] Error refrescando manualmente:', error);
    } finally {
      setRefreshing(false);
    }
  }, [applySnapshot, selectSnapshotData, serviceAreaId, userId]);

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
    isDriverOnline: driverStatus === 'online' || driverStatus === 'on_ride' || driverStatus === 'available' || driverStatus === 'busy',
    handleRefresh,
  };
}
