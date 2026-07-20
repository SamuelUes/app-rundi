import { useState, useCallback } from 'react';
import backgroundLocationService from '../../../services/backgroundLocationService';
import { useAuth } from '../auth/useAuth';

export interface UseBackgroundTrackingResult {
  isBackgroundTrackingActive: boolean;
  startBackgroundTracking: (rideId?: string) => Promise<boolean>;
  stopBackgroundTracking: () => Promise<void>;
  checkActive: () => Promise<void>;
}

export function useBackgroundTracking(): UseBackgroundTrackingResult {
  const { user, userMode } = useAuth();
  const [isBackgroundTrackingActive, setIsBackgroundTrackingActive] = useState(false);

  const startBackgroundTracking = useCallback(
    async (rideId?: string) => {
      if (!user) return false;

      try {
        if (isBackgroundTrackingActive) {
          if (rideId) {
            await backgroundLocationService.updateTrackingRideId(rideId);
          }
          return true;
        }

        const isDriverCapable = user.role === 'driver' || user.role === 'designated_driver';
        const trackingRole = isDriverCapable && userMode === 'driver' ? 'driver' : 'client';
        const started = await backgroundLocationService.startBackgroundLocationTracking(
          user.id,
          trackingRole,
          rideId,
        );

        setIsBackgroundTrackingActive(started);
        return started;
      } catch (error) {
        console.error('Error iniciando tracking en segundo plano:', error);
        return false;
      }
    },
    [user, userMode, isBackgroundTrackingActive],
  );

  const stopBackgroundTracking = useCallback(async () => {
    await backgroundLocationService.stopBackgroundLocationTracking();
    setIsBackgroundTrackingActive(false);
  }, []);

  const checkActive = useCallback(async () => {
    const active = await backgroundLocationService.isTrackingActive();
    setIsBackgroundTrackingActive(active);
  }, []);

  return {
    isBackgroundTrackingActive,
    startBackgroundTracking,
    stopBackgroundTracking,
    checkActive,
  };
}
