import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFirebaseData } from '../../shared/firebase/useFirebaseData';
import { mergeName } from '../../../utils/driverInfo';
import { mergeRating } from '../../../utils/rating';
import { hasRidePricingData } from '../../../utils/pricing';

export interface OfferItem {
  driverId: string;
  offeredPrice?: number;
  status?: 'pending' | 'accepted' | 'rejected';
  estimatedArrivalTime?: string;
  driver: {
    name: string;
    rating: number | null;
    photoURL: string | null;
    vehicle?: any;
  };
}

export function useRideOffers(
  initialRideId: string | null,
  userId: string | undefined,
  serviceAreaId: string | null,
  driverFallbackName: string,
) {
  const [rideId, setRideId] = useState<string | null>(initialRideId);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rideSnapshot, setRideSnapshot] = useState<any | null>(null);

  const { data: driversInfo } = useFirebaseData<any>('driversInfo', { maxCacheAge: 10000 });
  // Referencia estable: si esto fuera un literal {} cada render cambiaría la
  // referencia y re-suscribiría el listener del ride en cada render.
  const driversRaw = useMemo<Record<string, any>>(() => ({}), []);

  // Resolve current rideId if not provided — una sola lectura del shard del
  // área (activeRides tiene .read:false a nivel raíz; la suscripción con
  // off()+setTimeout anterior nunca hacía cleanup y quedaba viva).
  useEffect(() => {
    if (rideId || !userId || !serviceAreaId) return;

    let cancelled = false;
    (async () => {
      try {
        const { getDatabase, ref, get } = await import('firebase/database');
        const db = getDatabase();
        const snap = await get(ref(db, `activeRidesByArea/${serviceAreaId}`));
        if (cancelled) return;
        const all = snap.val() || {};
        const mine = Object.entries<any>(all).find(([, r]) => r?.clientId === userId && (
          ['requested', 'driver_offered', 'pending_confirm', 'driver_assigned'].includes(r?.status)
        ));
        if (mine) setRideId(mine[0]);
      } catch (err) {
        console.warn('[useRideOffers] Error resolviendo rideId activo:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [rideId, userId, serviceAreaId]);

  // Listen to active ride and its offers
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!rideId) return;
      const { getDatabase, ref, onValue, off, get } = await import('firebase/database');
      const db = getDatabase();
      // El nodo del ride en activeRides es legible por el cliente dueño e
      // incluye offers en vivo. El shard por área solo sirve para descubrir
      // el rideId (no copia offers ni PII).
      const rideRef = ref(db, `activeRides/${rideId}`);
      const shardRef = serviceAreaId ? ref(db, `activeRidesByArea/${serviceAreaId}/${rideId}`) : null;

      const onRide = async (snapshot: any) => {
        if (!mounted) return;
        let ride = snapshot.val();

        // Si el nodo principal aún no está o falta pricing, complementar con
        // una lectura única del shard.
        if (!ride || !hasRidePricingData(ride)) {
          try {
            if (shardRef) {
              const shardSnap = await get(shardRef);
              if (shardSnap.exists()) {
                ride = { ...(ride || {}), ...shardSnap.val(), offers: ride?.offers };
              }
            }
          } catch (fallbackError) {
            console.warn('[useRideOffers] Error al leer shard activeRidesByArea:', fallbackError);
          }
        }

        setRideSnapshot(ride);

        let offersData = ride?.offers || ride?.driverOffers;
        if (!offersData) {
          const offersRef = ref(db, `activeRides/${rideId}/offers`);
          const offersSnap = await get(offersRef);
          if (offersSnap.exists()) offersData = offersSnap.val();
        }

        if (offersData && typeof offersData === 'object') {
          const arr: OfferItem[] = Object.entries<any>(offersData)
            .filter(([, offer]) => String(offer?.status || 'pending').toLowerCase() !== 'rejected')
            .map(([driverId, offer]) => {
              const info = driversInfo?.[driverId] || {};
              const raw = driversRaw?.[driverId] || {};
              const fullName = mergeName(driverFallbackName, info, raw, offer?.driver);
              const rating = mergeRating(info, raw, offer?.driver ?? offer);
              const photoURL = info?.profilePhoto || info?.photoURL || info?.photoUrl || raw?.profilePhoto || raw?.photoURL || raw?.photoUrl || offer?.driver?.photoURL || null;
              const vehicle = info?.vehicle || info?.activeVehicle || info?.currentVehicle || raw?.vehicle || raw?.activeVehicle || offer?.driver?.vehicle || undefined;
              return {
                driverId,
                offeredPrice: offer?.offeredPrice,
                status: offer?.status || 'pending',
                estimatedArrivalTime: offer?.estimatedArrivalTime,
                driver: {
                  name: fullName,
                  rating,
                  photoURL,
                  vehicle,
                },
              };
            });
          arr.sort((a, b) => {
            const sa = a.status === 'accepted' ? 0 : 1;
            const sb = b.status === 'accepted' ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return (a.offeredPrice ?? 0) - (b.offeredPrice ?? 0);
          });
          setOffers(arr);
          setSelectedDriverId((prev) => {
            if (prev && arr.some((offer) => offer.driverId === prev)) {
              return prev;
            }
            const acceptedOffer = arr.find((offer) => offer.status === 'accepted');
            if (acceptedOffer) {
              return acceptedOffer.driverId;
            }
            return null;
          });
        } else {
          setOffers([]);
        }
        setLoading(false);
      };

      onValue(rideRef, onRide);
      cleanup = () => { try { off(rideRef); } catch {} };
    })();

    return () => { mounted = false; if (cleanup) cleanup(); };
  }, [rideId, driversInfo, driversRaw, serviceAreaId, driverFallbackName]);

  const reset = useCallback(() => {
    setRideId(null);
    setRideSnapshot(null);
    setOffers([]);
    setSelectedDriverId(null);
    setLoading(true);
  }, []);

  return {
    rideId,
    offers,
    selectedDriverId,
    setSelectedDriverId,
    loading,
    rideSnapshot,
    driversInfo,
    driversRaw,
    reset,
  };
}
