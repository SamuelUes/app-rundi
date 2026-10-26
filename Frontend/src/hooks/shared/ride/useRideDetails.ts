import { useEffect, useState } from 'react';
import { initializeFirebase } from '../../../config/firebase';

export interface RideDetails {
  originAddress: string | null;
  destinationAddress: string | null;
  estimatedDistance: number;
  estimatedDuration: number;
  finalFare: number;
  estimatedPrice: number;
  serviceCode?: string | null;
  featureCodes?: string[];
  surgeMultiplier?: number;
  driverId?: string;
  driver?: any;
}

export function useRideDetails(rideId: string, fallbackAmount: number): {
  rideDetails: RideDetails | null;
  loading: boolean;
} {
  const [rideDetails, setRideDetails] = useState<RideDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const { app } = await initializeFirebase();
        if (!app) throw new Error('Firebase no inicializado');

        const { getDatabase, ref, get } = await import('firebase/database');
        const db = getDatabase(app);
        const rideRef = ref(db, `activeRides/${rideId}`);
        const snapshot = await get(rideRef);

        if (isMounted) {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setRideDetails({
              originAddress: data.origin?.address || null,
              destinationAddress: data.destination?.address || null,
              estimatedDistance: data.estimatedDistance || 0,
              estimatedDuration: data.estimatedDuration || 0,
              finalFare: data.finalFare || data.estimatedPrice || fallbackAmount,
              estimatedPrice: data.estimatedPrice || 0,
              serviceCode:
                data.pricingSnapshot?.serviceCode ??
                data.serviceCode ??
                null,
              featureCodes: Array.isArray(data.featureCodes)
                ? data.featureCodes
                : Array.isArray(data.pricingSnapshot?.featureCodes)
                  ? data.pricingSnapshot.featureCodes
                  : [],
              surgeMultiplier: Number(data.surgeMultiplier ?? data.pricingSnapshot?.surgeMultiplier ?? 1),
              driverId: data.driverId,
              driver: data.driver,
            });
          } else {
            console.log('Viaje no encontrado en activeRides, usando datos de params');
          }
        }
      } catch (error: any) {
        console.error('Error loading ride details:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [rideId, fallbackAmount]);

  return { rideDetails, loading };
}
