import { useState, useCallback, useEffect, useRef } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import driversService from '../../../services/driver/driversService';
import driverAvailabilityService from '../../../services/driver/driverAvailabilityService';
import alertService from '../../../services/notification/alertService';
import type { Coords } from '../../../utils/geo/rideCoords';

interface UseDriverAvailabilityOptions {
  userId: string | undefined;
  userRole: string | undefined;
  coords: Coords | null;
  hasInsufficientFunds: boolean;
  rechargeFundsSummary: {
    availableBalance: number;
    blocked: boolean;
    pendingRecharges?: number;
    pendingAmount?: number;
  } | null;
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
  const availabilityRevisionRef = useRef(0);

  // Restore availability state on mount
  useEffect(() => {
    let isActive = true;
    const revision = availabilityRevisionRef.current;

    const finalize = () => {
      if (isActive) {
        markTaskCompleted('availabilityState');
      }
    };

    if (!coords || !userId) {
      finalize();
      return;
    }

    const restoreAvailabilityState = async () => {
      try {
        const db = await getFirebaseFirestore();
        const [savedState, statusSnapshot] = await Promise.all([
          driverAvailabilityService.getAvailabilityState(),
          getDoc(doc(db, FS_COL.driversLive, userId)),
        ]);
        if (!isActive || revision !== availabilityRevisionRef.current) return;
        const status = String(statusSnapshot.data()?.status || 'offline').trim().toLowerCase();
        const isOnline = status === 'online' || status === 'available' || status === 'on_ride' || status === 'busy';

        setIsAvailable(isOnline);
        setIsDesignatedDriverMode(isOnline && Boolean(savedState?.isDesignatedDriverMode));

        if (savedState) {
          await driverAvailabilityService.saveAvailabilityState({
            ...savedState,
            isAvailable: isOnline,
            isDesignatedDriverMode: isOnline && savedState.isDesignatedDriverMode,
            lastUpdate: new Date().toISOString(),
            coords: { latitude: coords.latitude, longitude: coords.longitude },
          });
        }
      } catch (err) {
        console.error('❌ Error restaurando estado de disponibilidad:', err);
      }
    };

    restoreAvailabilityState().finally(finalize);

    return () => {
      isActive = false;
    };
  }, [coords, markTaskCompleted, userId]);

  // Realtime: drivers_live/{uid}.status es la fuente de verdad.
  useEffect(() => {
    if (!userId) return;

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    let restoreDesignatedMode = true;
    (async () => {
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      unsubscribe = onSnapshot(doc(db, FS_COL.driversLive, userId), (snapshot) => {
        const revision = ++availabilityRevisionRef.current;
        const raw = snapshot.data()?.status;
        const status = typeof raw === 'string' ? raw.trim().toLowerCase() : 'offline';
        const online = status === 'online' || status === 'available' || status === 'on_ride' || status === 'busy';
        if (__DEV__) console.log('[DriverHome availability]', { status, online });

        setIsAvailable(online);
        if (!online) {
          setIsDesignatedDriverMode(false);
        }

        void (async () => {
          try {
            const saved = await driverAvailabilityService.getAvailabilityState();
            if (cancelled || revision !== availabilityRevisionRef.current) return;
            if (restoreDesignatedMode) {
              restoreDesignatedMode = false;
              if (online && saved?.isAvailable && saved.isDesignatedDriverMode) {
                setIsDesignatedDriverMode(true);
              }
            }
            if (Boolean(saved?.isAvailable) === online) return;
            await driverAvailabilityService.saveAvailabilityState({
              isAvailable: online,
              isDesignatedDriverMode: online ? Boolean(saved?.isDesignatedDriverMode) : false,
              lastUpdate: new Date().toISOString(),
              coords: saved?.coords,
            });
          } catch (err) {
            console.warn('⚠️ Error sincronizando disponibilidad:', err);
          }
        })();
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId]);

  // Init app state listener + heartbeat
  useEffect(() => {
    if (!coords) return;

    driverAvailabilityService.initAppStateListener(coords, (restoredState) => {
      if (!restoredState.isAvailable) {
        setIsAvailable(false);
        setIsDesignatedDriverMode(false);
      }
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
    const pendingCount = Number(rechargeFundsSummary.pendingRecharges ?? 0);

    if (hasInsufficientFunds) {
      if (!rechargeAlertShownRef.current) {
        rechargeAlertShownRef.current = true;
        alertService.showInfoAlert(
          tr(pendingCount > 0
            ? 'driver.home.alerts.rechargePendingTitle'
            : 'driver.home.alerts.rechargeRequiredTitle'),
          pendingCount > 0
            ? tr('driver.home.alerts.rechargePendingBody', {
                amount: Number(rechargeFundsSummary.pendingAmount ?? 0).toFixed(2),
                count: pendingCount,
              })
            : tr('driver.home.alerts.rechargeRequiredBody', {
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
      const pendingCount = Number(rechargeFundsSummary.pendingRecharges ?? 0);
      alertService.showInfoAlert(
        tr(pendingCount > 0
          ? 'driver.home.alerts.rechargePendingTitle'
          : 'driver.home.alerts.rechargeRequiredTitle'),
        pendingCount > 0
          ? tr('driver.home.alerts.rechargePendingBody', {
              amount: Number(rechargeFundsSummary.pendingAmount ?? 0).toFixed(2),
              count: pendingCount,
            })
          : tr('driver.home.alerts.rechargeRequiredBody', {
              amount: Number(rechargeFundsSummary.availableBalance).toFixed(2),
            }),
        () => navigation.navigate('RechargeFunds')
      );
      return;
    }

    if (nextValue === isAvailable) {
      return;
    }

    availabilityRevisionRef.current++;
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
          // Rechazo de activación: mostrar el motivo de compliance si vino.
          const reason = statusResult?.activation?.reasons?.find(
            (r) => r.blocking || r.status === 'fail',
          );
          alertService.showErrorAlert(
            reason?.message || tr('driver.home.alerts.availabilityUpdateFailed'),
          );
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
      availabilityRevisionRef.current++;
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
