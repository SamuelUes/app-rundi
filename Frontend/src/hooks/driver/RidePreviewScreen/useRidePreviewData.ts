import { useEffect, useRef, useState } from 'react';
import { getDatabase, onValue, ref } from 'firebase/database';
import alertService from '../../../services/alertService';
import proximityService from '../../../services/proximityService';
import { getActiveRidesByAreaPath } from '../../../utils/serviceArea';

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
  estimatedDistance?: number;
  estimatedDuration?: number;
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

    const db = getDatabase();
    const areaRef = ref(db, getActiveRidesByAreaPath());
    const unsubscribe = onValue(areaRef, (snapshot) => {
      const data = snapshot.val();

      let found: string | null = null;
      if (data) {
        const normalizedUserId = String(userId ?? '').trim();
        Object.entries<any>(data).some(([id, r]) => {
          const status = String(r?.status || '').toLowerCase();
          const rideDriverId = String(r?.driverId ?? r?.driver_id ?? '').trim();
          if (
            rideDriverId === normalizedUserId &&
            ['driver_assigned', 'accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status)
          ) {
            found = id;
            return true;
          }
          return false;
        });
      }

      if (found) {
        setActiveRideGuard(found);
        navigation.replace('ActiveRide', { rideId: found });
      } else {
        setActiveRideGuard(null);
      }
    });

    return () => unsubscribe();
  }, [userId, navigation]);

  // Listener: proyección pública por área (legible para cualquier conductor autenticado).
  // Mantiene el preview vivo aunque el conductor aún no tenga acceso a activeRides/{id}
  // (ese acceso llega cuando crea una oferta — ver RTDB rules).
  useEffect(() => {
    const db = getDatabase();
    const areaRef = ref(db, `${getActiveRidesByAreaPath()}/${ride.id}`);

    const unsubscribe = onValue(areaRef, (snapshot) => {
      const data = snapshot.val();
      // Nodo ausente: no inferir cancelación (puede ser lag del geo-shard)
      if (!data) return;

      const normalizedStatus = String(data.status || '').toLowerCase();
      if (normalizedStatus === 'canceled' && !cancellationHandledRef.current) {
        cancellationHandledRef.current = true;
        alertService.showInfoAlert(
          t('driver.ridePreview.alerts.canceledTitle'),
          t('driver.ridePreview.alerts.canceledBody'),
        );
        markDismissed(ride.id)
          .catch((error) => console.warn('[useRidePreviewData] Error al descartar:', error))
          .finally(() => navigation.goBack());
        return;
      }

      const assignedDriverId = data.driverId;
      if (
        assignedDriverId &&
        userId &&
        assignedDriverId !== userId &&
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
        return;
      }

      // Merge de campos visibles del preview (precio, negociación, distancia, nota)
      setRideData((prev) => ({
        ...prev,
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
        clientComment:
          data.clientComment ?? data.comment ?? data.notes ?? prev.clientComment ?? null,
      }));
    });

    return () => unsubscribe();
  }, [ride.id, userId, navigation, t]);

  // Listener: activeRides/{id} — ride data updates + cancellation
  useEffect(() => {
    const db = getDatabase();
    const rideRef = ref(db, `activeRides/${ride.id}`);

    const unsubscribe = onValue(rideRef, (snapshot) => {
      const data = snapshot.val();

      if (!data) {
        if (!cancellationHandledRef.current) {
          cancellationHandledRef.current = true;
          alertService.showInfoAlert(
            t('driver.ridePreview.alerts.canceledTitle'),
            t('driver.ridePreview.alerts.canceledBody'),
          );
          markDismissed(ride.id)
            .catch((error) => console.warn('[useRidePreviewData] Error al descartar:', error))
            .finally(() => navigation.goBack());
        }
        return;
      }

      const normalizedStatus = String(data.status || '').toLowerCase();
      if (normalizedStatus === 'canceled' && !cancellationHandledRef.current) {
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
        userId &&
        assignedDriverId !== userId &&
        !cancellationHandledRef.current
      ) {
        const nonRequestedStatuses = [
          'pending_confirm',
          'driver_assigned',
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

      const offers = data.offers || {};
      const myOffer = userId ? offers[userId] : null;
      const updatedDriverOfferedPrice =
        myOffer?.offeredPrice ?? data.driverOfferedPrice ?? rideData.driverOfferedPrice ?? null;
      const updatedDriverOfferStatus = myOffer?.status ?? rideData.driverOfferStatus ?? null;

      setRideData((prev) => ({
        ...prev,
        clientId: data.clientId || prev.clientId,
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination,
        extraDestinations: data.extraDestinations || prev.extraDestinations,
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
        driverOfferedPrice: updatedDriverOfferedPrice,
        driverOfferStatus: updatedDriverOfferStatus,
        negotiationStatus: data.negotiationStatus || prev.negotiationStatus || null,
        paymentMethod: data.paymentMethod || prev.paymentMethod,
        clientName: data.clientName || prev.clientName,
        clientPhone: data.clientPhone || prev.clientPhone,
        clientVehiclePhoto: data.clientVehiclePhoto ?? prev.clientVehiclePhoto ?? null,
        rideType: data.rideType || prev.rideType || null,
        clientComment: data.clientComment ?? data.comment ?? data.notes ?? prev.clientComment ?? null,
      }));
    });

    return () => unsubscribe();
  }, [ride.id, userId, t, navigation, rideData.driverOfferedPrice, rideData.driverOfferStatus]);

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
