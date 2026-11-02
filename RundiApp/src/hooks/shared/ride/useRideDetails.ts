import { useEffect, useState } from 'react';
import { getRideDetail, getRideLocations } from '../../../api/rides';
import { sqlRideIdForTrip } from '../../../live/tripIds';

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
        const [detail, locations] = await Promise.all([
          // REST exige UUID SQL — el param puede ser el doc id vivo.
          getRideDetail(await sqlRideIdForTrip(rideId)).catch(() => null),
          getRideLocations(await sqlRideIdForTrip(rideId)).catch(() => []),
        ]);

        if (!isMounted) return;
        if (detail || locations.length > 0) {
          const origin = (locations as any[]).find((l) => l.type === 'origin');
          const destination = (locations as any[]).find((l) => l.type === 'destination');
          const d: any = detail ?? {};
          setRideDetails({
            originAddress: origin?.address || null,
            destinationAddress: destination?.address || null,
            estimatedDistance: d.estimatedDistance || 0,
            estimatedDuration: d.estimatedDuration || 0,
            finalFare: d.finalFare || d.estimatedPrice || fallbackAmount,
            estimatedPrice: d.estimatedPrice || 0,
            serviceCode: d.serviceCode ?? d.pricingSnapshot?.serviceCode ?? null,
            featureCodes: Array.isArray(d.featureCodes)
              ? d.featureCodes
              : Array.isArray(d.pricingSnapshot?.featureCodes)
                ? d.pricingSnapshot.featureCodes
                : [],
            surgeMultiplier: Number(d.surgeMultiplier ?? d.pricingSnapshot?.surgeMultiplier ?? 1),
            driverId: d.driverId,
            driver: d.driver,
          });
        } else {
          console.log('Viaje no encontrado, usando datos de params');
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
