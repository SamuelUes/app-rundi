/**
 * Driver Availability Service
 * Maneja la persistencia del estado de disponibilidad del conductor
 * incluso cuando la app está en segundo plano
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import driversService from './driversService';

const AVAILABILITY_KEY = '@driver_availability_state';
const LAST_UPDATE_KEY = '@driver_last_update';
const HEARTBEAT_INTERVAL = 30000; // 30 segundos

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
        
        if (state && state.isAvailable && coords) {
          try {
            // Actualizar estado en el backend con reintentos
            await driversService.updateStatus('available', coords, 2);
            
            // Actualizar timestamp
            state.lastUpdate = new Date().toISOString();
            await this.saveAvailabilityState(state);
            
            console.log('💓 Heartbeat enviado - Conductor disponible');
          } catch (updateError: any) {
            // No lanzar error, solo registrar
            const errorCode = updateError?.code || updateError?.message || 'unknown';
            console.warn(`⚠️ Heartbeat falló (${errorCode}), reintentando en próximo ciclo`);
            
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
        
        // Restaurar estado en el backend
        if (coords) {
          try {
            await driversService.updateStatus('available', coords);
            console.log('✅ Estado restaurado en el backend');
          } catch (error) {
            console.error('❌ Error restaurando estado:', error);
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
