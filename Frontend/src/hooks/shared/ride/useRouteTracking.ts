import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '../auth/useAuth';
import backgroundLocationService from '../../../services/backgroundLocationService';
import firebaseTrackingService from '../../../services/firebaseTrackingService';
import { Platform } from 'react-native';
import { useLocation } from '../location/useLocation';

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
  highAccuracy?: boolean; // Usar alta precisión para navegación
  useBackgroundTracking?: boolean; // Usar tracking en segundo plano
}

interface UseRouteTrackingReturn {
  currentLocation: Location.LocationObject | null;
  isTracking: boolean;
  isBackgroundTracking: boolean;
  error: string | null;
  totalPoints: number;
  startTracking: (rideId: string) => Promise<void>;
  stopTracking: () => Promise<void>;
}

/**
 * Hook mejorado para trackear la ruta durante el viaje
 * Soporta tracking en primer y segundo plano
 * Guarda ubicaciones automáticamente y optimiza el consumo de batería
 * Compatible con Android e iOS
 * 
 * ⚠️ TEMPORALMENTE DESHABILITADO PARA DESARROLLO
 */
export const useRouteTracking = ({
  rideId,
  isActive,
  interval = 5000,
  highAccuracy = true,
  useBackgroundTracking = Platform.OS !== 'web', // Activar en móviles por defecto
}: UseRouteTrackingProps): UseRouteTrackingReturn => {
  const { user, userMode } = useAuth();
  
  // Si usamos background tracking, no necesitamos activar el tracking en primer plano
  const locationHook = useLocation({
    backgroundTracking: false, // Lo manejamos manualmente
    highAccuracy,
    interval: Math.min(interval, 3000), // Máximo 3 segundos entre actualizaciones
    minDistance: 10, // 10 metros entre actualizaciones
  });

  const [isTracking, setIsTracking] = useState(false);
  const [isBackgroundTracking, setIsBackgroundTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);

  const saveInterval = useRef<NodeJS.Timeout | null>(null);
  const consecutiveErrorsRef = useRef(0);
  const lastBackgroundIntegrityCheck = useRef(0);

  // =====================================================
  // ✅ TRACKING HABILITADO
  // =====================================================

  // Guardar ubicación actual en Firebase
  const saveLocation = async (status?: 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'pending_payment' | 'pending_rating'): Promise<void> => {
    try {
      if (!locationHook.coords || !rideId) {
        return;
      }

      const { latitude, longitude, speed, heading, accuracy } = locationHook.coords;

      // Guardar en Firebase Realtime DB Y PostgreSQL
      await firebaseTrackingService.updateRideTracking(rideId, {
        driverLocation: {
          latitude,
          longitude,
          speed: speed || 0,
          heading: heading || 0,
          accuracy: accuracy || 0,
          timestamp: Date.now(),
        },
        status: status || 'in_progress',
      });

      setTotalPoints((prev) => prev + 1);

      if (useBackgroundTracking) {
        const now = Date.now();
        if (now - lastBackgroundIntegrityCheck.current > 60_000) {
          lastBackgroundIntegrityCheck.current = now;
          backgroundLocationService.ensureBackgroundTrackingIntegrity().catch((integrityError) => {
            console.warn('⚠️ No se pudo verificar integridad de tracking en segundo plano:', integrityError);
          });
        }
      }
    } catch (err) {
      console.error('❌ Error guardando ubicación:', err);
      consecutiveErrorsRef.current++;

      if (consecutiveErrorsRef.current > 5) {
        setError('Error persistente guardando ubicación');
      }
    }
  };

  const startForegroundTracking = async (): Promise<void> => {
    try {
      console.log('🏹 [TRACKING] Iniciando tracking en primer plano');
      setIsTracking(true);
      setError(null);
      consecutiveErrorsRef.current = 0;

      await saveLocation();

      if (saveInterval.current) {
        clearInterval(saveInterval.current);
      }

      saveInterval.current = setInterval(async () => {
        await saveLocation();
      }, interval);

      console.log('✅ Tracking en primer plano iniciado');
    } catch (err) {
      console.error('❌ Error iniciando tracking en primer plano:', err);
      setError(String(err));
      setIsTracking(false);
    }
  };

  const stopForegroundTracking = (): void => {
    if (saveInterval.current) {
      clearInterval(saveInterval.current);
      saveInterval.current = null;
    }
    setIsTracking(false);
    console.log('🛑 Tracking en primer plano detenido');
  };

  const startTracking = async (newRideId: string = rideId): Promise<void> => {
    console.log('🏹 [TRACKING] Iniciando sistema completo');

    if (!newRideId) {
      setError('No hay rideId para trackear');
      return;
    }

    try {
      await startForegroundTracking();

      if (useBackgroundTracking && user?.id) {
        const isDriverCapable = user.role === 'driver' || user.role === 'designated_driver';
        const role = isDriverCapable && userMode === 'driver' ? 'driver' : 'client';
        const started = await backgroundLocationService.startBackgroundLocationTracking(
          user.id,
          role,
          newRideId,
        );

        setIsBackgroundTracking(started);

        if (!started) {
          console.warn('⚠️ No se pudo iniciar tracking en segundo plano');
        }
      }
    } catch (err) {
      console.error('❌ Error iniciando sistema de tracking:', err);
      setError(String(err));
    }
  };

  const stopTracking = async (): Promise<void> => {
    console.log('🛑 [TRACKING] Deteniendo sistema completo');

    try {
      stopForegroundTracking();

      if (useBackgroundTracking && isBackgroundTracking) {
        await backgroundLocationService.stopBackgroundLocationTracking();
        setIsBackgroundTracking(false);
        console.log('✅ Tracking en segundo plano detenido');
      }
    } catch (err) {
      console.error('❌ Error deteniendo sistema de tracking:', err);
    }
  };

  useEffect(() => {
    if (isActive && rideId) {
      console.log('🏁 Viaje activo, iniciando tracking...');
      startTracking(rideId);
    } else {
      console.log('🛑 Viaje inactivo, deteniendo tracking...');
      stopTracking();
    }

    return () => {
      if (isActive) {
        stopTracking();
      }
    };
  }, [isActive, rideId]);

  useEffect(() => {
    if (!useBackgroundTracking || !isActive) {
      return;
    }

    const integrityInterval = setInterval(() => {
      backgroundLocationService.ensureBackgroundTrackingIntegrity().catch((integrityError) => {
        console.warn('⚠️ Error en verificación programada de tracking en segundo plano:', integrityError);
      });
    }, 120_000);

    return () => {
      clearInterval(integrityInterval);
    };
  }, [useBackgroundTracking, isActive]);

  // Devolver objeto con estado y funcion
  return {
    // Convertir coordenadas a formato LocationObject para compatibilidad
    currentLocation: locationHook.coords
      ? {
          coords: {
            latitude: locationHook.coords.latitude,
            longitude: locationHook.coords.longitude,
            altitude: null,
            accuracy: locationHook.coords.accuracy || null,
            altitudeAccuracy: null,
            heading: locationHook.coords.heading || null,
            speed: locationHook.coords.speed || null,
          },
          timestamp: locationHook.coords.timestamp || Date.now(),
        }
      : null,
    isTracking,
    isBackgroundTracking,
    error,
    totalPoints,
    startTracking,
    stopTracking,
  };
};
