import { useEffect, useState, useRef } from 'react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus, Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const LAST_KNOWN_LOCATION_KEY = 'last-known-location';

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
  const coordsRef = useRef<Coordinates | null>(null);
  const notificationPermissionRequested = useRef(false);

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
  const requestNotificationPermissionSoft = async () => {
    if (notificationPermissionRequested.current) {
      return;
    }

    notificationPermissionRequested.current = true;

    try {
      if (Platform.OS === 'android') {
        const androidVersion = typeof Platform.Version === 'number'
          ? Platform.Version
          : parseInt(Platform.Version as unknown as string, 10);

        if (Number.isNaN(androidVersion) || androidVersion < 33) {
          console.log('ℹ️ Permiso de notificaciones no requerido en esta versión de Android');
          return;
        }

        if (!PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
          console.log('ℹ️ POST_NOTIFICATIONS no está disponible en esta build.');
          return;
        }

        const alreadyGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );

        if (alreadyGranted) {
          return;
        }

        const notificationStatus = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );

        if (notificationStatus !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('⚠️ Permiso de notificaciones denegado por el usuario');
        }

        return;
      }

      const settings = await Notifications.getPermissionsAsync();
      const isGranted =
        settings.granted ||
        (settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);

      if (isGranted) {
        return;
      }

      const requestResult = await Notifications.requestPermissionsAsync();
      const grantedAfterRequest =
        requestResult.granted ||
        (requestResult.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);

      if (!grantedAfterRequest) {
        console.log('⚠️ Permiso de notificaciones denegado');
      }
    } catch (notificationError) {
      console.warn('⚠️ No se pudo solicitar permisos de notificaciones:', notificationError);
    }
  };

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
      console.log('📍 Permiso de ubicación (foreground):', status);
      
      if (status !== 'granted') {
        console.warn('⚠️ Permiso de ubicación denegado. Usando ubicación mock: Managua');
        setError('Permiso de ubicación denegado');
        updateCoords(DEFAULT_LOCATION, { isMock: true });
        return;
      }

      await requestNotificationPermissionSoft();

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

      // Obtener ubicación actual con timeout reducido
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: highAccuracy ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000) // Fallback timeout
      );

      const location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;

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
      console.warn('⚠️ Error al obtener ubicación GPS. Usando ubicación mock: Managua');
      console.error('Error details:', err?.message || err);
      // Usar ubicación por defecto sin mostrar error en consola
      setError(null);
      updateCoords(DEFAULT_LOCATION, { isMock: true });
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
    loadLastKnownLocation().finally(() => {
      getLocation();
    });

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
