import { useCallback, useEffect, useState } from 'react';
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
  const { data: driversRaw } = useFirebaseData<any>('drivers', { maxCacheAge: 10000 });

  // Resolve current rideId if not provided
  useEffect(() => {
    if (rideId) return;
    if (!userId) return;

    let mounted = true;
    (async () => {
      const { getDatabase, ref, onValue, off } = await import('firebase/database');
      const db = getDatabase();
      const path = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
      const activeRidesRef = ref(db, path);
      const unsub = onValue(activeRidesRef, (snap) => {
        if (!mounted) return;
        const all = snap.val() || {};
        const mine = Object.entries<any>(all).find(([, r]) => r?.clientId === userId && (
          r?.status === 'requested' || r?.status === 'driver_offered' || r?.status === 'pending_confirm' || r?.status === 'driver_assigned'
        ));
        if (mine) {
          setRideId(mine[0]);
        }
        setTimeout(() => off(activeRidesRef), 0);
      });
      return () => { try { off(activeRidesRef); } catch {} };
    })();
  }, [rideId, userId, serviceAreaId]);

  // Listen to active ride and its offers
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!rideId) return;
      const { getDatabase, ref, onValue, off, get } = await import('firebase/database');
      const db = getDatabase();
      const basePath = serviceAreaId ? `activeRidesByArea/${serviceAreaId}` : 'activeRides';
      const rideRef = ref(db, `${basePath}/${rideId}`);
      const fallbackRideRef = ref(db, `activeRides/${rideId}`);

      const onRide = async (snapshot: any) => {
        if (!mounted) return;
        let ride = snapshot.val();

        if (!hasRidePricingData(ride)) {
          try {
            const fallbackSnap = await get(fallbackRideRef);
            if (fallbackSnap.exists()) {
              ride = {
                ...fallbackSnap.val(),
                ...ride,
              };
            }
          } catch (fallbackError) {
            console.warn('[useRideOffers] Error al leer fallback activeRides:', fallbackError);
          }
        }

        setRideSnapshot(ride);

        let offersData = ride?.offers || ride?.driverOffers;
        if (!offersData) {
          const offersRef = ref(db, `${basePath}/${rideId}/offers`);
          const offersSnap = await get(offersRef);
          if (offersSnap.exists()) offersData = offersSnap.val();
        }
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
