import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { haversineKm } from '../../../utils/geo/distance';
import {
  ACTIVE_RIDE_STATUSES,
  parseCoordinate,
  type RawRideStop,
} from '../../../utils/driver/driverHomeHelpers';

interface UseDriverActiveRidesOptions {
  userId: string | undefined;
  coords: { latitude?: number; longitude?: number } | null;
  isAvailable: boolean;
  formatCurrency: (value: number) => string;
}

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
  });

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
            return;
          }

          const offers: Record<string, any> = (data as any).offers ?? {};
          const trips: Record<string, any> = (data as any).trips ?? {};
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
            const expired = expMs !== null && expMs < now;

            if (status === 'accepted' && !myPendingNegotiationRide) {
              myPendingNegotiationRide = {
                id: offer.rideId,
                driverId: userId,
                clientId: offer.clientId,
                negotiationStatus: 'driver_accepted',
                status: 'driver_offered',
                ...offer,
              };
              return;
            }
            if (status !== 'pending' || expired) return;
            const c = coordsRef.current;
            if (!c || !isAvailableRef.current || c.latitude == null || c.longitude == null) return;

            availableRides.push({
              id: offer.rideId,
              offerId,
              ...offer,
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

          availableRides.sort((a, b) => a.distance - b.distance);

          const formatted = availableRides.map((ride) => {
            const price = Number.isFinite(ride.clientSuggestedPrice)
              ? Number(ride.clientSuggestedPrice)
              : Number.isFinite(ride.estimatedPrice)
                ? Number(ride.estimatedPrice)
                : 0;
            return {
              id: ride.id,
              latitude: ride?.origin?.latitude ?? null,
              longitude: ride?.origin?.longitude ?? null,
              clientId: ride.clientId,
              rideType: ride.rideType,
              vehicleType: ride.vehicleType,
              serviceCode: ride.serviceCode,
              featureCodes: Array.isArray(ride.featureCodes) ? ride.featureCodes : [],
              clientName: ride.clientName || 'Cliente',
              originAddress: ride.originAddress || 'Origen',
              finalDestination: ride.destinationAddress || 'Destino',
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

          setAvailableRideRequests(finalAvailable);
          setActiveRide(myActiveRide);
          setPendingNegotiationRide(myPendingNegotiationRide);
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
        cleanupFns.push(() => unsubOffers(), () => unsubTrips());
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
