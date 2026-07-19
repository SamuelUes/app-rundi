import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import firebaseTrackingService from '../../../services/firebaseTrackingService';

interface UseDriverTrackingProps {
  rideId: string;
  driverId: string;
  isActive: boolean; // Solo trackear cuando el viaje está activo
}

/**
 * Hook para que el conductor envíe su ubicación en tiempo real
 * Usa Firebase Realtime Database (sin WebSocket)
 */
export function useDriverTracking({ rideId, driverId, isActive }: UseDriverTrackingProps) {
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const isTracking = useRef(false);

  useEffect(() => {
    if (!isActive || !rideId || !driverId) {
      stopTracking();
      return;
    }

    startTracking();

    return () => {
      stopTracking();
    };
  }, [isActive, rideId, driverId]);

  const startTracking = async () => {
    if (isTracking.current) return;

    try {
      // Solicitar permisos
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.error('❌ Permiso de ubicación denegado');
        return;
      }

      console.log('🚗 Iniciando tracking del conductor...');

      // Suscribirse a actualizaciones de ubicación
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Actualizar cada 5 segundos
          distanceInterval: 10, // O cada 10 metros
        },
        async (location) => {
          const { latitude, longitude, speed, heading } = location.coords;

          try {
            // Enviar ubicación a Firebase RTDB
            await firebaseTrackingService.updateDriverLocation(driverId, {
              latitude,
              longitude,
              speed: speed ? speed * 3.6 : undefined, // Convertir m/s a km/h
              heading: heading || undefined,
            });

            console.log(`📍 Ubicación enviada: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          } catch (error) {
            console.error('❌ Error enviando ubicación:', error);
          }
        }
      );

      isTracking.current = true;
      console.log('✅ Tracking iniciado con Firebase RTDB');
    } catch (error) {
      console.error('❌ Error iniciando tracking:', error);
    }
  };

  const stopTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    if (isTracking.current) {
      isTracking.current = false;
      console.log('⏹️ Tracking detenido');
    }
  };

  return {
    isTracking: isTracking.current,
    stopTracking,
  };
}
