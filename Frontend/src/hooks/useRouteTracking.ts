import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import backendConfig from '../config/backendConfig';

interface RoutePoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  timestamp: string;
}

interface UseRouteTrackingProps {
  rideId: string;
  isActive: boolean; // Solo trackear si el viaje está activo (in_progress)
  interval?: number; // Intervalo en ms (default: 5000 = 5s)
}

interface UseRouteTrackingReturn {
  currentLocation: Location.LocationObject | null;
  isTracking: boolean;
  error: string | null;
  totalPoints: number;
}

/**
 * Hook para trackear la ruta del conductor durante el viaje
 * Guarda ubicaciones automáticamente cada 5 segundos
 * Solo funciona cuando el viaje está en estado 'in_progress'
 */
export const useRouteTracking = ({
  rideId,
  isActive,
  interval = 5000,
}: UseRouteTrackingProps): UseRouteTrackingReturn => {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const saveInterval = useRef<NodeJS.Timeout | null>(null);
  const lastSavedLocation = useRef<RoutePoint | null>(null);

  // Guardar ubicación en el backend
  const saveLocation = async (location: Location.LocationObject) => {
    console.log('🔍 [TRACKING] Intentando guardar ubicación para rideId:', rideId);
    
    // Validar que la ubicación tenga coordenadas válidas
    if (!location?.coords?.latitude || !location?.coords?.longitude) {
      console.warn('⚠️ [TRACKING] Ubicación inválida, omitiendo guardado:', location);
      return;
    }

    console.log('📍 [TRACKING] Datos a guardar:', {
      rideId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed: location.coords.speed || 0,
      heading: location.coords.heading || 0,
      accuracy: location.coords.accuracy || 0,
    });

    try {
      const { getFirebaseFunctions } = await import('../config/firebase');
      const { httpsCallable } = await import('firebase/functions');
      const functions = await getFirebaseFunctions();
      const saveRideLocationFunction = httpsCallable(functions, 'saveRideLocation');
      
      console.log('🚀 [TRACKING] Llamando a Firebase Function saveRideLocation...');
      
      const result = await saveRideLocationFunction({
        rideId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || 0,
        accuracy: location.coords.accuracy || 0,
      });

      console.log('✅ [TRACKING] Respuesta de Firebase:', result.data);

      setTotalPoints((prev) => prev + 1);
      lastSavedLocation.current = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString(),
      };
      console.log(`✅ [TRACKING] Ubicación #${totalPoints + 1} guardada exitosamente en PostgreSQL`);
    } catch (error: any) {
      console.error('❌ [TRACKING] Error en saveLocation:', error?.message || error);
      console.error('❌ [TRACKING] Error completo:', error);
      setError(error?.message || 'Error guardando ubicación');
    }
  };

  // Iniciar tracking
  useEffect(() => {
    let mounted = true;

    const startTracking = async () => {
      console.log('🔍 [TRACKING] Verificando condiciones:', { isActive, rideId });
      
      if (!isActive || !rideId) {
        console.log('⏸️ [TRACKING] Tracking pausado (viaje no activo o sin rideId)');
        return;
      }

      try {
        // Solicitar permisos
        console.log('📱 [TRACKING] Solicitando permisos de ubicación...');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.error('❌ [TRACKING] Permisos de ubicación denegados');
          setError('Permisos de ubicación denegados');
          return;
        }

        console.log('✅ [TRACKING] Permisos concedidos');
        console.log('🎯 [TRACKING] Iniciando tracking para viaje:', rideId);
        console.log('⏱️ [TRACKING] Intervalo de guardado:', interval, 'ms');
        setIsTracking(true);
        setError(null);

        // Suscribirse a actualizaciones de ubicación
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000, // Actualizar cada 1s
            distanceInterval: 5, // O cada 5 metros
          },
          (location) => {
            try {
              console.log('📍 Nueva ubicación del conductor:', {
                latitude: location?.coords?.latitude,
                longitude: location?.coords?.longitude,
                heading: location?.coords?.heading,
                speed: location?.coords?.speed,
                timestamp: location?.timestamp,
              });

              if (mounted) {
                setCurrentLocation(location);
              }
            } catch (error: any) {
              console.error('❌ Error procesando ubicación:', error?.message || error);
            }
          }
        );

        // Guardar ubicación cada X segundos
        console.log('⏰ [TRACKING] Configurando intervalo de guardado cada', interval / 1000, 'segundos');
        saveInterval.current = setInterval(async () => {
          console.log('⏰ [TRACKING] Intervalo disparado - Verificando ubicación...');
          if (currentLocation && currentLocation.coords) {
            console.log('✅ [TRACKING] Ubicación disponible, guardando...');
            await saveLocation(currentLocation);
          } else {
            console.log('⏳ [TRACKING] Esperando ubicación válida para guardar...');
          }
        }, interval);
      } catch (err: any) {
        console.error('❌ Error iniciando tracking:', err);
        setError(err.message);
      }
    };

    const stopTracking = () => {
      console.log('🛑 Deteniendo tracking');
      setIsTracking(false);

      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      if (saveInterval.current) {
        clearInterval(saveInterval.current);
        saveInterval.current = null;
      }
    };

    if (isActive) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      mounted = false;
      stopTracking();
    };
  }, [isActive, rideId, interval]);

  return {
    currentLocation,
    isTracking,
    error,
    totalPoints,
  };
};
