/**
 * BackgroundLocationService
 * Servicio para tracking continuo de ubicación en segundo plano
 * Utiliza Expo TaskManager para garantizar que las actualizaciones de ubicación
 * continúen incluso cuando la aplicación está en segundo plano.
 */

import * as TaskManager from 'expo-task-manager';
import * as ExpoLocation from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebaseTrackingService from './firebaseTrackingService';
import { getFirebaseDatabase } from '../config/firebase';
import { ref as dbRef, update } from 'firebase/database';

// Constantes para las tareas en segundo plano
const BACKGROUND_LOCATION_TASK = 'background-location-task';
const LOCATION_TRACKING_STORAGE_KEY = 'location-tracking-state';

// Función para obtener configuración de ubicación en segundo plano
// Usamos valores numéricos directos para evitar problemas de inicialización
const getBackgroundLocationOptions = (): any => {
  return {
    accuracy: 4, // Location.Accuracy.Balanced = 4
    timeInterval: 15000, // 15 segundos (más ahorro de batería)
    distanceInterval: 25, // 25 metros
    deferredUpdatesInterval: 30000, // 30 segundos
    deferredUpdatesDistance: 50, // 50 metros
    showsBackgroundLocationIndicator: true, // Indicador en iOS
    foregroundService: {
      notificationTitle: 'Tracking de ubicación activo',
      notificationBody: 'Tu ubicación está siendo compartida',
      notificationColor: '#FF9800',
    },
  };
};

// Definir el estado de tracking
interface TrackingState {
  isTracking: boolean;
  userId: string | null;
  rideId: string | null;
  role: 'driver' | 'client' | null;
  startTime: number | null;
}

// Estado inicial
const initialTrackingState: TrackingState = {
  isTracking: false,
  userId: null,
  rideId: null,
  role: null,
  startTime: null,
};

// Estado actual en memoria
let currentTrackingState: TrackingState = { ...initialTrackingState };

// Variable para controlar si la tarea ya fue definida
let isTaskDefined = false;

// Función para definir la tarea en segundo plano
const defineBackgroundTask = () => {
  if (isTaskDefined) return;
  
  try {
    // @ts-ignore - La tipificación de Expo para TaskManagerTaskBody no es exacta
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      if (error) {
        console.error('Error en tarea de ubicación en segundo plano:', error);
        return;
      }
      
      if (!data) {
        console.warn('No hay datos de ubicación');
        return;
      }

      // Obtener ubicación y estado de tracking
      const locationData = data as { locations: any[] };
      const { locations } = locationData;
      const location = locations[0];

  // Verificar que aún deberíamos estar trackeando
  const trackingState = await loadTrackingState();
  if (!trackingState.isTracking || !trackingState.userId) {
    console.log('🛑 Tracking desactivado, deteniendo tarea en segundo plano');
    await stopBackgroundLocationTracking();
    return;
  }

  console.log('📍 Ubicación recibida en segundo plano:', {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
    timestamp: new Date(location.timestamp).toISOString(),
  });

  // Actualizar ubicación según el rol
  try {
    if (trackingState.role === 'driver' && trackingState.userId) {
      // Actualizar ubicación del conductor
      await firebaseTrackingService.updateDriverLocation(trackingState.userId, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || 0,
      });

      // Si hay un viaje activo, actualizar también el tracking del viaje
      if (trackingState.rideId) {
        await firebaseTrackingService.updateRideTracking(trackingState.rideId, {
          driverLocation: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speed: location.coords.speed || 0,
            heading: location.coords.heading || 0,
            timestamp: location.timestamp,
          },
        });
      }
    } else if (trackingState.role === 'client' && trackingState.rideId && trackingState.userId) {
      // Para clientes, solo actualizamos su ubicación si hay un viaje activo
      // Primero guardamos la ubicación del cliente en la rama clientLocations
      await firebaseTrackingService.updateClientLocation(trackingState.userId, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
      });
      
      // Luego actualizamos la referencia en el viaje activo (usando un update directo)
      const database = await getFirebaseDatabase();
      const rideRef = dbRef(database, `activeRides/${trackingState.rideId}`);
      await update(rideRef, {
        clientLocationRef: `/clientLocations/${trackingState.userId}`,
        lastClientUpdate: Date.now(),
      });
    }
    
      return;
    } catch (error) {
      console.error('Error actualizando ubicación en segundo plano:', error);
      return;
    }
    });
    
    isTaskDefined = true;
    console.log('✅ Tarea de background definida correctamente');
  } catch (error) {
    console.error('❌ Error definiendo tarea de background:', error);
  }
};

/**
 * Cargar estado de tracking desde AsyncStorage
 */
async function loadTrackingState(): Promise<TrackingState> {
  try {
    const storedState = await AsyncStorage.getItem(LOCATION_TRACKING_STORAGE_KEY);
    if (storedState) {
      currentTrackingState = JSON.parse(storedState);
      return currentTrackingState;
    }
  } catch (error) {
    console.error('Error cargando estado de tracking:', error);
  }
  
  return currentTrackingState;
}

/**
 * Guardar estado de tracking en AsyncStorage
 */
async function saveTrackingState(state: Partial<TrackingState>): Promise<void> {
  try {
    const newState = { ...currentTrackingState, ...state };
    currentTrackingState = newState;
    await AsyncStorage.setItem(LOCATION_TRACKING_STORAGE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.error('Error guardando estado de tracking:', error);
  }
}

/**
 * Verificar permisos de ubicación en segundo plano
 * Retorna true si tenemos permisos, false si no
 */
export async function checkBackgroundLocationPermission(): Promise<boolean> {
  const { status: foregroundStatus } = await ExpoLocation.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return false;
  }

  const { status: backgroundStatus } = await ExpoLocation.requestBackgroundPermissionsAsync();
  return backgroundStatus === 'granted';
}

/**
 * Iniciar tracking de ubicación en segundo plano
 */
export async function startBackgroundLocationTracking(
  userId: string,
  role: 'driver' | 'client',
  rideId?: string
): Promise<boolean> {
  try {
    // Definir la tarea si aún no está definida
    defineBackgroundTask();
    
    // Verificar permisos
    const hasPermission = await checkBackgroundLocationPermission();
    if (!hasPermission) {
      // Mostrar alerta al usuario
      // Notificación deshabilitada temporalmente
      console.warn('⚠️ Se requiere permiso de ubicación en segundo plano');
      /* await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Permisos necesarios',
          body: 'Se requiere permiso de ubicación en segundo plano para el tracking',
          data: { screen: 'Settings' },
        },
        trigger: null,
      }); */
      return false;
    }

    // Actualizar estado de tracking
    await saveTrackingState({
      isTracking: true,
      userId,
      role,
      rideId: rideId || null,
      startTime: Date.now(),
    });

    // Iniciar tracking en segundo plano
    await ExpoLocation.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, getBackgroundLocationOptions());
    
    console.log('✅ Tracking en segundo plano iniciado:', {
      userId,
      role,
      rideId: rideId || 'N/A',
    });
    
    return true;
  } catch (error) {
    console.error('Error iniciando tracking en segundo plano:', error);
    return false;
  }
}

/**
 * Detener tracking de ubicación en segundo plano
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    // Verificar si la tarea está registrada
    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    
    if (isTaskRegistered) {
      await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    
    // Resetear estado de tracking
    await saveTrackingState(initialTrackingState);
    
    console.log('✅ Tracking en segundo plano detenido');
  } catch (error) {
    console.error('Error deteniendo tracking en segundo plano:', error);
  }
}

/**
 * Actualizar ID de viaje para tracking existente
 */
export async function updateTrackingRideId(rideId: string | null): Promise<void> {
  const trackingState = await loadTrackingState();
  
  if (trackingState.isTracking) {
    await saveTrackingState({ rideId });
    console.log(`✅ ID de viaje actualizado para tracking: ${rideId || 'Ninguno'}`);
  }
}

/**
 * Obtener estado actual de tracking
 */
export async function getTrackingState(): Promise<TrackingState> {
  return loadTrackingState();
}

/**
 * Verificar si el tracking está activo
 */
export async function isTrackingActive(): Promise<boolean> {
  const state = await loadTrackingState();
  const isTaskRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  return state.isTracking && isTaskRunning;
}

export default {
  checkBackgroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  updateTrackingRideId,
  getTrackingState,
  isTrackingActive,
};
