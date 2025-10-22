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
  // ⚠️ TRACKING DESHABILITADO PARA DESARROLLO
  // =====================================================
  
  // Guardar ubicación actual en Firebase - DESHABILITADO
  const saveLocation = async (): Promise<void> => {
    console.log('📍 [TRACKING] saveLocation deshabilitado para desarrollo');
    return;
  };

  // Iniciar tracking en primer plano - DESHABILITADO
  const startForegroundTracking = async (): Promise<void> => {
    console.log('🏹 [TRACKING] Tracking en primer plano deshabilitado para desarrollo');
    setIsTracking(false);
    setError(null);
    return;
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

  // Iniciar todo el sistema de tracking - DESHABILITADO
  const startTracking = async (newRideId: string = rideId): Promise<void> => {
    console.log('🏹 [TRACKING] startTracking deshabilitado para desarrollo');
    return;
  };

  // Detener todo el sistema de tracking - DESHABILITADO
  const stopTracking = async (): Promise<void> => {
    console.log('🛑 [TRACKING] stopTracking deshabilitado para desarrollo');
    return;
  };

  // Efecto para simular que respondemos a isActive
  useEffect(() => {
    if (isActive && rideId) {
      console.log('⚠️ Tracking deshabilitado para desarrollo (no se iniciará)');
    } else {
      console.log('ℹ️ Viaje inactivo (tracking deshabilitado)');
    }
    
    return () => {
      // Nada que limpiar
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
    isTracking: false, // Siempre falso en desarrollo
    isBackgroundTracking: false, // Siempre falso en desarrollo
    error: null,
    totalPoints: 0, // Sin puntos en desarrollo
    startTracking,
    stopTracking,
  };
};
