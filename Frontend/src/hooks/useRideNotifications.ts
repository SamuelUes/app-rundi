import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Alert } from 'react-native';
import { WS_URL } from '../config/environment';

const SOCKET_URL = `${WS_URL}/tracking`;

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
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [newRides, setNewRides] = useState<NewRideNotification[]>([]);

  useEffect(() => {
    if (!driverId) return;

    // Conectar al WebSocket
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Conectado al servidor de notificaciones');
      setConnected(true);

      // Registrar conductor como disponible
      socket.emit('driver:register', { driverId });
    });

    socket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor de notificaciones');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Error de conexión:', error);
    });

    // Escuchar nuevos viajes
    socket.on('ride:new', (data: NewRideNotification) => {
      console.log('🚗 Nuevo viaje disponible:', data);
      
      setNewRides((prev) => {
        // Evitar duplicados
        if (prev.some((ride) => ride.id === data.id)) {
          return prev;
        }
        return [data, ...prev];
      });

      // Mostrar notificación
      Alert.alert(
        '🚗 Nuevo Viaje Disponible',
        `${data.originAddress} → ${data.destinationAddress}\nPrecio: C$${data.estimatedFare}`,
        [
          { text: 'Ver después', style: 'cancel' },
          { text: 'Ver ahora', onPress: () => {
            // TODO: Navegar a la pantalla de viajes disponibles
          }},
        ]
      );
    });

    // Cleanup
    return () => {
      if (socket.connected) {
        socket.emit('driver:unregister', { driverId });
        socket.disconnect();
      }
    };
  }, [driverId]);

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
