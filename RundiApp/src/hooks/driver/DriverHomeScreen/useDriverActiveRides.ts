import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { haversineKm } from '../../../utils/geo/distance';
import { extractRequestedFeatureCodes } from '../../../utils/ride/availableRidesHelpers';
import { getCurrentServiceAreaId } from '../../../utils/geo/serviceArea';
import { RIDES_RADIUS_KM } from '../../../constants/rideRadius';
import { compareRideOrder } from '../../../utils/ride/rideOrder';
import { setDriverEngaged } from '../../../live/driverEngagement';
import {
  setEngagementOverlay,
  type EngagementOverlayRide,
} from '../../../services/ride/proximityService';
import {
  ACTIVE_RIDE_STATUSES,
  isPendingDispatchOffer,
  parseCoordinate,
  type RawRideStop,
} from '../../../utils/driver/driverHomeHelpers';

interface UseDriverActiveRidesOptions {
  userId: string | undefined;
  coords: { latitude?: number; longitude?: number } | null;
  isAvailable: boolean;
  formatCurrency: (value: number) => string;
}

// Contexto que la burbuja/Live Activity muestra mientras el conductor está
// comprometido: precio acordado/ofertado y distancia al origen si hay GPS.
const buildEngagementOverlayRide = (
  ride: any | null,
  kind: EngagementOverlayRide['kind'],
  driverCoords: { latitude?: number; longitude?: number } | null,
): EngagementOverlayRide | null => {
  if (!ride) return null;
  const price = Number.isFinite(ride?.finalFare)
    ? Number(ride.finalFare)
    : Number.isFinite(ride?.offeredPrice)
      ? Number(ride.offeredPrice)
      : Number.isFinite(ride?.clientSuggestedPrice)
        ? Number(ride.clientSuggestedPrice)
        : Number.isFinite(ride?.estimatedPrice)
          ? Number(ride.estimatedPrice)
          : 0;
  const originLat = ride?.origin?.latitude ?? ride?.origin?.lat;
  const originLng = ride?.origin?.longitude ?? ride?.origin?.lng;
  const distanceKm =
    driverCoords?.latitude != null &&
    driverCoords?.longitude != null &&
    typeof originLat === 'number' &&
    typeof originLng === 'number'
      ? haversineKm(driverCoords.latitude, driverCoords.longitude, originLat, originLng)
      : undefined;
  return {
    rideId: ride.id,
    clientName: ride?.clientName ?? null,
    price,
    distanceKm,
    kind,
  };
};

export function useDriverActiveRides({
  userId,
  coords,
  isAvailable,
  formatCurrency,
}: UseDriverActiveRidesOptions) {
  const [availableRideRequests, setAvailableRideRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [pendingNegotiationRide, setPendingNegotiationRide] = useState<any | null>(null);
  const [rideSnapshotsVersion, setRideSnapshotsVersion] = useState(0);

  const rideStatusCacheRef = useRef<Record<string, string>>({});
  const activeRideSnapshotsRef = useRef<Record<string, Record<string, any> | null | undefined>>({});
  const coordsRef = useRef(coords);
  const isAvailableRef = useRef(isAvailable);
  const formatCurrencyRef = useRef(formatCurrency);

  useEffect(() => {
    coordsRef.current = coords;
    isAvailableRef.current = isAvailable;
    formatCurrencyRef.current = formatCurrency;
  });

  const processSnapshotRef = useRef<((data: Record<string, any> | null) => void) | null>(null);

  const selectSnapshotData = (): Record<string, any> => ({
    offers: activeRideSnapshotsRef.current.offers ?? {},
    trips: activeRideSnapshotsRef.current.trips ?? {},
    requested: activeRideSnapshotsRef.current.requested ?? {},
  });

  useEffect(() => {
    if (!userId) {
      setAvailableRideRequests([]);
      setActiveRide(null);
      setPendingNegotiationRide(null);
      setDriverEngaged(false);
      void setEngagementOverlay(null);
      return;
    }

    rideStatusCacheRef.current = {};
    activeRideSnapshotsRef.current = {};

    let cleanupFns: Array<() => void> = [];
    let isMounted = true;

    (async () => {
      try {
        const auth = await getFirebaseAuth();
        if (!auth.currentUser || auth.currentUser.uid !== userId) return;

        const db = await getFirebaseFirestore();
        if (!isMounted || !auth.currentUser || auth.currentUser.uid !== userId) return;

        const offersQuery = query(
          collection(db, FS_COL.driverOffers),
          where('driverId', '==', userId),
        );
        const myTripsQuery = query(
          collection(db, FS_COL.tripsLive),
          where('driverId', '==', userId),
        );

        const processSnapshot = (data: Record<string, any> | null) => {
          if (!isMounted) return;

          if (!data || typeof data !== 'object') {
            setAvailableRideRequests([]);
            setActiveRide(null);
            setPendingNegotiationRide(null);
            setDriverEngaged(false);
            void setEngagementOverlay(null);
            return;
          }

          const offers: Record<string, any> = (data as any).offers ?? {};
          const trips: Record<string, any> = (data as any).trips ?? {};
          const requested: Record<string, any> = (data as any).requested ?? {};
          const now = Date.now();

          const availableRides: any[] = [];
          let myActiveRide: any = null;
          let myPendingNegotiationRide: any = null;

          // Viajes donde soy driver (participant read permitido por reglas).
          // `id` = UUID SQL (rideId proyectado) para REST; `liveId` = doc id
          // de trips_live (firebaseRideId) para listeners Firestore.
          Object.entries<any>(trips).forEach(([liveId, ridePayload]) => {
            const rideStatus = ridePayload?.status || '';
            const sqlId = ridePayload?.rideId ?? liveId;
            if (ACTIVE_RIDE_STATUSES.includes(rideStatus)) {
              myActiveRide = { id: sqlId, liveId, ...ridePayload };
            }
            if (
              rideStatus === 'driver_offered' &&
              !myPendingNegotiationRide
            ) {
              myPendingNegotiationRide = { id: sqlId, liveId, ...ridePayload };
            }
          });

          // Ofertas pendientes del dispatch backend → solicitudes disponibles
          Object.entries<any>(offers).forEach(([offerId, offer]) => {
            const status = String(offer?.status || '');
            const expMs =
              typeof offer?.expiresAt?.toMillis === 'function'
                ? offer.expiresAt.toMillis()
                : typeof offer?.expiresAt === 'number'
                  ? offer.expiresAt
                  : null;

            // Mi contraoferta: la negociación vive en ride_offers (SQL) porque
            // trips_live.driverId sigue NULL hasta que el cliente asigna —
            // por eso trips nunca devuelve 'driver_offered' para mí.
            const isCounterOffer =
              offer?.kind === 'counter_offer' ||
              (Number.isFinite(offer?.offeredPrice) && expMs === null);
            if (isCounterOffer) {
              if (status === 'pending' && !myPendingNegotiationRide) {
                myPendingNegotiationRide = {
                  id: offer.rideId ?? offerId,
                  liveId: offer.firebaseRideId ?? offer.rideId ?? offerId,
                  clientId: offer.clientId,
                  status: 'driver_offered',
                  offeredPrice: offer.offeredPrice,
                  clientSuggestedPrice: offer.clientSuggestedPrice,
                  estimatedPrice: offer.estimatedPrice,
                  clientName: offer.clientName,
                  origin: offer.origin,
                  destination: offer.destination,
                  extraDestinations: offer.extraDestinations,
                  featureCodes: offer.featureCodes,
                };
              }
              return;
            }
            if (!isPendingDispatchOffer(status, expMs, now)) return;
            const c = coordsRef.current;
            if (!c || !isAvailableRef.current || c.latitude == null || c.longitude == null) return;

            availableRides.push({
              ...offer,
              id: offer.rideId,
              offerId,
              distance: Number.isFinite(offer.distanceKm)
                ? offer.distanceKm
                : haversineKm(
                    c.latitude,
                    c.longitude,
                    offer?.origin?.latitude ?? 0,
                    offer?.origin?.longitude ?? 0,
                  ),
            });
          });

          const c = coordsRef.current;
          if (c?.latitude != null && c?.longitude != null && isAvailableRef.current) {
            Object.entries<any>(requested).forEach(([liveId, ride]) => {
              if (ride.driverId) return;
              const lat = ride.origin?.latitude ?? ride.origin?.lat;
              const lng = ride.origin?.longitude ?? ride.origin?.lng;
              if (typeof lat !== 'number' || typeof lng !== 'number') return;
              const distance = haversineKm(c.latitude!, c.longitude!, lat, lng);
              if (distance > RIDES_RADIUS_KM) return;
              const sqlId = ride.rideId ?? liveId;
              if (availableRides.some((item) => item.id === sqlId)) return;
              availableRides.push({ ...ride, id: liveId, distance });
            });
          }

          availableRides.sort((a, b) => compareRideOrder(
            { distance: a.distance, requestedAt: a.requestedAt ?? a.createdAt, id: a.id },
            { distance: b.distance, requestedAt: b.requestedAt ?? b.createdAt, id: b.id },
          ));

          const formatted = availableRides.map((ride) => {
            const price = Number.isFinite(ride.clientSuggestedPrice)
              ? Number(ride.clientSuggestedPrice)
              : Number.isFinite(ride.estimatedPrice)
                ? Number(ride.estimatedPrice)
                : 0;
            return {
              id: ride.id,
              latitude: ride?.origin?.latitude ?? ride?.origin?.lat ?? null,
              longitude: ride?.origin?.longitude ?? ride?.origin?.lng ?? null,
              clientId: ride.clientId,
              rideType: ride.rideType,
              vehicleType: ride.vehicleType,
              serviceCode: ride.serviceCode ?? ride.service_code ?? ride.pricingSnapshot?.serviceCode,
              featureCodes: extractRequestedFeatureCodes(ride),
              clientName: ride.clientName || 'Cliente',
              originAddress: ride.originAddress || ride.origin?.address || 'Origen',
              finalDestination: ride.destinationAddress || ride.destination?.address || 'Destino',
              priceLabel: formatCurrencyRef.current(price),
              priceAmount: price,
              passengers: ride.passengers ?? 1,
              distanceKm: Number.isFinite(ride.distance) ? Number(ride.distance) : null,
              destinationLat: ride?.destination?.latitude,
              destinationLng: ride?.destination?.longitude,
              offerId: ride.offerId,
            };
          });

          const finalAvailable = myPendingNegotiationRide ? [] : formatted;

          if (__DEV__) {
            console.log('[DriverHome rides]', {
              requested: Object.keys(requested).length,
              offers: Object.keys(offers).length,
              nearby: availableRides.length,
              visible: finalAvailable.length,
              available: isAvailableRef.current,
              hasCoords: coordsRef.current?.latitude != null && coordsRef.current?.longitude != null,
              pendingNegotiation: Boolean(myPendingNegotiationRide),
            });
          }
          setAvailableRideRequests(finalAvailable);
          setActiveRide(myActiveRide);
          setPendingNegotiationRide(myPendingNegotiationRide);
          setDriverEngaged(Boolean(myActiveRide || myPendingNegotiationRide));
          void setEngagementOverlay(
            buildEngagementOverlayRide(myActiveRide, 'active', coordsRef.current) ??
            buildEngagementOverlayRide(myPendingNegotiationRide, 'negotiation', coordsRef.current),
          );
          setRideSnapshotsVersion((prev) => prev + 1);
        };
        processSnapshotRef.current = processSnapshot;

        const unsubOffers = onSnapshot(
          offersQuery,
          (snapshot) => {
            const normalized: Record<string, any> = {};
            snapshot.docs.forEach((d) => {
              normalized[d.id] = { id: d.id, ...d.data() };
            });
            activeRideSnapshotsRef.current.offers = normalized;
            processSnapshot(selectSnapshotData());
          },
          (err) => {
            if (!isMounted) return;
            console.error(`❌ [DriverHomeScreen] Error escuchando ${FS_COL.driverOffers}:`, err);
          },
        );
        const unsubTrips = onSnapshot(
          myTripsQuery,
          (snapshot) => {
            const normalized: Record<string, any> = {};
            snapshot.docs.forEach((d) => {
              normalized[d.id] = { id: d.id, ...d.data() };
            });
            activeRideSnapshotsRef.current.trips = normalized;
            processSnapshot(selectSnapshotData());
          },
          (err) => {
            if (!isMounted) return;
            console.error(`❌ [DriverHomeScreen] Error escuchando ${FS_COL.tripsLive}:`, err);
          },
        );
        const unsubRequested = onSnapshot(
          query(collection(db, FS_COL.tripsLive),
            where('serviceAreaId', '==', getCurrentServiceAreaId()),
            where('status', '==', 'requested')),
          (snapshot) => {
            const requested: Record<string, any> = {};
            snapshot.docs.forEach((d) => { requested[d.id] = d.data(); });
            activeRideSnapshotsRef.current.requested = requested;
            processSnapshot(selectSnapshotData());
          },
          (err) => console.error('[DriverHomeScreen] Error escuchando solicitudes:', err),
        );
        cleanupFns.push(() => unsubOffers(), () => unsubTrips(), () => unsubRequested());
      } catch (err) {
        console.error('❌ [DriverHomeScreen] Error configurando listeners de activeRides:', err);
      }
    })();

    return () => {
      isMounted = false;
      processSnapshotRef.current = null;
      cleanupFns.forEach((fn) => fn?.());
    };
  // Las queries solo dependen del driver — los listeners no se recrean al
  // moverse el conductor ni al cambiar su disponibilidad.
  }, [userId]);

  // Ubicación/disponibilidad cambian → reprocesar lo ya cacheado sin tocar
  // los listeners (distancia y gating de ofertas dependen de coords).
  useEffect(() => {
    processSnapshotRef.current?.(selectSnapshotData());
  }, [coords?.latitude, coords?.longitude, isAvailable, userId]);

  return {
    availableRideRequests,
    setAvailableRideRequests,
    activeRide,
    setActiveRide,
    pendingNegotiationRide,
    setPendingNegotiationRide,
    rideSnapshotsVersion,
  };
}
