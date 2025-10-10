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
    try {
      const backendUrl = backendConfig.getApiUrl();
      const response = await fetch(`${backendUrl}/tracking/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rideId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: location.coords.speed,
          heading: location.coords.heading,
          accuracy: location.coords.accuracy,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTotalPoints((prev) => prev + 1);
        lastSavedLocation.current = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: location.coords.speed,
          heading: location.coords.heading,
          accuracy: location.coords.accuracy,
          timestamp: new Date().toISOString(),
        };
        console.log('✅ Ubicación guardada:', totalPoints + 1);
      } else {
        console.error('❌ Error guardando ubicación:', data.message);
        setError(data.message);
      }
    } catch (err: any) {
      console.error('❌ Error en saveLocation:', err);
      setError(err.message);
    }
  };

  // Iniciar tracking
  useEffect(() => {
    let mounted = true;

    const startTracking = async () => {
      if (!isActive || !rideId) {
        console.log('⏸️ Tracking pausado (viaje no activo)');
        return;
      }

      try {
        // Solicitar permisos
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Permisos de ubicación denegados');
          return;
        }

        console.log('🎯 Iniciando tracking para viaje:', rideId);
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
            if (mounted) {
              setCurrentLocation(location);
            }
          }
        );

        // Guardar ubicación cada X segundos
        saveInterval.current = setInterval(async () => {
          if (currentLocation) {
            await saveLocation(currentLocation);
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
