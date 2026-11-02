import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { initializeFirebase, getFirebaseFirestore } from '../../../config/firebase';
import { waitForFirebaseAuthUser } from '../../../utils/firebase/firebaseAuthReady';
import { FS_COL } from '../../../constants/firestore';
import i18n from '../../../i18n';
import { waitForI18nReady } from '../../../utils/system/i18nReady';
import { requestNotificationsPermissionIfNeeded } from '../../../utils/system/notificationPermission';
import type { PreflightRole } from '../../../types/preflight';
import type { PreflightAction } from '../../../stores/preflightStore';

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

const PROMPT_NOTIF_PREFIX = 'PROGRAMMED_PROMPT_NOTIF';
// Ventana de confirmación del scheduler v2 (programmed.ConfirmWindow=10m).
const CONFIRM_WINDOW_MS = 10 * 60 * 1000;

const isPermissionDenied = (error: any) => {
  const message = String(error?.message || error).toLowerCase();
  return error?.code === 'PERMISSION_DENIED' ||
    message.includes('permission_denied') ||
    message.includes('permission denied');
};

// En el emulador (y cuando el token FCM falla) los push no llegan: disparamos
// una notificación LOCAL inmediata cuando aparece un prompt con la app en
// background. En foreground el modal del overlay lo cubre.
const firePromptLocalNotification = async (prompt: ProgrammedRidePrompt) => {
  try {
    if (AppState.currentState === 'active') {
      return;
    }
    const storageKey = `${PROMPT_NOTIF_PREFIX}:${prompt.type}-${prompt.rideId}`;
    const seen = Number(await AsyncStorage.getItem(storageKey)) || 0;
    if (seen >= prompt.requestTimestamp) {
      return;
    }
    const granted = await requestNotificationsPermissionIfNeeded();
    if (!granted) {
      return;
    }
    await waitForI18nReady();
    const isDriver = prompt.type === 'driver';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t(
          isDriver
            ? 'shared.preflight.programmedRide.notifDriverTitle'
            : 'shared.preflight.programmedRide.notifClientTitle',
          { defaultValue: 'Confirma tu viaje programado' },
        ),
        body: i18n.t(
          isDriver
            ? 'shared.preflight.programmedRide.notifDriverBody'
            : 'shared.preflight.programmedRide.notifClientBody',
          {
            defaultValue: isDriver
              ? 'El cliente confirmó. Toca para reservar el viaje.'
              : 'Tu viaje está por comenzar. Toca para confirmar.',
          },
        ),
        data: { type: 'programmed_ride_prompt', rideId: prompt.rideId, role: prompt.type },
        sound: 'notification.wav',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' ? { channelId: 'rundi-default-v2' } : {}),
      },
      trigger: null,
    });
    await AsyncStorage.setItem(storageKey, String(prompt.requestTimestamp));
  } catch (error) {
    console.warn('[useProgrammedRidePrompt] Error notificación local:', error);
  }
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
    let appStateSubscription: { remove: () => void } | null = null;
    let readDenied = false;

    (async () => {
      try {
        const { app, auth } = await initializeFirebase();
        if (!app || !auth) {
          return;
        }
        const authUser = await waitForFirebaseAuthUser(userId);
        if (!isMounted || !authUser || authUser.uid !== userId || auth.currentUser?.uid !== userId) {
          return;
        }
        const isAuthCurrent = () => auth.currentUser?.uid === userId;
        const db = await getFirebaseFirestore();
        const ridesQuery = query(collection(db, FS_COL.programmed), where('clientId', '==', userId));

        const mapSnapshot = (snap: any) => {
          const value: Record<string, any> = {};
          snap.docs.forEach((d: any) => { value[d.id] = { id: d.id, ...d.data() }; });
          return value;
        };

        const syncSnapshot = async () => {
          if (!isMounted || readDenied) return;
          if (!isAuthCurrent()) {
            setClientRides(null);
            return;
          }
          try {
            const snapshot = await getDocs(ridesQuery);
            if (!isMounted) return;
            if (!isAuthCurrent()) {
              setClientRides(null);
              return;
            }
            setClientRides(mapSnapshot(snapshot));
          } catch (error) {
            if (!isMounted || readDenied) return;
            if (!isAuthCurrent()) {
              setClientRides(null);
              return;
            }
            if (isPermissionDenied(error)) {
              readDenied = true;
              appStateSubscription?.remove();
            }
            console.error('[useProgrammedRidePrompt] Error sync programmed rides (client)', error);
          }
        };

        unsubscribe = onSnapshot(
          ridesQuery,
          (snapshot) => {
            if (!isMounted) {
              return;
            }
            setClientRides(mapSnapshot(snapshot));
          },
          (error) => {
            if (!isMounted || readDenied) return;
            if (!isAuthCurrent()) {
              setClientRides(null);
              return;
            }
            if (isPermissionDenied(error)) {
              readDenied = true;
              appStateSubscription?.remove();
              setClientRides(null);
            }
            console.error('[useProgrammedRidePrompt] Error leyendo programmed rides (client)', error);
          },
        );

        await syncSnapshot();
        if (!isMounted || readDenied || !isAuthCurrent()) return;

        // Resync al volver a foreground como red de seguridad del listener.
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
    let appStateSubscription: { remove: () => void } | null = null;
    let readDenied = false;

    (async () => {
      try {
        const { app, auth } = await initializeFirebase();
        if (!app || !auth) {
          return;
        }
        const authUser = await waitForFirebaseAuthUser(userId);
        if (!isMounted || !authUser || authUser.uid !== userId || auth.currentUser?.uid !== userId) {
          return;
        }
        const isAuthCurrent = () => auth.currentUser?.uid === userId;
        const db = await getFirebaseFirestore();
        const ridesQuery = query(collection(db, FS_COL.programmed), where('driverId', '==', userId));

        const mapSnapshot = (snap: any) => {
          const value: Record<string, any> = {};
          snap.docs.forEach((d: any) => { value[d.id] = { id: d.id, ...d.data() }; });
          return value;
        };

        const syncSnapshot = async () => {
          if (!isMounted || readDenied) return;
          if (!isAuthCurrent()) {
            setDriverRides(null);
            return;
          }
          try {
            const snapshot = await getDocs(ridesQuery);
            if (!isMounted) return;
            if (!isAuthCurrent()) {
              setDriverRides(null);
              return;
            }
            setDriverRides(mapSnapshot(snapshot));
          } catch (error) {
            if (!isMounted || readDenied) return;
            if (!isAuthCurrent()) {
              setDriverRides(null);
              return;
            }
            if (isPermissionDenied(error)) {
              readDenied = true;
              appStateSubscription?.remove();
            }
            console.error('[useProgrammedRidePrompt] Error sync programmed rides (driver)', error);
          }
        };

        unsubscribe = onSnapshot(
          ridesQuery,
          (snapshot) => {
            if (!isMounted) {
              return;
            }
            setDriverRides(mapSnapshot(snapshot));
          },
          (error) => {
            if (!isMounted || readDenied) return;
            if (!isAuthCurrent()) {
              setDriverRides(null);
              return;
            }
            if (isPermissionDenied(error)) {
              readDenied = true;
              appStateSubscription?.remove();
              setDriverRides(null);
            }
            console.error('[useProgrammedRidePrompt] Error leyendo programmedRides (driver)', error);
          },
        );

        await syncSnapshot();
        if (!isMounted || readDenied || !isAuthCurrent()) return;

        // Resync al volver a foreground como red de seguridad del listener.
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
        // v2: sin clientConfirmationRequestedAt — la ventana es derivada
        // (scheduledAt - ConfirmWindow hasta promoción). Solo se muestra
        // el prompt dentro de la ventana de confirmación.
        if (ride?.clientConfirmed) {
          return null;
        }
        if (ride?.status !== 'scheduled') {
          return null;
        }
        if (typeof scheduledAt !== 'number') {
          return null;
        }
        const now = Date.now();
        if (now < scheduledAt - CONFIRM_WINDOW_MS) {
          return null;
        }
        const requestTimestamp = scheduledAt - CONFIRM_WINDOW_MS;
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

      // driver prompt — v2: el cliente ya confirmó y el driver no.
      if (!ride?.driverId) {
        return null;
      }
      if (!ride?.clientConfirmed) {
        return null;
      }
      if (ride?.status !== 'scheduled' && ride?.status !== 'client_confirmed') {
        return null;
      }
      if (ride?.driverConfirmed) {
        return null;
      }
      const requestTimestamp = scheduledAt ?? Date.now();
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

  // Backup local del push FCM: en emulador no hay service account y en prod
  // el token puede estar viejo. Solo en background — en foreground el modal
  // del overlay es la superficie de confirmación.
  useEffect(() => {
    if (!prompt) {
      return;
    }
    void firePromptLocalNotification(prompt);
  }, [prompt]);

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
    // El viaje aún vive en programmedRides hasta scheduledAt — ActiveRide se
    // alcanza vía activeRideGuard cuando el scheduler lo promueve.
    return {
      type: 'active_ride',
      title: t('shared.preflight.programmedRide.driverFollowUpTitle'),
      subtitle: scheduledAt ? new Date(scheduledAt).toLocaleString() : undefined,
      routeName: 'AvailableRides',
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
    // HomeOffers escucha la promoción y navega a RideTracking solo.
    routeName: 'HomeOffers',
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
