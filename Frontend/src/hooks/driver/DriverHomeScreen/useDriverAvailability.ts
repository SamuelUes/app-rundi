import { useState, useCallback, useEffect, useRef } from 'react';
import driversService from '../../../services/driversService';
import driverAvailabilityService from '../../../services/driverAvailabilityService';
import alertService from '../../../services/alertService';
import type { Coords } from '../../../utils/rideCoords';

interface UseDriverAvailabilityOptions {
  userId: string | undefined;
  userRole: string | undefined;
  coords: Coords | null;
  hasInsufficientFunds: boolean;
  rechargeFundsSummary: { availableBalance: number; blocked: boolean } | null;
  tr: (path: string, options?: Record<string, any>) => string;
  navigation: any;
  markTaskCompleted: (task: string) => void;
}

export function useDriverAvailability({
  userId,
  userRole,
  coords,
  hasInsufficientFunds,
  rechargeFundsSummary,
  tr,
  navigation,
  markTaskCompleted,
}: UseDriverAvailabilityOptions) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isDesignatedDriverMode, setIsDesignatedDriverMode] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const enforcingAvailabilityRef = useRef<boolean>(false);
  const rechargeAlertShownRef = useRef<boolean>(false);

  // Restore availability state on mount
  useEffect(() => {
    let isActive = true;

    const finalize = () => {
      if (isActive) {
        markTaskCompleted('availabilityState');
      }
    };

    if (!coords) {
      finalize();
      return;
    }

    const restoreAvailabilityState = async () => {
      try {
        const savedState = await driverAvailabilityService.getAvailabilityState();
        if (!savedState) return;

        let normalizedState = savedState;

        if (savedState.isAvailable) {
          try {
            const statusResult = await driversService.updateStatus('available', coords);
            normalizedState = driverAvailabilityService.normalizeAvailabilityState(
              savedState,
              statusResult?.status,
              { latitude: coords.latitude, longitude: coords.longitude },
            );

            await driverAvailabilityService.saveAvailabilityState(normalizedState);
          } catch (err) {
            console.error('❌ Error restaurando estado de disponibilidad:', err);
          }
        }

        setIsAvailable(normalizedState.isAvailable);
        setIsDesignatedDriverMode(normalizedState.isDesignatedDriverMode);
      } catch (err) {
        console.error('❌ Error restaurando estado de disponibilidad:', err);
      }
    };

    restoreAvailabilityState().finally(finalize);

    return () => {
      isActive = false;
    };
  }, [coords, markTaskCompleted]);

  // Init app state listener + heartbeat
  useEffect(() => {
    if (!coords) return;

    driverAvailabilityService.initAppStateListener(coords, (restoredState) => {
      setIsAvailable(restoredState.isAvailable);
      setIsDesignatedDriverMode(restoredState.isDesignatedDriverMode);
    });

    if (isAvailable) {
      driverAvailabilityService.startHeartbeat(coords);
    }

    return () => {
      driverAvailabilityService.cleanup();
    };
  }, [coords, isAvailable]);

  // Force offline when insufficient funds
  const enforceOfflineDueToRechargeFunds = useCallback(async () => {
    if (!userId || !coords) {
      return;
    }
    if (!isAvailable) {
      return;
    }
    if (enforcingAvailabilityRef.current) {
      return;
    }

    enforcingAvailabilityRef.current = true;
    const shouldManageUpdatingState = !updatingStatus;
    if (shouldManageUpdatingState) {
      setUpdatingStatus(true);
    }

    try {
      await driversService.updateStatus('offline', coords);
      setIsAvailable(false);

      if (isDesignatedDriverMode && userRole === 'designated_driver') {
        setIsDesignatedDriverMode(false);
        try {
          await driversService.updateDesignatedDriverMode(userId, false);
        } catch (modeErr) {
          console.warn('⚠️ Error desactivando modo designado al forzar offline:', modeErr);
        }
      }

      driverAvailabilityService.stopHeartbeat();
      try {
        await driverAvailabilityService.clearAvailabilityState();
      } catch (storageErr) {
        console.warn('⚠️ No se pudo limpiar estado de disponibilidad:', storageErr);
      }
    } catch (err) {
      console.error('❌ Error forzando offline por fondos:', err);
    } finally {
      if (shouldManageUpdatingState) {
        setUpdatingStatus(false);
      }
      enforcingAvailabilityRef.current = false;
    }
  }, [coords, isAvailable, isDesignatedDriverMode, updatingStatus, userId, userRole]);

  // Show recharge alert + enforce offline
  useEffect(() => {
    if (!rechargeFundsSummary) {
      return;
    }

    const availableBalance = Number(rechargeFundsSummary.availableBalance ?? 0);

    if (hasInsufficientFunds) {
      if (!rechargeAlertShownRef.current) {
        rechargeAlertShownRef.current = true;
        alertService.showInfoAlert(
          tr('driver.home.alerts.rechargeRequiredTitle'),
          tr('driver.home.alerts.rechargeRequiredBody', {
            amount: availableBalance.toFixed(2),
          }),
          () => navigation.navigate('RechargeFunds'),
        );
      }
      void enforceOfflineDueToRechargeFunds();
    } else {
      rechargeAlertShownRef.current = false;
    }
  }, [hasInsufficientFunds, rechargeFundsSummary, enforceOfflineDueToRechargeFunds, navigation, tr]);

  const handleAvailabilityToggle = useCallback(async (nextValue: boolean) => {
    if (!userId || !coords) {
      alertService.showErrorAlert(tr('driver.home.alerts.availabilityUpdateFailed'));
      return;
    }

    if (updatingStatus) {
      return;
    }

    if (nextValue && hasInsufficientFunds && rechargeFundsSummary) {
      alertService.showInfoAlert(
        tr('driver.home.alerts.rechargeRequiredTitle'),
        tr('driver.home.alerts.rechargeRequiredBody', {
          amount: Number(rechargeFundsSummary.availableBalance).toFixed(2),
        }),
        () => navigation.navigate('RechargeFunds')
      );
      return;
    }

    if (nextValue === isAvailable) {
      return;
    }

    setUpdatingStatus(true);
    try {
      const status = nextValue ? 'available' : 'offline';
      const statusResult = await driversService.updateStatus(status, coords);
      const normalizedState = driverAvailabilityService.normalizeAvailabilityState(
        {
          isAvailable: nextValue,
          isDesignatedDriverMode,
          lastUpdate: new Date().toISOString(),
          coords: { latitude: coords.latitude, longitude: coords.longitude },
        },
        statusResult?.status,
        { latitude: coords.latitude, longitude: coords.longitude },
      );
      const effectiveAvailable = normalizedState.isAvailable;
      const shouldDisableDesignated =
        (!nextValue || !effectiveAvailable) && isDesignatedDriverMode && userRole === 'designated_driver';

      setIsAvailable(effectiveAvailable);

      if (shouldDisableDesignated) {
        setIsDesignatedDriverMode(false);
        await driversService.updateDesignatedDriverMode(userId, false);
      }

      await driverAvailabilityService.saveAvailabilityState({
        ...normalizedState,
        isDesignatedDriverMode: shouldDisableDesignated ? false : normalizedState.isDesignatedDriverMode,
      });

      if (effectiveAvailable) {
        driverAvailabilityService.startHeartbeat(coords);
      } else {
        driverAvailabilityService.stopHeartbeat();
        await driverAvailabilityService.clearAvailabilityState();

        if (nextValue) {
          alertService.showErrorAlert(tr('driver.home.alerts.availabilityUpdateFailed'));
        }
      }
    } catch (err: any) {
      alertService.showErrorAlert(
        err?.message || tr('driver.home.alerts.availabilityUpdateFailed'),
      );
    } finally {
      setUpdatingStatus(false);
    }
  }, [userId, coords, updatingStatus, hasInsufficientFunds, rechargeFundsSummary, isAvailable, isDesignatedDriverMode, userRole, tr, navigation]);

  const handleDesignatedToggle = useCallback(async () => {
    if (userRole !== 'designated_driver' || !isAvailable || !userId) {
      return;
    }

    try {
      const next = !isDesignatedDriverMode;
      setIsDesignatedDriverMode(next);
      await driversService.updateDesignatedDriverMode(userId, next);
      const savedState = await driverAvailabilityService.getAvailabilityState();
      const coordsSnapshot = coords ? { latitude: coords.latitude, longitude: coords.longitude } : savedState?.coords;
      await driverAvailabilityService.saveAvailabilityState({
        isAvailable: savedState?.isAvailable ?? isAvailable,
        isDesignatedDriverMode: next,
        lastUpdate: new Date().toISOString(),
        coords: coordsSnapshot,
      });
    } catch (err) {
      console.error('❌ Error actualizando modo designado:', err);
    }
  }, [userRole, isAvailable, userId, isDesignatedDriverMode, coords]);

  return {
    isAvailable,
    setIsAvailable,
    isDesignatedDriverMode,
    setIsDesignatedDriverMode,
    updatingStatus,
    handleAvailabilityToggle,
    handleDesignatedToggle,
    enforceOfflineDueToRechargeFunds,
  };
}
