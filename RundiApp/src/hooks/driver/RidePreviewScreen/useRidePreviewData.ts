import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import alertService from '../../../services/notification/alertService';
import proximityService from '../../../services/ride/proximityService';
import { extractRequestedFeatureCodes } from '../../../utils/ride/rideFeatureLabels';

export interface RideLocation {
  lat: number;
  lng: number;
  address?: string;
}

export interface RidePreviewData {
  id: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  origin: RideLocation;
  destination: RideLocation;
  extraDestinations?: RideLocation[];
  estimatedPrice: number;
  pricingSnapshot?: { dynamicMinimumFare?: number } | null;
  estimatedDistance?: number;
  estimatedDuration?: number;
  featureCodes?: string[];
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number | null;
  driverOfferStatus?: string | null;
  paymentMethod?: 'cash' | 'card';
  negotiationStatus?: string | null;
  rideType?: string | null;
  clientVehiclePhoto?: string | null;
  clientComment?: string | null;
  isProgrammed?: boolean;
  scheduledAt?: number | null;
}

export const toNumberOrNull = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function useRidePreviewData(
  ride: RidePreviewData,
  userId: string | undefined,
  t: (path: string, options?: Record<string, any>) => string,
  navigation: any,
) {
  const [rideData, setRideData] = useState<RidePreviewData>(ride);
  const [activeRideGuard, setActiveRideGuard] = useState<string | null>(null);
  const [counterOfferTouched, setCounterOfferTouched] = useState(false);
  const cancellationHandledRef = useRef(false);
  const lastRedirectedRideIdRef = useRef<string | null>(null);

  const markDismissed = async (rideId: string) => {
    try {
      await proximityService.markRideDismissed(rideId);
      await proximityService.dismissProximityNotification(rideId);
    } catch (err) {
      console.warn('[useRidePreviewData] No se pudo marcar ride como descartado:', err);
    }
  };

  // Listener: active ride guard
  // Lee la proyección por área: la raíz de activeRides tiene .read=false en las rules.
  useEffect(() => {
    if (!userId) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      unsub = onSnapshot(
        query(collection(db, FS_COL.tripsLive), where('driverId', '==', userId)),
        (snapshot) => {
          let found: string | null = null;
          for (const d of snapshot.docs) {
            const status = String(d.data()?.status || '').toLowerCase();
            if (['driver_assigned', 'accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)) {
              found = d.id;
              break;
            }
          }

          if (found) {
            setActiveRideGuard(found);
            // Solo reemplazar cuando la pantalla está enfocada y una sola vez
            // por ride: una pantalla enterrada duplicaría ActiveRide.
            const focused = navigation.isFocused ? navigation.isFocused() : true;
            if (focused && lastRedirectedRideIdRef.current !== found) {
              lastRedirectedRideIdRef.current = found;
              navigation.replace('ActiveRide', { rideId: found });
            }
          } else {
            setActiveRideGuard(null);
          }
        },
        () => setActiveRideGuard(null),
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [userId, navigation]);

  // Listeners v2:
  // - REALTIME_trips_live/{rideId}: solo legible si soy participante (falla
  //   silenciosa hasta que el cliente confirme al driver).
  // - REALTIME_driver_offers/{rideId}_{uid}: siempre legible para el
  //   oferente — refleja status/offeredPrice de mi oferta.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const handleRideData = (data: any) => {
      if (!data) return;

      const normalizedStatus = String(data.status || '').toLowerCase();
      if ((normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') && !cancellationHandledRef.current) {
        cancellationHandledRef.current = true;
        const reason = data.cancelReason || t('driver.ridePreview.alerts.canceledOtherReason');
        alertService.showInfoAlert(t('driver.ridePreview.alerts.canceledTitle'), reason);
        markDismissed(ride.id)
          .catch((error) => console.warn('[useRidePreviewData] Error al descartar:', error))
          .finally(() => navigation.goBack());
        return;
      }

      const assignedDriverId = data.driverId;
      if (
        assignedDriverId &&
        assignedDriverId !== userId &&
        !cancellationHandledRef.current
      ) {
        const nonRequestedStatuses = [
          'accepted',
          'driver_on_route',
          'driver_arrived',
          'in_progress',
          'completed',
        ];

        if (nonRequestedStatuses.includes(normalizedStatus)) {
          cancellationHandledRef.current = true;
          alertService.showInfoAlert(
            t('driver.ridePreview.alerts.unavailableTitle'),
            t('driver.ridePreview.alerts.unavailableBody'),
          );
          markDismissed(ride.id)
            .catch((error) =>
              console.warn('[useRidePreviewData] Error al descartar viaje no disponible:', error),
            )
            .finally(() => navigation.goBack());
          return;
        }
      }

      setRideData((prev) => ({
        ...prev,
        clientId: data.clientId || prev.clientId,
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination,
        extraDestinations: data.extraDestinations || data.extraStops || prev.extraDestinations,
        estimatedPrice:
          typeof data.estimatedPrice === 'number' ? data.estimatedPrice : prev.estimatedPrice,
        estimatedDistance:
          typeof data.estimatedDistance === 'number' ? data.estimatedDistance : prev.estimatedDistance,
        estimatedDuration:
          typeof data.estimatedDuration === 'number' ? data.estimatedDuration : prev.estimatedDuration,
        clientSuggestedPrice:
          typeof data.clientSuggestedPrice === 'number'
            ? data.clientSuggestedPrice
            : prev.clientSuggestedPrice,
        negotiationStatus: data.negotiationStatus || prev.negotiationStatus || null,
        paymentMethod: data.paymentMethod || prev.paymentMethod,
        clientName: data.clientName || prev.clientName,
        clientPhone: data.clientPhone || prev.clientPhone,
        clientVehiclePhoto: data.clientVehiclePhoto ?? prev.clientVehiclePhoto ?? null,
        rideType: data.rideType || prev.rideType || null,
        featureCodes: Array.isArray(data.featureCodes) || Array.isArray(data.feature_codes) || Array.isArray(data.pricingSnapshot?.featureCodes)
          ? extractRequestedFeatureCodes(data)
          : prev.featureCodes,
        clientComment: data.clientComment ?? data.comment ?? data.notes ?? prev.clientComment ?? null,
      }));
    };

    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;

      unsubs.push(
        onSnapshot(
          query(collection(db, FS_COL.tripsLive), where('driverId', '==', userId)),
          (snap) => {
            const trip = snap.docs.find((d) => d.id === ride.id || d.data()?.rideId === ride.id);
            if (trip) handleRideData(trip.data());
          },
          () => {
            // Sin permiso de participante todavía — esperado antes de aceptar.
          },
        ),
      );

      unsubs.push(
        onSnapshot(
          doc(db, FS_COL.driverOffers, `${ride.id}_${userId}`),
          (snap) => {
            const offer = snap.data();
            if (!offer) return;
            setRideData((prev) => ({
              ...prev,
              driverOfferedPrice: offer?.offeredPrice ?? prev.driverOfferedPrice ?? null,
              driverOfferStatus: offer?.status ?? prev.driverOfferStatus ?? null,
            }));
            // Oferta expirada/rechazada por el sistema = viaje no disponible.
            if (
              ['expired', 'rejected', 'cancelled', 'canceled'].includes(String(offer?.status || '')) &&
              !cancellationHandledRef.current
            ) {
              cancellationHandledRef.current = true;
              alertService.showInfoAlert(
                t('driver.ridePreview.alerts.unavailableTitle'),
                t('driver.ridePreview.alerts.unavailableBody'),
              );
              markDismissed(ride.id)
                .catch((error) => console.warn('[useRidePreviewData] Error al descartar:', error))
                .finally(() => navigation.goBack());
            }
          },
          () => {},
        ),
      );
    })().catch((error) => console.warn('[useRidePreviewData] Error inicializando listeners:', error));

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [ride.id, userId, t, navigation]);

  return {
    rideData,
    setRideData,
    activeRideGuard,
    counterOfferTouched,
    setCounterOfferTouched,
    cancellationHandledRef,
    markDismissed,
  };
}
