/**
 * useUserMode - Hook for user mode (client/driver) management.
 * Extracted from AuthContext.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseDatabase } from '../../../config/firebase';
import { ref, update, serverTimestamp, get } from 'firebase/database';
import backendConfig from '../../../config/backendConfig';
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

async function cleanupRealtimeDataForModeChange(
  userId: string,
  mode: 'client' | 'driver',
): Promise<void> {
  if (!backendConfig.isFirebase()) return;

  try {
    const database = await getFirebaseDatabase();
    const rootRef = ref(database);
    const updates: Record<string, any> = {};

    if (mode === 'client') {
      updates[`driversInfo/${userId}/updatedAt`] = serverTimestamp();
      updates[`driversInfo/${userId}/lastSeen`] = serverTimestamp();
      updates[`driverLocations/${userId}/status`] = 'offline';
      updates[`driverLocations/${userId}/lat`] = null;
      updates[`driverLocations/${userId}/lng`] = null;
      updates[`driverLocations/${userId}/updatedAt`] = serverTimestamp();
      updates[`driverLocations/${userId}/lastSeen`] = serverTimestamp();

      try {
        const byAreaRef = ref(database, 'driverLocationsByArea');
        const snapshot = await get(byAreaRef);
        if (snapshot.exists()) {
          snapshot.forEach((areaSnap) => {
            const areaId = areaSnap.key;
            if (areaId) {
              updates[`driverLocationsByArea/${areaId}/${userId}`] = null;
            }
          });
        }
      } catch (areaErr) {
        console.warn('⚠️ Error limpiando driverLocationsByArea:', areaErr);
      }
    } else {
      updates[`clientsInfo/${userId}`] = null;
      updates[`clientsLocations/${userId}`] = null;
      updates[`presence/${userId}`] = null;
    }

    if (Object.keys(updates).length > 0) {
      await update(rootRef, updates);
    }
  } catch (err) {
    console.warn('⚠️ Error limpiando datos RTDB:', err);
  }
}

export function useUserMode() {
  const userMode = useAuthStore((s) => s.userMode);
  const setUserMode = useAuthStore((s) => s.setUserMode);
  const user = useAuthStore((s) => s.user);

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

      if (user?.id) {
        cleanupRealtimeDataForModeChange(user.id, mode).catch((err) => {
          console.warn('⚠️ Error en cleanupRealtimeDataForModeChange:', err);
        });
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
    [user?.id, setUserMode],
  );

  return { userMode, updateUserMode, applyDefaultUserMode };
}
