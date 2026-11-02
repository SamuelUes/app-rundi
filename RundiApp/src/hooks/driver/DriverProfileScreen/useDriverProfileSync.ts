import { useEffect } from 'react';
import { useAuth } from '../../shared/auth/useAuth';
import { fetchDriverProfile } from '../../../services/driver/driverProfilesService';

/**
 * useDriverProfileSync
 * v1 sincronizaba el perfil a RTDB `driversInfo/{uid}`.
 * v2: `DATA-MAIN_drivers` es proyección backend-only (consumer desde SQL) —
 * el cliente no puede escribirla. Este hook solo pre-carga el cache local
 * del perfil para que las pantallas lo tengan fresco.
 */
export function useDriverProfileSync() {
  const { user, userMode } = useAuth();

  useEffect(() => {
    const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
    if (!user?.id || !isDriverCapable || userMode !== 'driver') {
      return;
    }

    let cancelled = false;
    fetchDriverProfile(user.id, { forceRefresh: true })
      .catch((error) => {
        if (!cancelled) {
          console.warn(
            '[useDriverProfileSync] Error precargando perfil del conductor:',
            (error as any)?.message || error,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, userMode]);

  return null;
}
