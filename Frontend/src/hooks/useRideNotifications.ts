import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { getFirebaseDatabase } from '../config/firebase';
import { ref, onChildAdded, off } from 'firebase/database';

interface NewRideNotification {
  id: string;
  originAddress: string;
  destinationAddress: string;
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedFare: number;
  rideType: string;
  createdAt: string;
  timestamp: string;
}

export function useRideNotifications(driverId?: string) {
  const [connected, setConnected] = useState(true); // Firebase siempre está "conectado"
  const [newRides, setNewRides] = useState<NewRideNotification[]>([]);
  const notificationsRef = useRef<any>(null);

  useEffect(() => {
    if (!driverId) return;

    setupNotificationsListener();

    return () => {
      cleanupNotificationsListener();
    };
  }, [driverId]);

  const setupNotificationsListener = async () => {
    try {
      const database = await getFirebaseDatabase();
      const notificationsPath = `notifications/${driverId}/rides`;
      const notificationsRefPath = ref(database, notificationsPath);

      notificationsRef.current = notificationsRefPath;

      // Escuchar nuevas notificaciones de viaje
      onChildAdded(notificationsRefPath, (snapshot) => {
        const data = snapshot.val();
        if (data && data.type === 'new_ride') {
          const rideData = data.ride as NewRideNotification;
          console.log('🚗 Nuevo viaje disponible:', rideData);

          setNewRides((prev) => {
            // Evitar duplicados
            if (prev.some((ride) => ride.id === rideData.id)) {
              return prev;
            }
            return [rideData, ...prev];
          });

          // Mostrar notificación
          Alert.alert(
            '🚗 Nuevo Viaje Disponible',
            `${rideData.originAddress} → ${rideData.destinationAddress}\nPrecio: C$${rideData.estimatedFare}`,
            [
              { text: 'Ver después', style: 'cancel' },
              { text: 'Ver ahora', onPress: () => {
                // TODO: Navegar a la pantalla de viajes disponibles
              }},
            ]
          );
        }
      });

      console.log('✅ Listener de notificaciones configurado');
    } catch (error) {
      console.error('❌ Error configurando notificaciones:', error);
    }
  };

  const cleanupNotificationsListener = () => {
    if (notificationsRef.current) {
      off(notificationsRef.current);
      notificationsRef.current = null;
      console.log('🧹 Listener de notificaciones limpiado');
    }
  };

  const clearNewRides = () => {
    setNewRides([]);
  };

  const removeRide = (rideId: string) => {
    setNewRides((prev) => prev.filter((ride) => ride.id !== rideId));
  };

  return {
    connected,
    newRides,
    newRidesCount: newRides.length,
    clearNewRides,
    removeRide,
  };
}
