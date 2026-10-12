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
import sessionService from './sessionService';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { handleLocationForProximity, isRegistrationUploadsInProgress } from './proximityService';
import { ensureActivityRecognitionPermission } from '../utils/activityPermission';
import foregroundService from '../native/foregroundService';
import workManager from '../native/workManager';
import batteryOptimization from '../native/batteryOptimization';
import i18n from '../i18n';

// Constantes para las tareas en segundo plano
const BACKGROUND_LOCATION_TASK = 'background-location-task';
const LOCATION_TRACKING_STORAGE_KEY = 'location-tracking-state';
const SESSION_HEARTBEAT_STORAGE_PREFIX = 'location-session-heartbeat:';
const WORK_MANAGER_INTERVAL_MINUTES = 30;

// Función para obtener configuración de ubicación en segundo plano
// Usamos valores numéricos directos para evitar problemas de inicialización
const getBackgroundLocationOptions = (): any => {
  return {
    accuracy: 4, // Location.Accuracy.Balanced = 4
    timeInterval: 15000, // 15 segundos (más ahorro de batería)
    // Android-only: minDisplacement. Debe ser 0 — con >0 el provider solo
    // entrega updates al moverse y un conductor estacionado en background
    // nunca recibiría ticks para detectar viajes cercanos.
    distanceInterval: 0,
    deferredUpdatesInterval: 30000, // 30 segundos
    deferredUpdatesDistance: 50, // 50 metros
    showsBackgroundLocationIndicator: true, // Indicador en iOS
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: i18n.t('common.services.backgroundLocationService.foregroundService.title'),
      notificationBody: i18n.t('common.services.backgroundLocationService.foregroundService.body'),
      notificationColor: '#b6915aff',
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
  optionsHash: string | null;
}

// Estado inicial
const initialTrackingState: TrackingState = {
  isTracking: false,
  userId: null,
  rideId: null,
  role: null,
  startTime: null,
  optionsHash: null,
};

// Hash de las opciones de ubicación para detectar cuando cambian y
// re-registrar el task (el registro nativo persiste entre reloads/sesiones)
const getTrackingOptionsHash = (): string => {
  try {
    return JSON.stringify(getBackgroundLocationOptions());
  } catch {
    return '';
  }
};

// Estado actual en memoria
let currentTrackingState: TrackingState = { ...initialTrackingState };
let lastSessionRefreshAt = 0;

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
      optionsHash: getTrackingOptionsHash(),
    });

    await ExpoLocation.startLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
      getBackgroundLocationOptions()
    );

    if (Platform.OS === 'android') {
      try {
        const title =
          role === 'driver'
            ? i18n.t('services.backgroundLocationService.driverStatus.title')
            : i18n.t('services.backgroundLocationService.clientStatus.title');
        const body =
          role === 'driver'
            ? i18n.t('services.backgroundLocationService.driverStatus.body')
            : i18n.t('services.backgroundLocationService.clientStatus.body');
        await foregroundService.start({ title, body });
        await workManager.schedule(WORK_MANAGER_INTERVAL_MINUTES);
      } catch (serviceError) {
        console.warn('⚠️ No se pudo iniciar el servicio en primer plano:', serviceError);
      }
    }

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

  if (Platform.OS === 'android') {
    try {
      await foregroundService.stop();
      await workManager.cancel();
    } catch (error) {
      console.warn('⚠️ No se pudo detener el soporte de primer plano:', error);
    }
  }

  console.log('Tracking en segundo plano detenido');
};

// Función para definir la tarea en segundo plano
const defineBackgroundTask = () => {
  if (isTaskDefined) return;
  
  try {
    // @ts-ignore - La tipificación de Expo para TaskManagerTaskBody no es exacta
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      console.log('🎯 [background-task] Tarea ejecutándose');
      
      if (error) {
        // kCLErrorDomain Code=0 = ubicación temporalmente no disponible (iOS la
        // reintenta solo). En el simulador aparece si Features → Location = None.
        console.warn('⚠️ [background-task] Error temporal de ubicación:', error);
        return;
      }
      
      if (!data) {
        console.warn('⚠️ [background-task] No hay datos de ubicación');
        return;
      }

      // Obtener ubicación y estado de tracking
      const locationData = data as { locations: any[] };
      const { locations } = locationData;
      const location = locations[0];

      console.log('📍 [background-task] Ubicación recibida:', {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });

      // Verificar que aún deberíamos estar trackeando
      const trackingState = await loadTrackingState();
      console.log('🔍 [background-task] TrackingState:', {
        isTracking: trackingState.isTracking,
        hasUserId: !!trackingState.userId,
        hasRideId: !!trackingState.rideId,
        role: trackingState.role,
      });
      
      if (!trackingState.isTracking || !trackingState.userId) {
        console.log('⚠️ [background-task] Tracking desactivado, deteniendo tarea');
        await stopBackgroundLocationTracking();
        return;
      }

      // Actualizar ubicación según el rol
      try {
        const heartbeatKey = `${SESSION_HEARTBEAT_STORAGE_PREFIX}${trackingState.userId}`;
        const storedHeartbeatAt = Number(await AsyncStorage.getItem(heartbeatKey)) || 0;
        const lastHeartbeatAt = Math.max(lastSessionRefreshAt, storedHeartbeatAt);
        if (Date.now() - lastHeartbeatAt >= 45_000) {
          lastSessionRefreshAt = Date.now();
          await AsyncStorage.setItem(heartbeatKey, String(lastSessionRefreshAt)).catch(() => undefined);
          try {
            await sessionService.startSession({ policy: 'deny' });
          } catch (sessionError: any) {
            if (sessionService.isSessionActiveElsewhereError(sessionError)) {
              await stopBackgroundLocationTracking();
              return;
            }
            throw sessionError;
          }
        }

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

          // 🚀 Viaje por aproximación: si NO hay viaje activo, revisar solicitudes cercanas
          if (!trackingState.rideId) {
            console.log('🚀 [background-task] No hay viaje activo - ejecutando proximity check');
            try {
              // Evitar proximity mientras suben fotos de registro
              const uploadsInProgress = await isRegistrationUploadsInProgress();
              if (uploadsInProgress) {
                console.log('⏭️ [background-task] Proximity saltado: uploads de registro en progreso');
              } else {
                await handleLocationForProximity(
                  trackingState.userId,
                  location.coords.latitude,
                  location.coords.longitude,
                );
              }
            } catch (error) {
              console.warn('⚠️ [background-task] Error en proximity check:', error);
            }
          }
        } else if (trackingState.role === 'client' && trackingState.rideId && trackingState.userId) {
          try {
            await firebaseTrackingService.updateRideTracking(trackingState.rideId, {
              clientLocation: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy || 0,
                timestamp: location.timestamp,
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

// Definir la tarea inmediatamente al cargar el módulo para evitar advertencias de TaskManager
if (Platform.OS !== 'web') {
  defineBackgroundTask();
}

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
  const foreground = await ExpoLocation.getForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return false;
  }

  const background = await ExpoLocation.getBackgroundPermissionsAsync();
  return background.status === 'granted';
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
    // Gate: no iniciar tracking mientras se suben fotos de registro
    const uploadsGate = await isRegistrationUploadsInProgress();
    if (uploadsGate) {
      console.log('⏸️ [backgroundTracking] Gate activo: registration uploads en progreso. Se difiere start.');
      scheduleStartWhenForeground({ userId, role, rideId: rideId || null });
      await saveTrackingState({
        isTracking: false,
        userId,
        role,
        rideId: rideId || null,
        startTime: Date.now(),
      });
      return false;
    }

    const servicesEnabled = await ExpoLocation.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      console.warn('⚠️ Servicios de ubicación deshabilitados. No se iniciará tracking.');
      await saveTrackingState({
        isTracking: false,
        userId,
        role,
        rideId: rideId || null,
        startTime: Date.now(),
      });
      return false;
    }

    if (role === 'driver') {
      const activityGranted = await ensureActivityRecognitionPermission();
      if (!activityGranted) {
        console.warn('⚠️ No se otorgó permiso de actividad física. El tracking optimizado podría no estar disponible.');
      }
    }

    if (Platform.OS === 'android') {
      try {
        const ignoring = await batteryOptimization.isIgnoring();
        if (!ignoring) {
          console.log('⚠️ Solicitando exclusión de optimización de batería para tracking.');
          await batteryOptimization.requestIgnore();
        }
      } catch (batteryError) {
        console.warn('⚠️ Error verificando optimizaciones de batería:', batteryError);
      }
    }

    let appState = AppState.currentState;

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

    // Re-chequeo de estado antes de arrancar la tarea (puede haber cambiado)
    appState = AppState.currentState;
    if (Platform.OS === 'android' && appState !== 'active') {
      console.log('App pasó a background antes de iniciar tracking; se difiere hasta foreground');
      scheduleStartWhenForeground({ userId, role, rideId: rideId || null });
      await saveTrackingState({
        isTracking: false,
        userId,
        role,
        rideId: rideId || null,
        startTime: Date.now(),
      });
      return true;
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
    const uploadsGate = await isRegistrationUploadsInProgress();
    if (uploadsGate) {
      console.log('⏸️ [trackingIntegrity] Gate activo: uploads de registro en progreso. Se omite restauración.');
      return false;
    }

    const trackingState = await loadTrackingState();

    if (!trackingState.isTracking || !trackingState.userId || !trackingState.role) {
      return false;
    }

    if (trackingState.role === 'driver') {
      await ensureActivityRecognitionPermission();
    }

    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isTaskRunning) {
      return true;
    }

    const appState = AppState.currentState;
    if (appState !== 'active') {
      console.log('App no está activa, programando restauración de tracking cuando vuelva a primer plano');

      scheduleStartWhenForeground({
        userId: trackingState.userId,
        role: trackingState.role,
        rideId: trackingState.rideId || null,
      });

      await saveTrackingState({
        isTracking: trackingState.isTracking,
        userId: trackingState.userId,
        role: trackingState.role,
        rideId: trackingState.rideId ?? null,
        startTime: trackingState.startTime ?? Date.now(),
      });

      return false;
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

/**
 * Detecta si el tracking activo fue registrado con opciones de ubicación
 * distintas a las actuales (el registro nativo persiste entre reloads y
 * sesiones — sin esto, cambiar timeInterval/distanceInterval nunca toma
 * efecto hasta reinstalar la app).
 */
export async function isTrackingOptionsStale(): Promise<boolean> {
  try {
    const state = await loadTrackingState();
    if (!state.isTracking) return false;
    return state.optionsHash !== getTrackingOptionsHash();
  } catch (error) {
    console.warn('⚠️ Error verificando opciones de tracking:', error);
    return false;
  }
}

export default {
  checkBackgroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  updateTrackingRideId,
  getTrackingState,
  isTrackingActive,
  isTrackingOptionsStale,
  ensureBackgroundTrackingIntegrity,
};
