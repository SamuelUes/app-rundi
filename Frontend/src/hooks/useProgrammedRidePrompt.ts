import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { initializeFirebase } from '../config/firebase';
import type { PreflightRole } from '../types/preflight';
import type { PreflightAction } from '../state/preflightStore';

type PromptType = 'client' | 'driver';

export type ProgrammedRidePrompt = {
  rideId: string;
  type: PromptType;
  scheduledAt?: number | null;
  driverId?: string | null;
  driver?: any;
  clientId: string;
  data: any;
  requestTimestamp: number;
};

type UseProgrammedRidePromptParams = {
  userId?: string | null;
  listenForClient: boolean;
  listenForDriver: boolean;
};

type UseProgrammedRidePromptResult = {
  prompt: ProgrammedRidePrompt | null;
  snoozePrompt: (prompt: ProgrammedRidePrompt | null) => void;
  markHandled: (prompt: ProgrammedRidePrompt | null) => void;
};

export const useProgrammedRidePrompt = ({
  userId,
  listenForClient,
  listenForDriver,
}: UseProgrammedRidePromptParams): UseProgrammedRidePromptResult => {
  const [clientRides, setClientRides] = useState<Record<string, any> | null>(null);
  const [driverRides, setDriverRides] = useState<Record<string, any> | null>(null);
  const dismissedMapRef = useRef<Record<string, number>>({});
  const handledMapRef = useRef<Record<string, number>>({});
  const [revision, setRevision] = useState(0);

  const updateRevision = useCallback(() => {
    setRevision((rev) => rev + 1);
  }, []);

  const trackDismiss = useCallback(
    (key: string, timestamp: number) => {
      dismissedMapRef.current[key] = timestamp;
      updateRevision();
    },
    [updateRevision],
  );

  const trackHandled = useCallback(
    (key: string, timestamp: number) => {
      handledMapRef.current[key] = timestamp;
      updateRevision();
    },
    [updateRevision],
  );

  useEffect(() => {
    if (!userId || !listenForClient) {
      setClientRides(null);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;
    let fallbackSyncTimer: ReturnType<typeof setInterval> | null = null;
    let appStateSubscription: { remove: () => void } | null = null;

    (async () => {
      try {
        const { getDatabase, ref, query, orderByChild, equalTo, onValue, get } = await import('firebase/database');
        const { app } = await initializeFirebase();
        if (!app) {
          return;
        }
        const database = getDatabase(app);
        const ridesQuery = query(ref(database, 'programmedRides'), orderByChild('clientId'), equalTo(userId));

        const syncSnapshot = async () => {
          try {
            const snapshot = await get(ridesQuery);
            if (!isMounted) {
              return;
            }
            const value = snapshot.exists() ? snapshot.val() : null;
            setClientRides(value);
          } catch (error) {
            console.error('[useProgrammedRidePrompt] Error sync programmedRides (client)', error);
          }
        };

        unsubscribe = onValue(
          ridesQuery,
          (snapshot) => {
            if (!isMounted) {
              return;
            }
            const value = snapshot.exists() ? snapshot.val() : null;
            setClientRides(value);
          },
          (error) => {
            console.error('[useProgrammedRidePrompt] Error leyendo programmedRides (client)', error);
          },
        );

        await syncSnapshot();
        fallbackSyncTimer = setInterval(() => {
          void syncSnapshot();
        }, 45_000);

        appStateSubscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            void syncSnapshot();
          }
        });
      } catch (error) {
        console.error('[useProgrammedRidePrompt] No se pudo inicializar listener client:', error);
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
      if (fallbackSyncTimer) {
        clearInterval(fallbackSyncTimer);
      }
      appStateSubscription?.remove();
    };
  }, [userId, listenForClient]);

  useEffect(() => {
    if (!userId || !listenForDriver) {
      setDriverRides(null);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;
    let fallbackSyncTimer: ReturnType<typeof setInterval> | null = null;
    let appStateSubscription: { remove: () => void } | null = null;

    (async () => {
      try {
        const { getDatabase, ref, query, orderByChild, equalTo, onValue, get } = await import('firebase/database');
        const { app } = await initializeFirebase();
        if (!app) {
          return;
        }
        const database = getDatabase(app);
        const ridesQuery = query(ref(database, 'programmedRides'), orderByChild('driverId'), equalTo(userId));

        const syncSnapshot = async () => {
          try {
            const snapshot = await get(ridesQuery);
            if (!isMounted) {
              return;
            }
            const value = snapshot.exists() ? snapshot.val() : null;
            setDriverRides(value);
          } catch (error) {
            console.error('[useProgrammedRidePrompt] Error sync programmedRides (driver)', error);
          }
        };

        unsubscribe = onValue(
          ridesQuery,
          (snapshot) => {
            if (!isMounted) {
              return;
            }
            const value = snapshot.exists() ? snapshot.val() : null;
            setDriverRides(value);
          },
          (error) => {
            console.error('[useProgrammedRidePrompt] Error leyendo programmedRides (driver)', error);
          },
        );

        await syncSnapshot();
        fallbackSyncTimer = setInterval(() => {
          void syncSnapshot();
        }, 45_000);

        appStateSubscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            void syncSnapshot();
          }
        });
      } catch (error) {
        console.error('[useProgrammedRidePrompt] No se pudo inicializar listener driver:', error);
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
      if (fallbackSyncTimer) {
        clearInterval(fallbackSyncTimer);
      }
      appStateSubscription?.remove();
    };
  }, [userId, listenForDriver]);

  const shouldIgnoreRequest = useCallback((key: string, requestTimestamp: number) => {
    const dismissedAt = dismissedMapRef.current[key];
    if (dismissedAt && requestTimestamp <= dismissedAt) {
      return true;
    }
    const handledAt = handledMapRef.current[key];
    if (handledAt && requestTimestamp <= handledAt) {
      return true;
    }
    return false;
  }, []);

  const buildPrompt = useCallback(
    (rideId: string, ride: any, type: PromptType): ProgrammedRidePrompt | null => {
      if (!ride || ride.status === 'canceled') {
        return null;
      }

      const scheduledAt =
        typeof ride?.scheduledAt === 'number'
          ? ride.scheduledAt
          : typeof ride?.scheduledAt === 'string'
          ? Number(ride.scheduledAt)
          : null;

      if (type === 'client') {
        const requestTimestamp = Number(ride?.clientConfirmationRequestedAt) || 0;
        if (!requestTimestamp) {
          return null;
        }
        if (ride?.clientConfirmed || ride?.clientConfirmedAt) {
          return null;
        }
        const key = `client-${rideId}`;
        if (shouldIgnoreRequest(key, requestTimestamp)) {
          return null;
        }
        return {
          rideId,
          type: 'client',
          scheduledAt,
          driverId: ride?.driverId ?? null,
          driver: ride?.driver ?? null,
          clientId: ride?.clientId,
          data: ride,
          requestTimestamp,
        };
      }

      // driver prompt
      if (!ride?.driverId) {
        return null;
      }
      if (!(ride?.clientConfirmed || ride?.clientConfirmedAt)) {
        return null;
      }
      const requestTimestamp = Number(ride?.driverConfirmationRequestedAt) || 0;
      if (!requestTimestamp) {
        return null;
      }
      if (ride?.driverConfirmed || ride?.driverConfirmedAt) {
        return null;
      }
      const key = `driver-${rideId}`;
      if (shouldIgnoreRequest(key, requestTimestamp)) {
        return null;
      }

      return {
        rideId,
        type: 'driver',
        scheduledAt,
        driverId: ride?.driverId ?? null,
        driver: ride?.driver ?? null,
        clientId: ride?.clientId,
        data: ride,
        requestTimestamp,
      };
    },
    [shouldIgnoreRequest],
  );

  const selectCandidate = useCallback(
    (records: Record<string, any> | null, type: PromptType) => {
      if (!records) {
        return null;
      }
      const candidates: ProgrammedRidePrompt[] = [];
      for (const [rideId, ride] of Object.entries(records)) {
        const promptCandidate = buildPrompt(rideId, ride, type);
        if (promptCandidate) {
          candidates.push(promptCandidate);
        }
      }
      if (!candidates.length) {
        return null;
      }
      candidates.sort((a, b) => {
        const aTime = a.scheduledAt ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.scheduledAt ?? Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) {
          return aTime - bTime;
        }
        return a.requestTimestamp - b.requestTimestamp;
      });
      return candidates[0];
    },
    [buildPrompt],
  );

  const clientCandidate = useMemo(
    () => selectCandidate(clientRides, 'client'),
    [clientRides, selectCandidate, revision],
  );
  const driverCandidate = useMemo(
    () => selectCandidate(driverRides, 'driver'),
    [driverRides, selectCandidate, revision],
  );

  const prompt = useMemo(() => {
    if (clientCandidate) {
      return clientCandidate;
    }
    if (driverCandidate) {
      return driverCandidate;
    }
    return null;
  }, [clientCandidate, driverCandidate]);

  const snoozePrompt = useCallback(
    (candidate: ProgrammedRidePrompt | null) => {
      if (!candidate) {
        return;
      }
      const key = `${candidate.type}-${candidate.rideId}`;
      trackDismiss(key, candidate.requestTimestamp || Date.now());
    },
    [trackDismiss],
  );

  const markHandled = useCallback(
    (candidate: ProgrammedRidePrompt | null) => {
      if (!candidate) {
        return;
      }
      const key = `${candidate.type}-${candidate.rideId}`;
      trackHandled(key, candidate.requestTimestamp || Date.now());
    },
    [trackHandled],
  );

  return {
    prompt,
    snoozePrompt,
    markHandled,
  };
};

export const buildActiveRideAction = (
  role: PreflightRole,
  options: {
    rideId: string;
    hasDriverAssigned: boolean;
    driverName?: string;
    driverId?: string | null;
    vehiclePlate?: string | null;
    scheduledAt?: number | null;
  },
  t: (key: string, opts?: Record<string, any>) => string,
): PreflightAction => {
  const { rideId, hasDriverAssigned, driverName, driverId, vehiclePlate, scheduledAt } = options;
  if (role === 'driver') {
    return {
      type: 'active_ride',
      title: t('shared.preflight.programmedRide.driverFollowUpTitle'),
      subtitle: scheduledAt ? new Date(scheduledAt).toLocaleString() : undefined,
      routeName: 'ActiveRide',
      routeParams: {
        rideId,
      },
      metadata: {
        rideId,
        driverId,
      },
    };
  }

  return {
    type: 'active_ride',
    title: hasDriverAssigned
      ? t('shared.preflight.programmedRide.followUpTitleDriverAssigned')
      : t('shared.preflight.programmedRide.followUpTitleAwaitingDriver'),
    subtitle: scheduledAt ? new Date(scheduledAt).toLocaleString() : undefined,
    routeName: hasDriverAssigned ? 'RideTracking' : 'HomeOffers',
    routeParams: {
      rideId,
      driverId: driverId ?? undefined,
      driverName,
      vehiclePlate: vehiclePlate ?? undefined,
    },
    metadata: {
      rideId,
      driverId,
    },
  };
};
