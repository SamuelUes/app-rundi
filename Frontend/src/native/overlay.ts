import { NativeModules, Platform } from 'react-native';

const Bridge = NativeModules.OverlayPermissionModule as
  | {
      hasOverlayPermission: () => Promise<boolean>;
      requestOverlayPermission: () => Promise<boolean>;
      showRideOverlay: (rideId: string, price: number, distanceKm: number, clientName?: string | null) => Promise<boolean>;
      hideRideOverlay: () => Promise<boolean>;
      openOverlaySettings: () => Promise<boolean>;
    }
  | undefined;

const isAndroid = Platform.OS === 'android';
let isOperationInProgress = false;

const ensureModule = () => {
  if (!isAndroid || !Bridge) {
    return null;
  }
  return Bridge;
};

/**
 * Overlay Manager ROBUSTO
 * - Previene operaciones concurrentes
 * - Timeout de 5 segundos para operaciones
 * - Manejo de errores exhaustivo
 * - Validación de parámetros
 */
export const overlayManager = {
  async hasPermission(): Promise<boolean> {
    try {
      const module = ensureModule();
      if (!module) {
        return Platform.OS !== 'android';
      }
      
      const result = await Promise.race([
        module.hasOverlayPermission(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout checking permission')), 5000)
        )
      ]);
      
      return result === true;
    } catch (error) {
      console.warn('[overlayManager] hasPermission error:', error);
      return false;
    }
  },

  async requestPermission(): Promise<boolean> {
    const module = ensureModule();
    if (!module) return Platform.OS !== 'android';
    
    try {
      const result = await Promise.race([
        module.requestOverlayPermission(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout requesting permission')), 10000)
        )
      ]);
      return result === true;
    } catch (error) {
      console.warn('[overlayManager] requestPermission error:', error);
      return false;
    }
  },

  async showRideOverlay(options: { rideId: string; price: number; distanceKm: number; clientName?: string | null }) {
    console.log('🔵 [overlayManager] showRideOverlay() LLAMADO con options:', options);
    
    if (isOperationInProgress) {
      console.warn('⚠️ [overlayManager] Operation already in progress, skipping');
      return;
    }

    try {
      isOperationInProgress = true;
      console.log('🔵 [overlayManager] Step 1: Obteniendo módulo nativo...');
      const module = ensureModule();
      console.log('🔵 [overlayManager] Módulo nativo:', module ? 'EXISTE ✅' : 'NO EXISTE ❌');
      
      if (!module) {
        console.error('❌ [overlayManager] showRideOverlay - No hay módulo nativo - ¿Está el módulo OverlayPermissionModule instalado?');
        return;
      }
      
      // Validar parámetros
      const { rideId, price, distanceKm, clientName } = options;
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
        clientName 
      });
      
      // Verificar permiso
      console.log('🔵 [overlayManager] Step 3: Verificando permiso...');
      const hasPermission = await this.hasPermission();
      console.log('🔵 [overlayManager] hasPermission:', hasPermission);
      
      if (!hasPermission) {
        console.error('❌ [overlayManager] showRideOverlay - Sin permiso de overlay');
        return;
      }
      
      console.log('🔵 [overlayManager] Step 4: Llamando a módulo nativo showRideOverlay()...');
      console.log('🔵 [overlayManager] Parámetros finales:', { 
        rideId, 
        price: sanitizedPrice, 
        distanceKm: sanitizedDistance, 
        clientName: clientName ?? null
      });
      
      await Promise.race([
        module.showRideOverlay(rideId, sanitizedPrice, sanitizedDistance, clientName ?? null),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout showing overlay')), 5000)
        )
      ]);
      
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
      const module = ensureModule();
      if (!module) return;
      
      await Promise.race([
        module.hideRideOverlay(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout hiding overlay')), 3000)
        )
      ]);
      
      console.log('✅ [overlayManager] Overlay hidden successfully');
    } catch (error) {
      console.warn('[overlayManager] hideOverlay error:', error);
    } finally {
      isOperationInProgress = false;
    }
  },

  async openSystemSettings() {
    const module = ensureModule();
    if (!module) return;
    try {
      await module.openOverlaySettings();
    } catch (error) {
      console.warn('[overlayManager] openSystemSettings error:', error);
    }
  },
};
