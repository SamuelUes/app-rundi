import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import backgroundLocationService from '../services/backgroundLocationService';
import firebaseTrackingService from '../services/firebaseTrackingService';
import { Platform } from 'react-native';
import { useLocation } from './useLocation';

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
  const { user } = useAuth();
  
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
      // ✅ NUEVO: Pasar status para que no guarde si el viaje está completado/cancelado
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

      setTotalPoints(prev => prev + 1);
    } catch (err) {
      console.error('❌ Error guardando ubicación:', err);
      consecutiveErrorsRef.current++;
      
      if (consecutiveErrorsRef.current > 5) {
        setError('Error persistente guardando ubicación');
      }
    }
  };

  // Iniciar tracking en primer plano
  const startForegroundTracking = async (): Promise<void> => {
    try {
      console.log('🏹 [TRACKING] Iniciando tracking en primer plano');
      setIsTracking(true);
      setError(null);
      consecutiveErrorsRef.current = 0;

      // Guardar ubicación inmediatamente
      await saveLocation();

      // Luego cada X segundos
      if (saveInterval.current) {
        clearInterval(saveInterval.current);
      }

      saveInterval.current = setInterval(async () => {
        await saveLocation();
      }, interval);

      console.log('✅ Tracking en primer plano iniciado');
    } catch (err) {
      console.error('❌ Error iniciando tracking:', err);
      setError(String(err));
      setIsTracking(false);
    }
  };

  // Detener tracking en primer plano
  const stopForegroundTracking = (): void => {
    if (saveInterval.current) {
      clearInterval(saveInterval.current);
      saveInterval.current = null;
    }
    
    setIsTracking(false);
    console.log('🛑 Tracking en primer plano detenido');
  };

  // Iniciar tracking en segundo plano - DESHABILITADO
  const startBackgroundTracking = async (): Promise<boolean> => {
    console.log('⚠️ Background tracking deshabilitado (requiere build nativo)');
    setIsBackgroundTracking(false);
    return false;
  };

  // Detener tracking en segundo plano
  const stopBackgroundTracking = async (): Promise<void> => {
    setIsBackgroundTracking(false);
    return;
  };

  // Iniciar todo el sistema de tracking
  const startTracking = async (newRideId: string = rideId): Promise<void> => {
    console.log('🏹 [TRACKING] Iniciando sistema de tracking completo');
    
    if (!newRideId) {
      setError('No hay rideId para trackear');
      return;
    }

    try {
      // Iniciar tracking en primer plano
      await startForegroundTracking();

      // Iniciar tracking en segundo plano si está disponible
      if (useBackgroundTracking) {
        const bgStarted = await backgroundLocationService.startBackgroundLocationTracking(
          newRideId,
          'driver'
        );
        if (bgStarted) {
          setIsBackgroundTracking(true);
          console.log('✅ Background tracking iniciado');
        }
      }
    } catch (err) {
      console.error('❌ Error iniciando tracking:', err);
      setError(String(err));
    }
  };

  // Detener todo el sistema de tracking
  const stopTracking = async (): Promise<void> => {
    console.log('🛑 [TRACKING] Deteniendo sistema de tracking');
    
    try {
      // Detener tracking en primer plano
      stopForegroundTracking();

      // Detener tracking en segundo plano
      if (isBackgroundTracking) {
        await backgroundLocationService.stopBackgroundLocationTracking();
        setIsBackgroundTracking(false);
        console.log('✅ Background tracking detenido');
      }

      console.log(`📊 Total de puntos grabados: ${totalPoints}`);
    } catch (err) {
      console.error('❌ Error deteniendo tracking:', err);
    }
  };

  // Efecto para iniciar/detener tracking cuando el viaje está activo
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

  // Devolver objeto con estado y funciones
  return {
    // Convertir coordenadas a formato LocationObject para compatibilidad
    currentLocation: locationHook.coords ? {
      coords: {
        latitude: locationHook.coords.latitude,
        longitude: locationHook.coords.longitude,
        altitude: null,
        accuracy: locationHook.coords.accuracy || null,
        altitudeAccuracy: null,
        heading: locationHook.coords.heading || null,
        speed: locationHook.coords.speed || null
      },
      timestamp: locationHook.coords.timestamp || Date.now(),
    } : null,
    isTracking,
    isBackgroundTracking,
    error,
    totalPoints,
    startTracking,
    stopTracking,
  };
};
