import { useEffect, useRef, useState, useMemo } from 'react';
import { getDatabase, ref, onValue } from 'firebase/database';

export interface RideDataState {
  ride: any | null;
  loading: boolean;
  loadError: string | null;
  normalizedStatus: string;
  paymentMethod: string;
  finalFare: number;
  isAccepted: boolean;
  isDriverOnRoute: boolean;
  isDriverArrived: boolean;
  isInProgress: boolean;
  isCompleted: boolean;
  isCanceled: boolean;
  isPendingPayment: boolean;
  isTerminal: boolean;
}

const TERMINAL_STATUSES = new Set(['completed', 'canceled', 'cancelled', 'rating_completed']);

// Claves que cambian con cada tick de tracking — no deben provocar re-render
// cuando el resto del viaje sigue igual.
const VOLATILE_KEYS = new Set([
  'driverLocation',
  'clientLocation',
  'clientsLocation',
  'lastUpdate',
  'updatedAt',
]);

const rideSignature = (data: any): string => {
  if (!data || typeof data !== 'object') return '';
  const core: Record<string, any> = {};
  Object.keys(data).forEach((key) => {
    if (!VOLATILE_KEYS.has(key)) core[key] = data[key];
  });
  try {
    return JSON.stringify(core);
  } catch {
    return '';
  }
};

export function useRideData(rideId: string, notFoundMessage: string): RideDataState {
  const [ride, setRide] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const lastStatusRef = useRef<string>('');
  const lastSignatureRef = useRef<string>('');

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    lastStatusRef.current = '';
    lastSignatureRef.current = '';
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${rideId}`);

    const unsubscribe = onValue(
      rideRef,
      (snapshot) => {
        const data = snapshot.val();
        if (data) {
          lastStatusRef.current = (data.status ?? '').toString().trim().toLowerCase();
          // El nodo recibe escrituras de tracking cada pocos segundos; si solo
          // cambiaron campos volátiles evitamos re-render de toda la pantalla.
          const signature = rideSignature(data);
          if (signature !== lastSignatureRef.current) {
            lastSignatureRef.current = signature;
            setRide(data);
          }
          setLoadError(null);
          setLoading(false);
          return;
        }

        // Nodo borrado: es el ciclo normal de archivado tras un estado terminal
        // (completed/canceled → archivar y limpiar activeRides). Conservamos el
        // último snapshot para que la pantalla navegue sin mostrar "no existe".
        if (!TERMINAL_STATUSES.has(lastStatusRef.current)) {
          setLoadError(notFoundMessage);
        }
        setLoading(false);
      },
      (error) => {
        // permission_denied tras el cleanup del backend en estado terminal:
        // mismo tratamiento que el borrado del nodo — no es un error real.
        if (!TERMINAL_STATUSES.has(lastStatusRef.current)) {
          console.warn('[useRideData] Error en listener de viaje:', error);
          setLoadError(notFoundMessage);
        }
        setLoading(false);
      },
    );

    return () => unsubscribe();
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
    isDriverArrived: normalizedStatus === 'driver_arrived',
    isInProgress: normalizedStatus === 'in_progress',
    isCompleted: normalizedStatus === 'completed',
    isCanceled: normalizedStatus === 'canceled' || normalizedStatus === 'cancelled',
    isPendingPayment: normalizedStatus === 'pending_payment',
    isTerminal: TERMINAL_STATUSES.has(normalizedStatus),
  };
}
