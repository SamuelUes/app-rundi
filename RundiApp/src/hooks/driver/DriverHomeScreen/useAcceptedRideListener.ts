import { useEffect, useRef } from 'react';
import { useAuth } from '../../shared/auth/useAuth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';

// Mismo set que ACTIVE_RIDE_STATUSES en driverHomeHelpers. 'driver_assigned' se
// excluye a propósito: ese estado también cubre "oferta enviada esperando
// confirmación del cliente" (pending_confirm), que NO debe abrir ActiveRide.
const NAVIGABLE_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];

const isActiveDriverRide = (rideData: any, userId: string): boolean => {
  const status = String(rideData?.status ?? '').trim().toLowerCase();
  const driverId = String(rideData?.driverId ?? rideData?.driver_id ?? '').trim();
  const normalizedUserId = String(userId ?? '').trim();
  return NAVIGABLE_STATUSES.includes(status) && driverId === normalizedUserId;
};

/**
 * useAcceptedRideListener
 * Monitorea cambios en un ride específico o en todos los rides del conductor.
 * Navega automáticamente a ActiveRide cuando el cliente acepta una oferta.
 *
 * Reglas de navegación:
 * - Solo la pantalla enfocada puede reemplazarse a sí misma. Sin este guard,
 *   cada pantalla enterrada en el stack (DriverHome, AvailableRides, etc.)
 *   convertía su propia ruta en otra instancia de ActiveRide — el viaje
 *   "reabría" la pantalla al cambiar de status o al retroceder.
 * - La deduplicación es por rideId: un ride ya manejado nunca re-navega, pero
 *   un ride distinto sí puede abrir ActiveRide más adelante.
 *
 * @param navigation - Objeto de navegación
 * @param rideId - (Opcional) ID del ride a monitorear. Si no se proporciona, monitorea todos los rides del conductor.
 */
export function useAcceptedRideListener(navigation: any, rideId?: string) {
  const { user } = useAuth();
  const handledRideIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !['driver', 'designated_driver'].includes(user.role as any)) {
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    const tryNavigateToActiveRide = (targetRideId: string, rideData: any) => {
      if (handledRideIdsRef.current.has(targetRideId)) return;
      const focused = navigation.isFocused ? navigation.isFocused() : true;
      if (!focused || !isMounted) return;
      handledRideIdsRef.current.add(targetRideId);
      console.log('[useAcceptedRideListener] ✅ Ride aceptado, navegando a ActiveRide:', targetRideId);
      navigation.replace('ActiveRide', {
        rideId: targetRideId,
        clientId: rideData.clientId,
        origin: rideData.origin,
        destination: rideData.destination,
        estimatedFare: rideData.finalFare || rideData.estimatedPrice,
      });
    };

    (async () => {
      try {
        const db = await getFirebaseFirestore();

        const handleDocs = (docs: Array<{ id: string; data: () => any }>) => {
          if (!isMounted) return;
          docs.forEach((d) => {
            const rideData = d.data();
            if (isActiveDriverRide(rideData, user.id)) {
              // El doc id de trips_live es firebaseRideId; la pantalla/REST
              // esperan el UUID SQL que el doc proyecta como `rideId`.
              tryNavigateToActiveRide(rideData?.rideId ?? d.id, rideData);
            }
          });
        };

        if (!isMounted) return;
        const unsub = onSnapshot(
          query(collection(db, FS_COL.tripsLive), where('driverId', '==', user.id)),
          (snap) => handleDocs(rideId
            ? snap.docs.filter((d) => d.id === rideId || d.data()?.rideId === rideId)
            : snap.docs),
          (err) => console.warn('[useAcceptedRideListener] Error escuchando rides:', err),
        );
        cleanup = () => unsub();
      } catch (err) {
        console.error('[useAcceptedRideListener] Error inicializando listener:', err);
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [user?.id, user?.role, navigation, rideId]);

  return null;
}
