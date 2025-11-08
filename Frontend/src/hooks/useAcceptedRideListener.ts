import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDatabase, ref, onValue } from 'firebase/database';

/**
 * useAcceptedRideListener
 * Monitorea cambios en un ride específico o en todos los rides del conductor.
 * Navega automáticamente a ActiveRide cuando el cliente acepta una oferta.
 * 
 * @param navigation - Objeto de navegación
 * @param rideId - (Opcional) ID del ride a monitorear. Si no se proporciona, monitorea todos los rides del conductor.
 */
export function useAcceptedRideListener(navigation: any, rideId?: string) {
  const { user } = useAuth();
  const navigationTriggeredRef = useRef(false);

  useEffect(() => {
    if (!user?.id || user.role !== 'driver') {
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;
    navigationTriggeredRef.current = false;

    (async () => {
      try {
        const db = getDatabase();
        
        // Si se proporciona rideId, monitorear ese ride específicamente
        const refPath = rideId ? `activeRides/${rideId}` : 'activeRides';
        const ridesRef = ref(db, refPath);

        const unsubscribe = onValue(
          ridesRef,
          (snapshot) => {
            if (!isMounted || navigationTriggeredRef.current) return;

            const data = snapshot.val();
            if (!data) return;

            // Si es un ride específico
            if (rideId) {
              if (
                data.status === 'accepted' &&
                data.driverId === user.id
              ) {
                navigationTriggeredRef.current = true;
                console.log('[useAcceptedRideListener] ✅ Ride aceptado, navegando a ActiveRide:', rideId);
                navigation.replace('ActiveRide', {
                  rideId,
                  clientId: data.clientId,
                  origin: data.origin,
                  destination: data.destination,
                  estimatedFare: data.finalFare || data.estimatedPrice,
                });
              }
            } else {
              // Si es monitoreo global, buscar rides aceptados
              Object.entries<any>(data).forEach(([id, rideData]) => {
                if (
                  !navigationTriggeredRef.current &&
                  rideData.status === 'accepted' &&
                  rideData.driverId === user.id
                ) {
                  navigationTriggeredRef.current = true;
                  console.log('[useAcceptedRideListener] ✅ Ride aceptado, navegando a ActiveRide:', id);
                  navigation.replace('ActiveRide', {
                    rideId: id,
                    clientId: rideData.clientId,
                    origin: rideData.origin,
                    destination: rideData.destination,
                    estimatedFare: rideData.finalFare || rideData.estimatedPrice,
                  });
                }
              });
            }
          },
          (err) => {
            console.warn('[useAcceptedRideListener] Error escuchando rides:', err);
          }
        );

        cleanup = () => {
          unsubscribe();
        };
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
