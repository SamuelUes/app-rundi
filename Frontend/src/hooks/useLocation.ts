import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, Platform } from 'react-native';
import backgroundLocationService from '../services/backgroundLocationService';
import { useAuth } from '../context/AuthContext';

export interface Coordinates {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestamp?: number;
}

// Ubicación por defecto: Managua, Nicaragua
const DEFAULT_LOCATION: Coordinates = {
  latitude: 12.1364,
  longitude: -86.2514,
};

interface UseLocationOptions {
  highAccuracy?: boolean; // Usar alta precisión
  backgroundTracking?: boolean; // Activar tracking en segundo plano
  interval?: number; // Intervalo de actualización en ms
  minDistance?: number; // Distancia mínima entre actualizaciones en metros
}

export function useLocation(options: UseLocationOptions = {}) {
  const { 
    highAccuracy = false,
    backgroundTracking = false, 
    interval = 5000, 
    minDistance = 10 
  } = options;
  
  const { user } = useAuth();
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUsingMockLocation, setIsUsingMockLocation] = useState(false);
  const [isBackgroundTrackingActive, setIsBackgroundTrackingActive] = useState(false);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const appState = useRef(AppState.currentState);
  const isRefreshingLocation = useRef(false);
  const lastSuccessfulRefresh = useRef(0);

  // Configurar opciones de ubicación según el nivel de precisión requerido
  const locationOptions = {
    accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
    timeInterval: interval,
    distanceInterval: minDistance,
  };

  // Obtener ubicación actual (una sola vez)
  const getLocation = async () => {
    if (isRefreshingLocation.current) {
      return;
    }

    try {
      isRefreshingLocation.current = true;
      setLoading(true);
      setError(null);
      setIsUsingMockLocation(false);

      // Solicitar permisos
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        console.warn('⚠️ Permiso de ubicación denegado. Usando ubicación mock: Managua');
        setError('Permiso de ubicación denegado');
        setCoords(DEFAULT_LOCATION);
        setIsUsingMockLocation(true);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        console.warn('⚠️ Servicios de ubicación desactivados. Usando ubicación mock: Managua');
        setError('Servicios de ubicación desactivados');
        setCoords(DEFAULT_LOCATION);
        setIsUsingMockLocation(true);
        return;
      }

      // Obtener ubicación actual con timeout reducido
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000) // Fallback timeout
      );

      const location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;

      console.log('✅ Ubicación obtenida:', location.coords.latitude, location.coords.longitude);
      setCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      });
    } catch (err: any) {
      console.warn('⚠️ Error al obtener ubicación GPS. Usando ubicación mock: Managua');
      console.error('Error details:', err.message);
      // Usar ubicación por defecto sin mostrar error en consola
      setError(null);
      setCoords(DEFAULT_LOCATION);
      setIsUsingMockLocation(true);
    } finally {
      setLoading(false);
      isRefreshingLocation.current = false;
      lastSuccessfulRefresh.current = Date.now();
    }
  };

  // Iniciar seguimiento continuo de ubicación (foreground)
  const startLocationTracking = async () => {
    if (locationSubscription.current) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Permiso de ubicación denegado');
        return;
      }

      // Iniciar watching de ubicación
      locationSubscription.current = await Location.watchPositionAsync(
        locationOptions,
        (location) => {
          console.log('📱 Nueva ubicación (foreground):', {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
          
          setCoords({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            accuracy: location.coords.accuracy,
            timestamp: location.timestamp,
          });
          
          setIsUsingMockLocation(false);
          setError(null);
        }
      );

      console.log('✅ Tracking de ubicación iniciado (foreground)');
    } catch (err: any) {
      console.error('❌ Error iniciando tracking:', err);
      setError(`Error iniciando tracking: ${err.message}`);
    }
  };

  // Detener seguimiento de ubicación
  const stopLocationTracking = async () => {
    if (locationSubscription.current) {
      await locationSubscription.current.remove();
      locationSubscription.current = null;
      console.log('🛑 Tracking de ubicación detenido');
    }
  };

  // Iniciar tracking en segundo plano
  const startBackgroundTracking = async (rideId?: string) => {
    if (!user) return false;

    try {
      // Verificar si ya está activo
      if (isBackgroundTrackingActive) {
        // Solo actualizar el rideId si es diferente
        if (rideId) {
          await backgroundLocationService.updateTrackingRideId(rideId);
        }
        return true;
      }

      const started = await backgroundLocationService.startBackgroundLocationTracking(
        user.id,
        user.role === 'driver' || user.role === 'designated_driver' ? 'driver' : 'client',
        rideId
      );

      setIsBackgroundTrackingActive(started);
      return started;
    } catch (error) {
      console.error('Error iniciando tracking en segundo plano:', error);
      return false;
    }
  };

  // Detener tracking en segundo plano
  const stopBackgroundTracking = async () => {
    await backgroundLocationService.stopBackgroundLocationTracking();
    setIsBackgroundTrackingActive(false);
  };

  // Manejar cambios en el estado de la app (foreground/background)
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active' &&
      !backgroundTracking
    ) {
      // La app vuelve a primer plano: actualizar ubicación
      console.log('📱 App volvió a primer plano, actualizando ubicación...');
      const now = Date.now();
      if (!isRefreshingLocation.current && now - lastSuccessfulRefresh.current > 5000) {
        refreshLocation();
      }
    }

    appState.current = nextAppState;
  };

  // Inicialización
  useEffect(() => {
    getLocation();

    if (backgroundTracking) {
      // Verificar si el tracking en segundo plano ya está activo
      backgroundLocationService.isTrackingActive().then(setIsBackgroundTrackingActive);
    }

    // Configurar listener para cambios de estado de la app
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      stopLocationTracking(); // Siempre detener tracking en foreground al desmontar
      
      // No detenemos el tracking en segundo plano al desmontar porque queremos
      // que continúe incluso cuando la app está en background
    };
  }, []);

  // Iniciar tracking continuo si se solicita
  useEffect(() => {
    if (!backgroundTracking) {
      startLocationTracking();
    }

    return () => {
      if (!backgroundTracking) {
        stopLocationTracking();
      }
    };
  }, [backgroundTracking, interval, minDistance, highAccuracy]);

  // Función para actualizar manualmente la ubicación
  const refreshLocation = async () => {
    await getLocation();
  };

  return {
    coords,
    error,
    loading,
    refreshLocation,
    isUsingMockLocation,
    isBackgroundTrackingActive,
    startBackgroundTracking,
    stopBackgroundTracking,
  };
}
