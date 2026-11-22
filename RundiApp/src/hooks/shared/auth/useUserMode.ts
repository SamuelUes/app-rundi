/**
 * useUserMode - Hook for user mode (client/driver) management.
 * Extracted from AuthContext.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import backgroundLocationService from '../../../services/map/backgroundLocationService';
import proximityService from '../../../services/ride/proximityService';
import driverAvailabilityService from '../../../services/driver/driverAvailabilityService';
import { writeDriverDesignatedMode } from '../../../live/driverLive';
import { deactivateAvailability } from '../../../api/compliance';
import { useAuthStore, User } from '../../../stores/authStore';

function normalizeRoleValue(role: any): User['role'] | null {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (
    normalized === 'client' ||
    normalized === 'driver' ||
    normalized === 'designated_driver' ||
    normalized === 'admin'
  ) {
    return normalized as User['role'];
  }
  return null;
}

export function resolveUserModeFromRole(role: any): 'client' | 'driver' {
  const normalizedRole = normalizeRoleValue(role);
  if (normalizedRole === 'driver' || normalizedRole === 'designated_driver') {
    return 'driver';
  }
  return 'client';
}

export function useUserMode() {
  const userMode = useAuthStore((s) => s.userMode);
  const setUserMode = useAuthStore((s) => s.setUserMode);

  const applyDefaultUserMode = useCallback(
    (role: User['role']) => {
      if (role === 'driver' || role === 'designated_driver') {
        setUserMode('driver');
      } else {
        setUserMode('client');
      }
    },
    [setUserMode],
  );

  const updateUserMode = useCallback(
    async (mode: 'client' | 'driver') => {
      const { userMode: prevMode, user: prevUser } = useAuthStore.getState();
      setUserMode(mode);
      try {
        await AsyncStorage.setItem('userMode', mode);
      } catch (err) {
        console.warn('⚠️ Error guardando userMode:', err);
      }

      if (mode === 'client') {
        // conductor→cliente: revocar la sesión de disponibilidad para que la
        // proyección backend ponga REALTIME_drivers_live.status='offline'
        // (status es backend-authority: las reglas no lo dejan escribir al
        // cliente). Best-effort como en logout; si falla, el sweep de
        // presencia cierra la sesión por lastSeen viejo.
        const wasDriverCapable =
          prevUser?.role === 'driver' || prevUser?.role === 'designated_driver';
        if (prevMode === 'driver' && wasDriverCapable) {
          void deactivateAvailability().catch((err) => {
            console.warn('⚠️ Error revocando disponibilidad al cambiar de modo:', err);
          });
          // Conductor designado: apagar el toggle vivo drivers_live.designatedMode
          // (paridad con el offline manual — la proyección backend no lo limpia
          // y es autoridad del cliente; si queda true se reactiva solo al
          // volver a ponerse disponible).
          if (prevUser?.role === 'designated_driver' && prevUser?.id) {
            void writeDriverDesignatedMode(prevUser.id, false).catch((err) => {
              console.warn('⚠️ Error apagando modo designado al cambiar de modo:', err);
            });
          }
          driverAvailabilityService.cleanup();
          try {
            await driverAvailabilityService.clearAvailabilityState();
          } catch (err) {
            console.warn('⚠️ Error limpiando estado de disponibilidad:', err);
          }
          proximityService.cancelProximitySequence();
        }
        try {
          await backgroundLocationService.stopBackgroundLocationTracking();
        } catch (err) {
          console.warn('⚠️ Error deteniendo tracking:', err);
        }
        try {
          await proximityService.hideOverlayBubble('userModeChangeToClient');
        } catch (err) {
          console.warn('⚠️ Error ocultando overlay:', err);
        }
      }
    },
    [setUserMode],
  );

  return { userMode, updateUserMode, applyDefaultUserMode };
}
