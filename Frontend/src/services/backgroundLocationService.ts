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
import { AppState, AppStateStatus, Platform } from 'react-native';

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
    pausesUpdatesAutomatically: false,
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

type PendingStartParams = {
  userId: string;
  role: 'driver' | 'client';
  rideId: string | null;
};

let pendingStart: PendingStartParams | null = null;
let appStateListener: { remove: () => void } | null = null;

const clearPendingStart = () => {
  pendingStart = null;
  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }
};

const scheduleStartWhenForeground = (params: PendingStartParams) => {
  pendingStart = params;

  if (appStateListener) {
    return;
  }

  appStateListener = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
    if (nextState === 'active' && pendingStart) {
      const startParams = pendingStart;
      clearPendingStart();
      await startBackgroundLocationTracking(startParams.userId, startParams.role, startParams.rideId || undefined);
    }
  });
};

const performBackgroundStart = async ({ userId, role, rideId }: PendingStartParams): Promise<boolean> => {
  try {
    await saveTrackingState({
      isTracking: true,
      userId,
      role,
      rideId,
      startTime: Date.now(),
    });

    await ExpoLocation.startLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
      getBackgroundLocationOptions()
    );

    console.log('Tracking en segundo plano iniciado:', {
      userId,
      role,
      rideId: rideId || 'N/A',
    });

    return true;
  } catch (error) {
    console.error('Error iniciando tracking en segundo plano:', error);
    return false;
  }
};

const performBackgroundStop = async (): Promise<void> => {
  clearPendingStart();

  const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);

  if (isTaskRegistered) {
    await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  await saveTrackingState(initialTrackingState);

  console.log('Tracking en segundo plano detenido');
};

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
        console.log('Tracking desactivado, deteniendo tarea en segundo plano');
        await stopBackgroundLocationTracking();
        return;
      }

      console.log('Ubicación recibida en segundo plano:', {
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
          
          // NUEVO: Usar Cloud Function en lugar de actualizar directamente
          // Esto evita problemas de permisos en Firebase Realtime DB
          try {
            const { getFirebaseFunctions } = await import('../config/firebase');
            const { httpsCallable } = await import('firebase/functions');
            
            const functions = await getFirebaseFunctions();
            const updateTrackingFn = httpsCallable(functions, 'updateRideStatus');
            
            await updateTrackingFn({
              rideId: trackingState.rideId,
              status: 'in_progress',
              clientLocation: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy || 0,
              },
            });
          } catch (error) {
            console.warn('Error actualizando tracking vía Cloud Function:', error);
            // No lanzar error - el tracking de ubicación es lo importante
          }
        }
        
        return;
      } catch (error) {
        console.error('Error actualizando ubicación en segundo plano:', error);
        return;
      }
    });
    
    isTaskDefined = true;
    console.log('Tarea de background definida correctamente');
  } catch (error) {
    console.error('Error definiendo tarea de background:', error);
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
    const appState = AppState.currentState;

    if (Platform.OS === 'android' && appState !== 'active') {
      console.log('App en segundo plano, programando inicio de tracking cuando vuelva a primer plano');
      scheduleStartWhenForeground({ userId, role, rideId: rideId || null });

      await saveTrackingState({
        isTracking: false,
        userId,
        role,
        rideId: rideId || null,
        startTime: Date.now(),
      });

      return true; // marcado como pendiente
    }

    // Definir la tarea si aún no está definida
    defineBackgroundTask();

    // Verificar permisos
    const hasPermission = await checkBackgroundLocationPermission();
    if (!hasPermission) {
      console.log('No hay permisos para tracking en segundo plano');
      return false;
    }

    return await performBackgroundStart({ userId, role, rideId: rideId || null });
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
    await performBackgroundStop();
  } catch (error) {
    console.error('Error deteniendo tracking en segundo plano:', error);
  }
}

/**
 * Verificar y restaurar tracking en segundo plano si se detuvo inesperadamente
 */
export async function ensureBackgroundTrackingIntegrity(): Promise<boolean> {
  try {
    const trackingState = await loadTrackingState();

    if (!trackingState.isTracking || !trackingState.userId || !trackingState.role) {
      return false;
    }

    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isTaskRunning) {
      return true;
    }

    defineBackgroundTask();

    const hasPermission = await checkBackgroundLocationPermission();
    if (!hasPermission) {
      console.warn('⚠️ No se pudo restaurar tracking en segundo plano: faltan permisos');
      return false;
    }

    const restarted = await performBackgroundStart({
      userId: trackingState.userId,
      role: trackingState.role,
      rideId: trackingState.rideId,
    });

    if (restarted) {
      console.log('✅ Tracking en segundo plano restaurado automáticamente');
    }

    return restarted;
  } catch (error) {
    console.error('❌ Error verificando integridad de tracking en segundo plano:', error);
    return false;
  }
}

/**
 * Actualizar ID de viaje para tracking existente
 */
export async function updateTrackingRideId(rideId: string | null): Promise<void> {
  const trackingState = await loadTrackingState();
  
  if (trackingState.isTracking) {
    await saveTrackingState({ rideId });
    console.log(`ID de viaje actualizado para tracking: ${rideId || 'Ninguno'}`);
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
  ensureBackgroundTrackingIntegrity,
};
