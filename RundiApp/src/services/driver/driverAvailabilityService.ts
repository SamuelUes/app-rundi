/**
 * Driver Availability Service
 * Maneja la persistencia del estado de disponibilidad del conductor
 * incluso cuando la app está en segundo plano
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import driversService from './driversService';
import { getFirebaseAuth } from '../../config/firebase';
import { writeDriverLiveLocation } from '../../live/driverLive';

const AVAILABILITY_KEY = '@driver_availability_state';
const LAST_UPDATE_KEY = '@driver_last_update';
// Refresh defensivo del estado 'available'. El backend no aplica TTL a la
// disponibilidad (driverOffline solo reacciona a writes de estado), así que
// 60s bastan — antes eran 30s y duplicaba los round-trips por minuto.
const HEARTBEAT_INTERVAL = 60000; // 60 segundos

interface AvailabilityState {
  isAvailable: boolean;
  isDesignatedDriverMode: boolean;
  lastUpdate: string;
  coords?: {
    latitude: number;
    longitude: number;
  };
}

class DriverAvailabilityService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: any = null;

  private isBackendAvailableStatus(status?: string): boolean {
    return String(status || '').toLowerCase() === 'available';
  }

  normalizeAvailabilityState(
    baseState: AvailabilityState,
    backendStatus?: string,
    coords?: { latitude: number; longitude: number } | null,
  ): AvailabilityState {
    const isAvailable = backendStatus ? this.isBackendAvailableStatus(backendStatus) : Boolean(baseState.isAvailable);
    return {
      ...baseState,
      isAvailable,
      isDesignatedDriverMode: isAvailable ? baseState.isDesignatedDriverMode : false,
      lastUpdate: new Date().toISOString(),
      coords: coords ?? baseState.coords,
    };
  }

  private isAvailabilityRestrictedError(error: any): boolean {
    const message = String(error?.message || error?.details || error?.code || '').toLowerCase();
    const composed = message.replace(/\s+/g, '');
    return (
      (message.includes('comisiones') && message.includes('penalizaciones')) ||
      (message.includes('comisiones') && message.includes('pendientes')) ||
      message.includes('liquida las comisiones') ||
      message.includes('availability limit') ||
      composed.includes('comisiones/penalizaciones')
    );
  }

  async handleAvailabilityRestriction(context?: string): Promise<void> {
    try {
      const state = await this.getAvailabilityState();
      const updatedState: AvailabilityState = {
        isAvailable: false,
        isDesignatedDriverMode: false,
        lastUpdate: new Date().toISOString(),
        coords: state?.coords,
      };

      await this.saveAvailabilityState(updatedState);

      // driverLocations es la fuente de verdad que el UI escucha en vivo;
      // si quedara 'available' el estado volvería a encenderse solo (flap)
      try {
        await driversService.updateStatus('offline', state?.coords);
      } catch (statusErr) {
        console.warn('⚠️ No se pudo marcar offline en backend tras restricción:', statusErr);
      }

      if (context) {
        console.warn(`🚫 Disponibilidad establecida en offline debido a restricción (${context})`);
      } else {
        console.warn('🚫 Disponibilidad establecida en offline debido a restricción');
      }
    } catch (error) {
      console.error('❌ Error manejando restricción de disponibilidad:', error);
    } finally {
      this.stopHeartbeat();
    }
  }

  /**
   * Guardar estado de disponibilidad
   */
  async saveAvailabilityState(state: AvailabilityState): Promise<void> {
    try {
      await AsyncStorage.setItem(AVAILABILITY_KEY, JSON.stringify(state));
      console.log('✅ Estado de disponibilidad guardado:', state);
    } catch (error) {
      console.error('❌ Error guardando estado de disponibilidad:', error);
    }
  }

  /**
   * Obtener estado de disponibilidad guardado
   */
  async getAvailabilityState(): Promise<AvailabilityState | null> {
    try {
      const stateStr = await AsyncStorage.getItem(AVAILABILITY_KEY);
      if (stateStr) {
        const state = JSON.parse(stateStr);
        console.log('✅ Estado de disponibilidad recuperado:', state);
        return state;
      }
      return null;
    } catch (error) {
      console.error('❌ Error recuperando estado de disponibilidad:', error);
      return null;
    }
  }

  /**
   * Limpiar estado de disponibilidad
   */
  async clearAvailabilityState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(AVAILABILITY_KEY);
      console.log('✅ Estado de disponibilidad limpiado');
    } catch (error) {
      console.error('❌ Error limpiando estado de disponibilidad:', error);
    }
  }

  /**
   * Iniciar heartbeat para mantener disponibilidad activa
   * Envía actualizaciones periódicas al backend con manejo de errores
   */
  startHeartbeat(coords: { latitude: number; longitude: number } | null): void {
    if (this.heartbeatInterval) {
      console.log('⚠️ Heartbeat ya está activo');
      return;
    }

    console.log('💓 Iniciando heartbeat de disponibilidad');

    this.heartbeatInterval = setInterval(async () => {
      try {
        const state = await this.getAvailabilityState();
        
        if (state && state.isAvailable) {
          try {
            const effectiveCoords = coords || state.coords;
            if (!effectiveCoords) {
              return;
            }

            // Heartbeat = GPS/lastSeen solamente. La sesión de disponibilidad
            // la controla el backend (el heartbeat nunca reactiva ni baja el
            // estado; el listener de drivers_live es la fuente de verdad).
            const auth = await getFirebaseAuth();
            const uid = auth.currentUser?.uid;
            if (!uid) {
              this.stopHeartbeat();
              return;
            }
            await writeDriverLiveLocation(uid, {
              latitude: effectiveCoords.latitude,
              longitude: effectiveCoords.longitude,
            });

            // Actualizar timestamp
            state.lastUpdate = new Date().toISOString();
            state.coords = effectiveCoords;
            await this.saveAvailabilityState(state);

            console.log('💓 Heartbeat enviado - Conductor disponible');
          } catch (updateError: any) {
            // No lanzar error, solo registrar
            const errorCode = updateError?.code || updateError?.message || 'unknown';
            console.warn(`⚠️ Heartbeat falló (${errorCode}), reintentando en próximo ciclo`);

            if (this.isAvailabilityRestrictedError(updateError)) {
              await this.handleAvailabilityRestriction('heartbeat');
              return;
            }

            // Si es un error de autenticación, detener heartbeat
            if (errorCode === 'auth/user-token-expired' || errorCode === 'unauthenticated') {
              console.error('🔐 Token expirado, deteniendo heartbeat');
              this.stopHeartbeat();
            }
          }
        }
      } catch (error: any) {
        console.warn('⚠️ Error en ciclo de heartbeat:', error?.message || error);
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Detener heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('💔 Heartbeat detenido');
    }
  }

  /**
   * Manejar cambios de estado de la app (background/foreground)
   */
  handleAppStateChange = async (
    nextAppState: AppStateStatus,
    coords: { latitude: number; longitude: number } | null,
    onStateRestored?: (state: AvailabilityState) => void
  ) => {
    console.log(`📱 App state cambió a: ${nextAppState}`);

    if (nextAppState === 'active') {
      // App volvió a foreground
      const savedState = await this.getAvailabilityState();
      
      if (savedState && savedState.isAvailable) {
        console.log('🔄 Restaurando estado de disponibilidad');

        // Reabrir la app NO reactiva: la sesión SQL decide (si expiró, el
        // listener de drivers_live ya refleja offline). Solo refrescamos el
        // GPS/lastSeen para que el sweep de presencia no confunda al
        // conductor con uno desconectado.
        if (coords) {
          try {
            const auth = await getFirebaseAuth();
            const uid = auth.currentUser?.uid;
            if (uid) {
              await writeDriverLiveLocation(uid, {
                latitude: coords.latitude,
                longitude: coords.longitude,
              });
              console.log('✅ GPS refrescado al volver a foreground');
            }
          } catch (error) {
            console.warn('⚠️ No se pudo refrescar GPS al volver:', error);
          }
        }

        // Notificar al componente
        if (onStateRestored) {
          onStateRestored(savedState);
        }

        // Reiniciar heartbeat
        this.startHeartbeat(coords);
      }
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App fue a background
      console.log('📴 App en background - manteniendo disponibilidad');
      // El heartbeat continúa ejecutándose en background (limitado por el SO)
    }
  };

  /**
   * Inicializar listener de AppState
   */
  initAppStateListener(
    coords: { latitude: number; longitude: number } | null,
    onStateRestored?: (state: AvailabilityState) => void
  ): void {
    if (this.appStateSubscription) {
      console.log('⚠️ AppState listener ya está activo');
      return;
    }

    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      this.handleAppStateChange(nextAppState, coords, onStateRestored);
    });

    console.log('👂 AppState listener iniciado');
  }

  /**
   * Remover listener de AppState
   */
  removeAppStateListener(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
      console.log('🔇 AppState listener removido');
    }
  }

  /**
   * Cleanup completo
   */
  cleanup(): void {
    this.stopHeartbeat();
    this.removeAppStateListener();
  }
}

export default new DriverAvailabilityService();
