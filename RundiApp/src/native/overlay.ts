import { Platform, AppState } from 'react-native';
import {
  OverlayPermissionModule as NativeModule,
  RundiLiveActivityModule as LiveActivityModule,
} from '../../modules/rundi-native/src';

const isAndroid = Platform.OS === 'android';
const isIOS = Platform.OS === 'ios';
const isSupported = isAndroid || isIOS;
let isOperationInProgress = false;

const ensureAndroidModule = () => {
  if (!isAndroid || !NativeModule) {
    return null;
  }
  return NativeModule;
};

const ensureIosModule = () => {
  if (!isIOS || !LiveActivityModule) {
    return null;
  }
  return LiveActivityModule;
};

type RideOverlayArgs = {
  rideId: string;
  price: number;
  distanceKm: number;
  clientName?: string | null;
  variant?: 'app' | 'nearby_ride';
};

const callNative = (promise: Promise<unknown>, label: string, timeoutMs = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${label}`)), timeoutMs)),
  ]);

/**
 * Overlay Manager ROBUSTO
 * - Android: burbuja flotante SYSTEM_ALERT_WINDOW (OverlayPermissionModule)
 * - iOS: Live Activity / Dynamic Island (RundiNative + targets/RideActivity)
 * - Previene operaciones concurrentes
 * - Timeout de 5 segundos para operaciones
 * - Manejo de errores exhaustivo
 * - Validación de parámetros
 */
export const overlayManager = {
  async hasPermission(): Promise<boolean> {
    try {
      if (isIOS) {
        const module = ensureIosModule();
        return module ? (await callNative(module.liveActivitiesEnabled(), 'checking Live Activities')) === true : false;
      }

      const module = ensureAndroidModule();
      if (!module) {
        return Platform.OS !== 'android';
      }

      const result = await callNative(module.hasOverlayPermission(), 'checking permission');
      return result === true;
    } catch (error) {
      console.warn('[overlayManager] hasPermission error:', error);
      return false;
    }
  },

  async requestPermission(): Promise<boolean> {
    if (isIOS) {
      // iOS no expone una API de "request": el prompt de Live Activities
      // aparece en el primer Activity.request. Se consulta el estado actual.
      return this.hasPermission();
    }

    const module = ensureAndroidModule();
    if (!module) return Platform.OS !== 'android';

    try {
      const result = await callNative(module.requestOverlayPermission(), 'requesting permission', 120000);
      return result === true;
    } catch (error) {
      console.warn('[overlayManager] requestPermission error:', error);
      return false;
    }
  },

  async showRideOverlay(options: RideOverlayArgs) {
    console.log('🔵 [overlayManager] showRideOverlay() LLAMADO con options:', options);
    console.log('🔵 [overlayManager] AppState.currentState:', AppState.currentState);

    if (isOperationInProgress) {
      console.warn('⚠️ [overlayManager] Operation already in progress, skipping');
      return;
    }

    try {
      isOperationInProgress = true;
      console.log('🔵 [overlayManager] Step 1: Obteniendo módulo nativo...');
      const androidModule = ensureAndroidModule();
      const iosModule = ensureIosModule();
      console.log('🔵 [overlayManager] Módulo nativo:', androidModule || iosModule ? 'EXISTE ✅' : 'NO EXISTE ❌');

      if (!androidModule && !iosModule) {
        if (!isSupported) return;
        console.error('❌ [overlayManager] showRideOverlay - No hay módulo nativo disponible');
        return;
      }

      // Validar parámetros
      const { rideId, price, distanceKm, clientName, variant } = options;
      console.log('🔵 [overlayManager] Step 2: Validando parámetros...');

      if (!rideId || typeof rideId !== 'string') {
        console.error('❌ [overlayManager] Invalid rideId:', rideId);
        return;
      }

      const sanitizedPrice = Number.isFinite(price) ? price : 0;
      const sanitizedDistance = Number.isFinite(distanceKm) ? Math.max(0.1, distanceKm) : 0.1;
      console.log('🔵 [overlayManager] Parámetros sanitizados:', {
        rideId,
        price: sanitizedPrice,
        distanceKm: sanitizedDistance,
        clientName,
      });

      // Verificar permiso / estado
      // En iOS no se gatea aquí: el prompt del sistema solo se dispara con el
      // primer Activity.request, y areActivitiesEnabled puede ser false antes de él.
      // El módulo nativo rechaza la promesa si el usuario denegó Live Activities.
      if (!isIOS) {
        console.log('🔵 [overlayManager] Step 3: Verificando permiso...');
        const hasPermission = await this.hasPermission();
        console.log('🔵 [overlayManager] hasPermission:', hasPermission);

        if (!hasPermission) {
          console.error('❌ [overlayManager] showRideOverlay - Sin permiso de overlay');
          return;
        }
      }

      const payload = {
        rideId,
        price: sanitizedPrice,
        distanceKm: sanitizedDistance,
        clientName: clientName ?? null,
        variant: variant ?? 'app',
      };
      console.log('🔵 [overlayManager] Step 4: Llamando a módulo nativo...', payload);

      await callNative(
        isIOS
          ? iosModule!.showRideActivity(payload)
          : androidModule!.showRideOverlay(payload),
        'showing overlay'
      );

      console.log('✅ [overlayManager] Overlay shown successfully - módulo nativo ejecutado');
    } catch (error: any) {
      console.error('❌ [overlayManager] showRideOverlay error:', error?.message || error);
      console.error('❌ [overlayManager] Stack trace:', error?.stack);
      // Intentar limpiar estado si falla
      try {
        await this.hideOverlay();
      } catch (cleanupError) {
        console.warn('⚠️ [overlayManager] Cleanup error:', cleanupError);
      }
    } finally {
      isOperationInProgress = false;
      console.log('🔵 [overlayManager] showRideOverlay() FINALIZADO');
    }
  },

  async hideOverlay() {
    try {
      const androidModule = ensureAndroidModule();
      const iosModule = ensureIosModule();
      if (!androidModule && !iosModule) return;

      await callNative(
        isIOS ? iosModule!.hideRideActivity() : androidModule!.hideRideOverlay(),
        'hiding overlay',
        3000
      );

      console.log('✅ [overlayManager] Overlay hidden successfully');
    } catch (error) {
      console.warn('[overlayManager] hideOverlay error:', error);
    } finally {
      isOperationInProgress = false;
    }
  },

  /**
   * Android-only: trae la app al frente (SYSTEM_ALERT_WINDOW exime la
   * restricción de background-activity-start). En iOS no existe API
   * equivalente — retorna false.
   */
  async bringAppToFront(rideId: string): Promise<boolean> {
    if (!isAndroid || !NativeModule) {
      return false;
    }
    try {
      const result = await callNative(NativeModule.bringAppToFront(rideId), 'bringing app to front');
      return result === true;
    } catch (error) {
      console.warn('[overlayManager] bringAppToFront error:', error);
      return false;
    }
  },

  async openSystemSettings() {
    try {
      if (isIOS) {
        const module = ensureIosModule();
        if (module) await module.openLiveActivitySettings();
        return;
      }
      const module = ensureAndroidModule();
      if (module) await module.openOverlaySettings();
    } catch (error) {
      console.warn('[overlayManager] openSystemSettings error:', error);
    }
  },
};

export { NativeModule as OverlayPermissionModule, LiveActivityModule as RundiLiveActivityModule };
