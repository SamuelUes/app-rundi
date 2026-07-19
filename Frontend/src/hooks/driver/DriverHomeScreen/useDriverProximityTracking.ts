import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '../../../context/AuthContext';
import backgroundLocationService, { checkBackgroundLocationPermission } from '../../../services/backgroundLocationService';
import { ensureActivityRecognitionPermission } from '../../../utils/activityPermission';
import { isRegistrationUploadsInProgress, subscribeRegistrationUploadsInProgress } from '../../../services/proximityService';

/**
 * Inicia tracking de ubicación en segundo plano para conductores
 * para habilitar "viaje por aproximación" aún con pantalla apagada.
 */
export default function useDriverProximityTracking() {
  const { user, userMode } = useAuth();

  useEffect(() => {
    const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
    if (!user?.id || !isDriverCapable || userMode !== 'driver') {
      // Esperar a que el usuario esté en modo conductor antes de iniciar el tracking
      return;
    }

    let cancelled = false;
    let currentAppState: AppStateStatus = AppState.currentState;

    const start = async () => {
      try {
        console.log('🚀 [useDriverProximityTracking] Inicializando...');

        const uploadsGate = await isRegistrationUploadsInProgress();
        if (uploadsGate) {
          console.log('⏸️ [useDriverProximityTracking] Uploads de registro activos, se difiere start');
          return;
        }

        if (currentAppState !== 'active') {
          console.log(`⏸️ [useDriverProximityTracking] AppState=${currentAppState}, se espera foreground`);
          return;
        }

        console.log('🚀 [useDriverProximityTracking] Role: driver (modo activo)');

        console.log('🔐 [useDriverProximityTracking] Solicitando permiso de activity recognition...');
        await ensureActivityRecognitionPermission();

        console.log('🔐 [useDriverProximityTracking] Verificando permiso de background location...');
        const hasBackgroundPermission = await checkBackgroundLocationPermission();
        console.log(`🔐 [useDriverProximityTracking] Background permission: ${hasBackgroundPermission}`);
        
        if (!hasBackgroundPermission) {
          console.log('⚠️ [useDriverProximityTracking] No hay permiso de background location');
          return;
        }

        // Verifica si ya está activo
        console.log('🔍 [useDriverProximityTracking] Verificando si tracking ya está activo...');
        const active = await backgroundLocationService.isTrackingActive();
        console.log(`🔍 [useDriverProximityTracking] Tracking activo: ${active}`);
        
        if (cancelled) return;
        if (active) {
          console.log('ℹ️ [useDriverProximityTracking] Tracking ya activo, saltando');
          return;
        }

        console.log('🚀 [useDriverProximityTracking] Iniciando background tracking...');
        await backgroundLocationService.startBackgroundLocationTracking(user.id, 'driver');
        console.log('✅ [useDriverProximityTracking] Background tracking iniciado correctamente');
      } catch (e) {
        console.error('❌ [useDriverProximityTracking] Error:', e);
      }
    };

    start();

    const unsubscribeFlag = subscribeRegistrationUploadsInProgress((value) => {
      if (!cancelled && !value) {
        console.log('▶️ [useDriverProximityTracking] Uploads completados, reintentando iniciar tracking');
        start();
      }
    });

    const appStateListener = AppState.addEventListener('change', (nextState) => {
      currentAppState = nextState;
      if (!cancelled && nextState === 'active') {
        console.log('▶️ [useDriverProximityTracking] App volvió a foreground, reintentando start');
        start();
      }
    });

    return () => {
      cancelled = true;
      unsubscribeFlag();
      appStateListener.remove();
      console.log('🔇 [useDriverProximityTracking] Hook cleanup');
      // No detenemos tracking para permitir "viaje por aproximación" en background
    };
  }, [user?.id, user?.role, userMode]);
}
