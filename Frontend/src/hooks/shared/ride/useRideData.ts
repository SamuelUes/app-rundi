import { useEffect, useState, useMemo } from 'react';
import { getDatabase, ref, onValue, off } from 'firebase/database';

export interface RideDataState {
  ride: any | null;
  loading: boolean;
  loadError: string | null;
  normalizedStatus: string;
  paymentMethod: string;
  finalFare: number;
  isAccepted: boolean;
  isDriverOnRoute: boolean;
  isInProgress: boolean;
  isCompleted: boolean;
  isCanceled: boolean;
  isPendingPayment: boolean;
}

export function useRideData(rideId: string, notFoundMessage: string): RideDataState {
  const [ride, setRide] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');

  useEffect(() => {
    setLoading(true);
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);

    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRide(data);
        setLoading(false);
      } else {
        setLoadError(notFoundMessage);
        setLoading(false);
      }
    });

    return () => off(rideRef);
  }, [rideId, notFoundMessage]);

  useEffect(() => {
    if (!ride) return;

    const rawMethod =
      (ride.payment && (ride.payment.method || ride.payment.paymentMethod)) ||
      ride.paymentMethod ||
      ride.payment_type ||
      ride.paymentType;

    if (rawMethod === 'cash' || rawMethod === 'card') {
      setPaymentMethod(rawMethod);
    }
  }, [ride]);

  const normalizedStatus = useMemo(() => {
    const raw = (ride?.status ?? ride?.offers?.status ?? ride?.state ?? '').toString();
    return raw.trim().toLowerCase();
  }, [ride?.status, ride?.offers?.status, ride?.state]);

  const finalFare = ride?.finalFare || ride?.estimatedPrice || 0;

  return {
    ride,
    loading,
    loadError,
    normalizedStatus,
    paymentMethod,
    finalFare,
    isAccepted: normalizedStatus === 'accepted',
    isDriverOnRoute: normalizedStatus === 'driver_on_route',
    isInProgress: normalizedStatus === 'in_progress',
    isCompleted: normalizedStatus === 'completed',
    isCanceled: normalizedStatus === 'canceled',
    isPendingPayment: normalizedStatus === 'pending_payment',
  };
}
