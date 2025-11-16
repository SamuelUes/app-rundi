import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import backgroundLocationService from '../services/backgroundLocationService';

/**
 * Inicia tracking de ubicación en segundo plano para conductores
 * para habilitar "viaje por aproximación" aún con pantalla apagada.
 */
export default function useDriverProximityTracking() {
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        if (!user?.id) return;
        const role = user.role === 'driver' || user.role === 'designated_driver' ? 'driver' : 'client';
        if (role !== 'driver') return;

        // Verifica si ya está activo
        const active = await backgroundLocationService.isTrackingActive();
        if (cancelled) return;
        if (active) return;

        await backgroundLocationService.startBackgroundLocationTracking(user.id, 'driver');
      } catch (e) {
        // noop
      }
    };

    start();
    return () => {
      cancelled = true;
      // No detenemos tracking para permitir "viaje por aproximación" en background
    };
  }, [user?.id, user?.role]);
}
