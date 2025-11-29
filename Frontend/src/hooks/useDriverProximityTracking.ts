import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import backgroundLocationService, { checkBackgroundLocationPermission } from '../services/backgroundLocationService';
import { ensureActivityRecognitionPermission } from '../utils/activityPermission';

/**
 * Inicia tracking de ubicación en segundo plano para conductores
 * para habilitar "viaje por aproximación" aún con pantalla apagada.
 */
export default function useDriverProximityTracking() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) {
      // Esperar a que el usuario esté cargado antes de iniciar el tracking
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        console.log('🚀 [useDriverProximityTracking] Inicializando...');
        
        const role = user.role === 'driver' || user.role === 'designated_driver' ? 'driver' : 'client';
        console.log(`🚀 [useDriverProximityTracking] Role: ${role}`);
        
        if (role !== 'driver') {
          console.log('ℹ️ [useDriverProximityTracking] No es conductor, saltando');
          return;
        }

        if (role === 'driver') {
          console.log('🔐 [useDriverProximityTracking] Solicitando permiso de activity recognition...');
          await ensureActivityRecognitionPermission();
        }

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
    return () => {
      cancelled = true;
      console.log('🔇 [useDriverProximityTracking] Hook cleanup');
      // No detenemos tracking para permitir "viaje por aproximación" en background
    };
  }, [user?.id, user?.role]);
}
