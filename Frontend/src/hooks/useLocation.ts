import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import backgroundLocationService from '../services/backgroundLocationService';
import { useAuth } from '../context/AuthContext';
import { ensureActivityRecognitionPermission } from '../utils/activityPermission';
import { requestNotificationsPermissionIfNeeded } from '../utils/notificationPermission';

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

const LAST_KNOWN_LOCATION_KEY = 'last-known-location';

export interface UseLocationOptions {
  highAccuracy?: boolean; // Usar alta precisión
  backgroundTracking?: boolean; // Activar tracking en segundo plano
  interval?: number; // Intervalo de actualización en ms
  minDistance?: number; // Distancia mínima entre actualizaciones en metros
  // Coordenadas iniciales sugeridas (por ejemplo, desde PreflightRegionInfo)
  // Se usan solo como seed visual mientras se resuelve la ubicación real.
  initialCoords?: Coordinates;
}

export const DRIVER_LOCATION_OPTIONS: UseLocationOptions = {
  highAccuracy: true,
  interval: 2500,
  minDistance: 5,
};

export function useLocation(options: UseLocationOptions = {}) {
  const { 
    highAccuracy = false,
    backgroundTracking = false, 
    interval = 5000, 
    minDistance = 10,
    initialCoords,
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
  const coordsRef = useRef<Coordinates | null>(null);
  const updateCoords = (newCoords: Coordinates | null, options?: { isMock?: boolean }) => {
    coordsRef.current = newCoords;
    setCoords(newCoords);

    if (options && options.isMock !== undefined) {
      setIsUsingMockLocation(options.isMock);
    }
  };

  const persistLastKnownLocation = async (location: Coordinates) => {
    try {
      await AsyncStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(location));
    } catch (storageError) {
      console.warn('⚠️ No se pudo guardar la última ubicación conocida:', storageError);
    }
  };

  const loadLastKnownLocation = async () => {
    try {
      const stored = await AsyncStorage.getItem(LAST_KNOWN_LOCATION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Coordinates;
        if (
          parsed &&
          typeof parsed.latitude === 'number' &&
          typeof parsed.longitude === 'number'
        ) {
          updateCoords(parsed, { isMock: false });
          setLoading(false);
        }
      }
    } catch (storageError) {
      console.warn('⚠️ No se pudo cargar la última ubicación conocida:', storageError);
    }
  };

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
      setIsUsingMockLocation(false);

      // Solicitar permisos
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('📍 Permiso de ubicación (foreground):', status);

      if (status !== 'granted') {
        console.warn('⚠️ Permiso de ubicación denegado. Usando ubicación mock: Managua');
        setError('Permiso de ubicación denegado');
        updateCoords(DEFAULT_LOCATION, { isMock: true });
        return;
      }

      if (user?.role === 'driver' || user?.role === 'designated_driver') {
        await ensureActivityRecognitionPermission();
      }

      await requestNotificationsPermissionIfNeeded();

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      console.log('📍 Servicios de ubicación activos:', servicesEnabled);
      if (!servicesEnabled) {
        console.warn('⚠️ Servicios de ubicación desactivados. Usando ubicación mock: Managua');
        setError('Servicios de ubicación desactivados');
        updateCoords(DEFAULT_LOCATION, { isMock: true });
        return;
      }

      // Intentar obtener última ubicación conocida primero
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && lastKnown.coords) {
        const candidate: Coordinates = {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          heading: lastKnown.coords.heading,
          speed: lastKnown.coords.speed,
          accuracy: lastKnown.coords.accuracy,
          timestamp: lastKnown.timestamp,
        };

        console.log('📍 Última ubicación conocida encontrada:', candidate);
        updateCoords(candidate, { isMock: false });
      }

      // Obtener ubicación actual con timeout controlado por Expo Location (evita fallback prematuro)
      const currentPositionOptions: Location.LocationOptions & {
        maximumAge?: number;
        timeout?: number;
        mayShowUserSettingsDialog?: boolean;
      } = {
        accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
        maximumAge: 10000,
        timeout: highAccuracy ? 20000 : 12000,
        mayShowUserSettingsDialog: true,
      };

      const location = await Location.getCurrentPositionAsync(currentPositionOptions);

      console.log('✅ Ubicación obtenida:', location.coords.latitude, location.coords.longitude);
      const nextCoords: Coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };

      updateCoords(nextCoords, { isMock: false });
      await persistLastKnownLocation(nextCoords);
    } catch (err: any) {
      const message = err?.message || String(err);
      const hadPreviousCoords = !!coordsRef.current;

      if (message?.toLowerCase?.().includes('timeout')) {
        console.warn('⌛ Tiempo de espera agotado al obtener GPS. Reusando última ubicación conocida.');
      } else {
        console.warn('⚠️ Error al obtener ubicación GPS:', message);
      }

      // Si tenemos una ubicación previa válida, la mantenemos para evitar saltar a la mock
      if (hadPreviousCoords && coordsRef.current) {
        setError('No se pudo actualizar la ubicación, se mantiene la última válida');
        updateCoords(coordsRef.current, { isMock: false });
      } else {
        console.warn('⚠️ Sin ubicación previa, usando ubicación mock: Managua');
        setError(null);
        updateCoords(DEFAULT_LOCATION, { isMock: true });
      }
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

      if (user?.role === 'driver' || user?.role === 'designated_driver') {
        await ensureActivityRecognitionPermission();
      }

      // Iniciar watching de ubicación
      locationSubscription.current = await Location.watchPositionAsync(
        locationOptions,
        (location) => {
          console.log('📱 Nueva ubicación (foreground):', {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
          
          const nextCoords: Coordinates = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            heading: location.coords.heading,
            speed: location.coords.speed,
            accuracy: location.coords.accuracy,
            timestamp: location.timestamp,
          };

          updateCoords(nextCoords, { isMock: false });
          setError(null);
          persistLastKnownLocation(nextCoords).catch(() => undefined);
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
    (async () => {
      // 1) Seed opcional desde initialCoords (por ejemplo, PreflightRegionInfo)
      if (initialCoords && !coordsRef.current) {
        const seeded: Coordinates = {
          latitude: initialCoords.latitude,
          longitude: initialCoords.longitude,
          heading: null,
          speed: null,
          accuracy: null,
          timestamp: Date.now(),
        };

        updateCoords(seeded, { isMock: false });
        setLoading(false);
      }

      // 2) Cargar última ubicación conocida desde AsyncStorage
      await loadLastKnownLocation();

      // 3) Forzar obtención actual vía GPS
      await getLocation();
    })();

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
