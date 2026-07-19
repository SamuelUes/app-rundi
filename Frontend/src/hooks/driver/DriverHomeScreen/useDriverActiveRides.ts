import { useEffect, useRef, useState, useCallback } from 'react';
import { getActiveRidesByAreaPath } from '../../../utils/serviceArea';
import {
  ACTIVE_RIDE_STATUSES,
  calculateDistance,
  parseCoordinate,
  type RawRideStop,
} from '../../../utils/driverHomeHelpers';

interface UseDriverActiveRidesOptions {
  userId: string | undefined;
  coords: { latitude?: number; longitude?: number } | null;
  isAvailable: boolean;
  serviceAreaId: string | null;
  formatCurrency: (value: number) => string;
}

export function useDriverActiveRides({
  userId,
  coords,
  isAvailable,
  serviceAreaId,
  formatCurrency,
}: UseDriverActiveRidesOptions) {
  const [availableRideRequests, setAvailableRideRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [pendingNegotiationRide, setPendingNegotiationRide] = useState<any | null>(null);
  const [rideSnapshotsVersion, setRideSnapshotsVersion] = useState(0);
  const [clientNamesCache, setClientNamesCache] = useState<Record<string, string>>({});

  const rideStatusCacheRef = useRef<Record<string, string>>({});
  const activeRideSnapshotsRef = useRef<Record<string, Record<string, any> | null | undefined>>({});

  useEffect(() => {
    if (!userId) {
      setAvailableRideRequests([]);
      setActiveRide(null);
      setPendingNegotiationRide(null);
      return;
    }

    rideStatusCacheRef.current = {};
    activeRideSnapshotsRef.current = {};

    let cleanupFns: Array<() => void> = [];
    let isMounted = true;

    (async () => {
      try {
        const { getDatabase, ref, onValue } = await import('firebase/database');
        const db = getDatabase();
        const { RIDES_RADIUS_KM } = await import('../../../constants/rideRadius');
        const SEARCH_RADIUS_KM = RIDES_RADIUS_KM;

        const ridesPath = getActiveRidesByAreaPath(serviceAreaId || undefined);
        const pathConfigs = [
          { key: `area:${ridesPath}`, path: ridesPath },
        ];

        const selectSnapshotData = (): Record<string, any> | null => {
          const areaKey = `area:${ridesPath}`;
          return activeRideSnapshotsRef.current[areaKey] ?? null;
        };

        const processSnapshot = (data: Record<string, any> | null) => {
          if (!isMounted) return;

          if (!data || typeof data !== 'object') {
            setAvailableRideRequests([]);
            setActiveRide(null);
            setPendingNegotiationRide(null);
            return;
          }

          const availableRides: any[] = [];
          let myActiveRide: any = null;
          let myPendingNegotiationRide: any = null;

          Object.entries<any>(data).forEach(([rideId, ridePayload]) => {
            const clientIdRaw =
              ridePayload?.clientId ??
              ridePayload?.client_id ??
              ridePayload?.clientUID ??
              ridePayload?.clientUid ??
              ridePayload?.client?.id ??
              ridePayload?.client?.uid ??
              ridePayload?.clientInfo?.id ??
              ridePayload?.clientInfo?.uid ??
              ridePayload?.userId ??
              ridePayload?.user_id ??
              null;

            const clientId =
              typeof clientIdRaw === 'string'
                ? clientIdRaw.trim()
                : clientIdRaw != null
                  ? String(clientIdRaw).trim()
                  : '';

            if (!clientId) {
              return;
            }

            const originLat = parseCoordinate(
              ridePayload?.originLatitude ?? ridePayload?.origin?.latitude ?? ridePayload?.origin?.lat,
            );
            const originLng = parseCoordinate(
              ridePayload?.originLongitude ?? ridePayload?.origin?.longitude ?? ridePayload?.origin?.lng,
            );

            const statusSignature = [
              ridePayload?.status ?? 'unknown',
              originLat !== null ? originLat.toFixed(6) : 'na',
              originLng !== null ? originLng.toFixed(6) : 'na',
              ridePayload?.driverId ?? 'no-driver',
              ridePayload?.updatedAt ?? ridePayload?.updated_at ?? '',
            ].join('|');

            const isRepeated = rideStatusCacheRef.current[rideId] === statusSignature;
            rideStatusCacheRef.current[rideId] = statusSignature;

            const driverIdMatch = ridePayload?.driverId === userId;
            const rideStatus = ridePayload?.status || ridePayload?.driverStatus || ridePayload?.rideStatus;
            if (driverIdMatch && ACTIVE_RIDE_STATUSES.includes(rideStatus)) {
              myActiveRide = { id: rideId, ...ridePayload };
            }

            const statusRaw = typeof ridePayload?.status === 'string' ? ridePayload.status.toLowerCase() : '';

            const negotiationStatusValue =
              ridePayload?.negotiationStatus ?? ridePayload?.negotiation?.negotiationStatus ?? null;
            const negotiationStatusRaw =
              typeof negotiationStatusValue === 'string' ? negotiationStatusValue.toLowerCase() : '';

            const isCancelled =
              statusRaw.startsWith('cancel') ||
              statusRaw === 'cancelled' ||
              ridePayload?.cancelled === true ||
              ridePayload?.canceled === true ||
              ridePayload?.paymentCanceled === true;
            if (isCancelled) {
              return;
            }

            const isRequested = statusRaw === 'requested' && !ridePayload?.driverId;

            const isWaitingClientConfirmation =
              ridePayload?.driverId === userId &&
              negotiationStatusRaw === 'driver_accepted' &&
              (statusRaw === 'pending_confirm' || statusRaw === 'driver_assigned');

            if (isWaitingClientConfirmation && !myPendingNegotiationRide) {
              myPendingNegotiationRide = {
                id: rideId,
                ...ridePayload,
                clientId,
              };
              return;
            }

            const isNegotiatingWithMe =
              ridePayload?.driverId === userId &&
              (statusRaw === 'pending_confirm' || statusRaw === 'driver_assigned');

            if (!(isRequested || isNegotiatingWithMe)) {
              return;
            }

            if (!coords || !isAvailable || coords.latitude == null || coords.longitude == null) {
              return;
            }

            if (originLat === null || originLng === null) {
              return;
            }

            const distance = calculateDistance(coords.latitude, coords.longitude, originLat, originLng);
            if (!Number.isFinite(distance) || distance > SEARCH_RADIUS_KM) {
              return;
            }

            availableRides.push({
              id: rideId,
              ...ridePayload,
              clientId,
              distance,
              originLatitude: originLat,
              originLongitude: originLng,
              _unchangedStatus: isRepeated,
            });
          });

          availableRides.sort((a, b) => a.distance - b.distance);

          const formatted = availableRides
            .map((ride) => {
              const latitude = typeof ride.originLatitude === 'number' ? ride.originLatitude : null;
              const longitude = typeof ride.originLongitude === 'number' ? ride.originLongitude : null;

              if (latitude === null || longitude === null) {
                return null;
              }

              const price = Number.isFinite(ride.clientSuggestedPrice)
                ? Number(ride.clientSuggestedPrice)
                : Number.isFinite(ride.estimatedPrice)
                  ? Number(ride.estimatedPrice)
                  : 0;

              const destinationLat =
                parseCoordinate(
                  ride?.destinationLatitude ??
                    ride?.destinationLat ??
                    ride?.destination?.latitude ??
                    ride?.destination?.lat,
                ) ?? undefined;

              const destinationLng =
                parseCoordinate(
                  ride?.destinationLongitude ??
                    ride?.destinationLng ??
                    ride?.destination?.longitude ??
                    ride?.destination?.lng,
                ) ?? undefined;

              return {
                id: ride.id,
                latitude,
                longitude,
                clientId: ride.clientId,
                clientName:
                  (typeof ride.clientId === 'string' && ride.clientId && clientNamesCache[ride.clientId]) ||
                  ride.client?.name ||
                  ride.clientName ||
                  'Cliente',
                originAddress: ride.originAddress || ride.origin?.address || 'Origen',
                finalDestination: ride.destinationAddress || ride.destination?.address || 'Destino',
                priceLabel: formatCurrency(price),
                priceAmount: price,
                passengers: ride.passengers ?? 1,
                distanceKm: Number.isFinite(ride.distance) ? Number(ride.distance) : null,
                destinationLat,
                destinationLng,
              };
            })
            .filter((item): item is any => Boolean(item));

          const finalAvailable = myPendingNegotiationRide ? [] : formatted;

          setAvailableRideRequests(finalAvailable);
          setActiveRide(myActiveRide);
          setPendingNegotiationRide(myPendingNegotiationRide);
          setRideSnapshotsVersion((prev) => prev + 1);
        };

        pathConfigs.forEach(({ key, path }) => {
          const dbRef = ref(db, path);
          const unsubscribe = onValue(
            dbRef,
            (snapshot) => {
              const raw = snapshot.val();
              const normalized = raw && typeof raw === 'object' ? raw : null;
              activeRideSnapshotsRef.current[key] = normalized;
              processSnapshot(selectSnapshotData());
            },
            (err) => {
              console.error(`❌ [DriverHomeScreen] Error escuchando ${path}:`, err);
              activeRideSnapshotsRef.current[key] = null;
              processSnapshot(selectSnapshotData());
            },
          );
          cleanupFns.push(() => unsubscribe());
        });
      } catch (err) {
        console.error('❌ [DriverHomeScreen] Error configurando listeners de activeRides:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanupFns.forEach((fn) => fn?.());
    };
  }, [coords?.latitude, coords?.longitude, isAvailable, userId, serviceAreaId, clientNamesCache, formatCurrency]);

  // Actualizar clientName en availableRideRequests cuando se resuelven los nombres
  useEffect(() => {
    setAvailableRideRequests((prev) =>
      prev.map((ride) => ({
        ...ride,
        clientName: ride.clientId && clientNamesCache[ride.clientId] ? clientNamesCache[ride.clientId] : ride.clientName,
      }))
    );
  }, [clientNamesCache]);

  // Resolver nombres de clientes desde clientsInfo en Realtime DB
  useEffect(() => {
    const clientIds = availableRideRequests
      .map((ride) => ride.clientId)
      .filter((id): id is string => Boolean(id) && !(id in clientNamesCache));

    if (clientIds.length === 0) return;

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();

        const unsubscribes: Array<() => void> = [];

        clientIds.forEach((clientId) => {
          const clientInfoRef = dbRef(db, `clientsInfo/${clientId}`);
          const unsub = onValue(
            clientInfoRef,
            (snapshot) => {
              if (!isMounted) return;
              const data = snapshot.val();
              const fullName = data?.fullName || 'Cliente';
              setClientNamesCache((prev) => ({
                ...prev,
                [clientId]: fullName,
              }));
            },
            (err) => {
              console.warn(`[DriverHomeScreen] Error leyendo clientsInfo/${clientId}:`, err);
              if (isMounted) {
                setClientNamesCache((prev) => ({
                  ...prev,
                  [clientId]: 'Cliente',
                }));
              }
            }
          );
          unsubscribes.push(() => off(clientInfoRef, 'value', unsub));
        });

        cleanup = () => {
          unsubscribes.forEach((unsub) => unsub());
        };
      } catch (err) {
        console.error('[DriverHomeScreen] Error configurando listeners de clientsInfo:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [availableRideRequests, clientNamesCache]);

  return {
    availableRideRequests,
    setAvailableRideRequests,
    activeRide,
    setActiveRide,
    pendingNegotiationRide,
    setPendingNegotiationRide,
    rideSnapshotsVersion,
    clientNamesCache,
    setClientNamesCache,
  };
}
