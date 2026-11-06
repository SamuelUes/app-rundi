import { useEffect, useRef, useState, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { getRideDetail, getRideLocations } from '../../../api/rides';
import { liveTripDocId, sqlRideIdForTrip } from '../../../live/tripIds';
import rideProgressNotification from '../../../native/rideProgress';

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

// Compone el shape legacy (activeRides/{id}) desde trips_live + REST.
// trips_live proyecta status/origen/contexto pero no precios ni destino;
// esos campos se completan una vez vía getRideDetail + getRideLocations.
async function fetchStaticRideFields(rideId: string): Promise<Record<string, any>> {
  // REST usa el UUID SQL — el caller puede pasar el doc id vivo (firebaseRideId).
  const sqlId = await sqlRideIdForTrip(rideId);
  const [detail, locations] = await Promise.all([
    getRideDetail(sqlId).catch(() => null),
    getRideLocations(sqlId).catch(() => []),
  ]);

  const origin = (locations as any[]).find((l) => l.type === 'origin');
  const destination = (locations as any[]).find((l) => l.type === 'destination');
  const extras = (locations as any[]).filter((l) => l.type === 'extra' || l.type === 'stop');

  return {
    estimatedPrice: (detail as any)?.estimatedPrice ?? 0,
    finalFare: (detail as any)?.finalFare ?? null,
    clientSuggestedPrice: (detail as any)?.clientSuggestedPrice,
    driverOfferedPrice: (detail as any)?.driverOfferedPrice,
    paymentMethod: (detail as any)?.paymentType === 'card_local' ? 'card' : 'cash',
    rideType: (detail as any)?.rideType,
    requestedAt: (detail as any)?.requestedAt,
    origin: origin ? { latitude: origin.lat, longitude: origin.lng, address: origin.address } : undefined,
    destination: destination ? { latitude: destination.lat, longitude: destination.lng, address: destination.address } : undefined,
    extraDestinations: extras.map((e: any) => ({ latitude: e.lat, longitude: e.lng, address: e.address })),
  };
}

export function useRideData(rideId: string, notFoundMessage: string): RideDataState {
  const [ride, setRide] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const lastStatusRef = useRef<string>('');
  const lastSignatureRef = useRef<string>('');
  const staticFieldsRef = useRef<Record<string, any>>({});

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    lastStatusRef.current = '';
    lastSignatureRef.current = '';
    staticFieldsRef.current = {};

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const staticFields = await fetchStaticRideFields(rideId);
        if (!isMounted) return;
        staticFieldsRef.current = staticFields;

        const db = await getFirebaseFirestore();
        unsubscribe = onSnapshot(
          doc(db, FS_COL.tripsLive, await liveTripDocId(rideId)),
          (snap) => {
            if (!isMounted) return;
            const live = snap.exists() ? snap.data() : null;

            if (live) {
              const data = {
                ...staticFieldsRef.current,
                ...live,
                status: live.status,
                // Origen vivo (GeoPoint o mapa) tiene prioridad sobre REST
                ...(live.origin && {
                  origin: {
                    latitude: live.origin.latitude ?? live.origin.lat,
                    longitude: live.origin.longitude ?? live.origin.lng,
                    address: staticFieldsRef.current.origin?.address,
                  },
                }),
              };
              lastStatusRef.current = (live.status ?? '').toString().trim().toLowerCase();
              const signature = rideSignature(data);
              if (signature !== lastSignatureRef.current) {
                lastSignatureRef.current = signature;
                setRide(data);
              }
              setLoadError(null);
              setLoading(false);
              return;
            }

            // Doc eliminado/inexistente: si había snapshot estático (viaje ya
            // archivado a SQL) lo usamos; si no, es un "no encontrado" real.
            if (Object.keys(staticFieldsRef.current).length > 0) {
              setRide((prev: any) => prev ?? { id: rideId, ...staticFieldsRef.current });
            }
            if (!TERMINAL_STATUSES.has(lastStatusRef.current)) {
              setLoadError(notFoundMessage);
            }
            setLoading(false);
          },
          (error) => {
            if (!isMounted) return;
            if (!TERMINAL_STATUSES.has(lastStatusRef.current)) {
              console.warn('[useRideData] Error en listener de viaje:', error);
              setLoadError(notFoundMessage);
            }
            setLoading(false);
          },
        );
      } catch (error) {
        if (!isMounted) return;
        console.warn('[useRideData] Error inicializando:', error);
        setLoadError(notFoundMessage);
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [rideId, notFoundMessage]);

  useEffect(() => {
    if (!ride) return;

    const rawMethod =
      (ride.payment && (ride.payment.method || ride.payment.paymentMethod)) ||
      ride.paymentMethod ||
      ride.payment_type ||
      ride.paymentType;

    if (rawMethod === 'cash' || rawMethod === 'card' || rawMethod === 'card_local') {
      setPaymentMethod(rawMethod === 'card_local' ? 'card' : rawMethod);
    }
  }, [ride]);

  const normalizedStatus = useMemo(() => {
    const raw = (ride?.status ?? ride?.offers?.status ?? ride?.state ?? '').toString();
    return raw.trim().toLowerCase();
  }, [ride?.status, ride?.offers?.status, ride?.state]);

  // Notificación ongoing de progreso (Android; Live Activity cubre iOS)
  useEffect(() => {
    if (!ride) return;
    void rideProgressNotification.updateForRide({
      rideId,
      status: normalizedStatus,
      destinationAddress: ride?.destination?.address ?? null,
    });
  }, [rideId, ride, normalizedStatus]);

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
