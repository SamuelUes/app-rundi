import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { initializeFirebase, getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import i18n from '../../../i18n';
import { isSameDay } from '../../../utils/format/schedule';
import { requestNotificationsPermissionIfNeeded } from '../../../utils/system/notificationPermission';
import { waitForI18nReady } from '../../../utils/system/i18nReady';

// A partir de aquí el botón de Home cambia a "viaje programado" y se permite
// confirmar + navegar a ofertas.
export const PROGRAMMED_RIDE_IMMINENT_MS = 30 * 60 * 1000;
// El backend promueve el viaje a activeRides en scheduledAt; damos una gracia
// para que no parpadee el estado justo en el cruce.
const PROMOTION_GRACE_MS = 5 * 60 * 1000;
const TICK_MS = 20 * 1000;
const REMINDER_STORAGE_KEY = 'SCHEDULED_RIDE_REMINDER';

export type UpcomingProgrammedRide = {
  rideId: string;
  scheduledAt: number;
  msUntil: number;
  status: string;
  driverId: string | null;
  driver: any;
  clientConfirmed: boolean;
  origin?: any;
  destination?: any;
  isImminent: boolean;
  isToday: boolean;
  data: any;
};

type ReminderRecord = {
  rideId: string;
  scheduledAt: number;
  notificationId: string;
};

const getAsyncStorage = async () =>
  (await import('@react-native-async-storage/async-storage')).default;

const loadReminderRecord = async (): Promise<ReminderRecord | null> => {
  try {
    const AsyncStorage = await getAsyncStorage();
    const raw = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.rideId || !parsed?.notificationId) return null;
    return parsed;
  } catch {
    return null;
  }
};

const clearReminderRecord = async () => {
  try {
    const AsyncStorage = await getAsyncStorage();
    const record = await loadReminderRecord();
    if (record?.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(record.notificationId).catch(() => undefined);
    }
    await AsyncStorage.removeItem(REMINDER_STORAGE_KEY);
  } catch {
    // noop
  }
};

const scheduleReminder = async (rideId: string, scheduledAt: number) => {
  const triggerMs = scheduledAt - PROGRAMMED_RIDE_IMMINENT_MS;
  if (triggerMs <= Date.now() + 5000) return;

  const existing = await loadReminderRecord();
  if (existing?.rideId === rideId && existing?.scheduledAt === scheduledAt) {
    // Self-heal: si la notificación agendada quedó con la clave i18n cruda
    // (programada antes de que i18n inicializara), la reprogramamos.
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const found = scheduled.find((n) => n.identifier === existing.notificationId);
      const title = String(found?.content?.title ?? '');
      if (found && !title.includes('scheduledRide')) {
        return;
      }
    } catch {
      return;
    }
  }
  if (existing?.notificationId) {
    await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => undefined);
  }

  const granted = await requestNotificationsPermissionIfNeeded();
  if (!granted) return;

  await waitForI18nReady();
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('client.home.scheduledRide.reminderTitle', {
        defaultValue: 'Tu viaje programado está por iniciar',
      }),
      body: i18n.t('client.home.scheduledRide.reminderBody', {
        defaultValue: 'Tu viaje es en 30 minutos. Ábrelo para confirmarlo.',
      }),
      data: { type: 'programmed_ride_reminder', rideId },
      sound: 'notification.wav',
      priority: Notifications.AndroidNotificationPriority.HIGH,
      ...(Platform.OS === 'android' ? { channelId: 'rundi-default-v2' } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerMs),
    },
  });

  const AsyncStorage = await getAsyncStorage();
  await AsyncStorage.setItem(
    REMINDER_STORAGE_KEY,
    JSON.stringify({ rideId, scheduledAt, notificationId }),
  );
};

export function useUpcomingProgrammedRide(
  userId: string | undefined,
): UpcomingProgrammedRide | null {
  const [clientRides, setClientRides] = useState<Record<string, any> | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!userId) {
      setClientRides(null);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;
    let appStateSubscription: { remove: () => void } | null = null;

    (async () => {
      try {
        const { collection, query, where, onSnapshot } = await import('firebase/firestore');
        const { app } = await initializeFirebase();
        if (!app) return;
        const database = await getFirebaseFirestore();
        const ridesQuery = query(
          collection(database, FS_COL.programmed),
          where('clientId', '==', userId),
        );

        // El listener entrega el snapshot inicial y resincroniza tras
        // reconexiones — sin getDocs duplicado (antes había uno inicial y
        // otro por cada regreso a foreground).
        unsubscribe = onSnapshot(
          ridesQuery,
          (snapshot) => {
            if (!isMounted) return;
            const value: Record<string, any> = {};
            snapshot.docs.forEach((d: any) => { value[d.id] = { id: d.id, ...d.data() }; });
            setClientRides(value);
          },
          (error) => {
            console.error('[useUpcomingProgrammedRide] Error leyendo programmed rides', error);
          },
        );

        appStateSubscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            setNowTick(Date.now());
          }
        });
      } catch (error) {
        console.error('[useUpcomingProgrammedRide] No se pudo inicializar listener:', error);
      }
    })();

    return () => {
      isMounted = false;
      unsubscribe?.();
      appStateSubscription?.remove();
    };
  }, [userId]);

  // Tick para que el paso de "mismo día" → "inminente" ocurra sin interacción.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const upcomingRide = useMemo<UpcomingProgrammedRide | null>(() => {
    if (!clientRides) return null;

    const now = nowTick;
    let best: { rideId: string; ride: any; scheduledAt: number } | null = null;

    for (const [rideId, ride] of Object.entries(clientRides)) {
      if (!ride) continue;
      const statusRaw = typeof ride.status === 'string' ? ride.status.trim().toLowerCase() : '';
      if (statusRaw === 'canceled' || statusRaw === 'cancelled') continue;
      const scheduledAt =
        typeof ride.scheduledAt === 'number' ? ride.scheduledAt : Number(ride.scheduledAt);
      if (!Number.isFinite(scheduledAt) || scheduledAt <= 0) continue;
      if (scheduledAt + PROMOTION_GRACE_MS < now) continue;
      if (!best || scheduledAt < best.scheduledAt) {
        best = { rideId, ride, scheduledAt };
      }
    }

    if (!best) return null;

    const msUntil = best.scheduledAt - now;
    return {
      rideId: best.rideId,
      scheduledAt: best.scheduledAt,
      msUntil,
      status: best.ride.status ?? 'scheduled',
      driverId: best.ride.driverId ?? null,
      driver: best.ride.driver ?? null,
      clientConfirmed: Boolean(best.ride.clientConfirmed || best.ride.clientConfirmedAt),
      origin: best.ride.origin,
      destination: best.ride.destination,
      isImminent: msUntil <= PROGRAMMED_RIDE_IMMINENT_MS,
      isToday: isSameDay(new Date(now), new Date(best.scheduledAt)),
      data: best.ride,
    };
  }, [clientRides, nowTick]);

  // Recordatorio local a T-30min. Se cancela si el viaje desaparece, se cancela
  // o ya entró en la ventana inminente (el botón ya lo refleja).
  const reminderKeyRef = useRef<string>('');
  useEffect(() => {
    const key = upcomingRide ? `${upcomingRide.rideId}:${upcomingRide.scheduledAt}` : '';
    if (key === reminderKeyRef.current) return;
    reminderKeyRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        if (upcomingRide && !upcomingRide.isImminent) {
          await scheduleReminder(upcomingRide.rideId, upcomingRide.scheduledAt);
        } else {
          const stored = await loadReminderRecord();
          if (stored && (!upcomingRide || stored.rideId === upcomingRide.rideId)) {
            await clearReminderRecord();
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[useUpcomingProgrammedRide] Error con recordatorio local:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [upcomingRide]);

  return upcomingRide;
}
