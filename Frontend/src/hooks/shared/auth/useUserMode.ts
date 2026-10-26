/**
 * useUserMode - Hook for user mode (client/driver) management.
 * Extracted from AuthContext.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import backgroundLocationService from '../../../services/backgroundLocationService';
import proximityService from '../../../services/proximityService';
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
      setUserMode(mode);
      try {
        await AsyncStorage.setItem('userMode', mode);
      } catch (err) {
        console.warn('⚠️ Error guardando userMode:', err);
      }

      if (mode === 'client') {
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
