import { sendNotificationToUsers, sendNotificationToUser, sendToTopic } from './pushNotifications';
import { PUSH_NOTIFICATIONS_ENABLED } from '../config/constants';
import { getUserLanguage, getTranslatedNotification, NotificationLanguage } from './notificationI18n';
import {
  getCatalogEntry,
  getLiveRideI18nKey,
  NotificationType,
  LiveRideStatus,
} from './notificationCatalog';

type PushData = Record<string, string | number | boolean | null | undefined>;

interface SendToUserOptions {
  data?: PushData;
  fallbackTitle?: string;
  fallbackBody?: string;
  expiresInMs?: number;
  notificationKey?: string;
}

export const sendToUser = async (
  userId: string | null | undefined,
  type: NotificationType,
  options: SendToUserOptions = {},
): Promise<void> => {
  if (!PUSH_NOTIFICATIONS_ENABLED || !userId) {
    return;
  }

  const entry = getCatalogEntry(type);
  if (!entry) {
    console.warn(`⚠️ [notificationCenter] Tipo de notificación desconocido: ${type}`);
    return;
  }

  try {
    let title = options.fallbackTitle ?? '';
    let body = options.fallbackBody ?? '';

    if (entry.i18nKey) {
      const lang = await getUserLanguage(userId);
      const translated = getTranslatedNotification(entry.i18nKey, lang, title, body);
      title = translated.title;
      body = translated.body;
    }

    const rideIdRaw = options.data?.rideId ?? options.data?.ride_id;
    const normalizedRideId = typeof rideIdRaw === 'string'
      ? rideIdRaw
      : typeof rideIdRaw === 'number' && Number.isFinite(rideIdRaw)
        ? String(rideIdRaw)
        : '';
    const explicitKey = typeof options.notificationKey === 'string' && options.notificationKey.trim().length
      ? options.notificationKey.trim()
      : undefined;
    const prefix = entry.notificationKeyPrefix ?? 'notif';
    const notificationKey = explicitKey || (normalizedRideId ? `${prefix}-${normalizedRideId}` : undefined);

    await sendNotificationToUser(userId, {
      title,
      body,
      data: {
        ...options.data,
        type,
        rideId: normalizedRideId || undefined,
      },
      androidChannelId: entry.androidChannelId,
      notificationKey,
      expiresInMs: options.expiresInMs ?? entry.ttlMs,
    });
  } catch (error) {
    console.error('❌ [notificationCenter] Error enviando notificación:', { userId, type, error });
  }
};

interface SendToUsersOptions {
  data?: PushData;
  fallbackTitle?: string;
  fallbackBody?: string;
  expiresInMs?: number;
  notificationKey?: string;
}

export const sendToUsers = async (
  userIds: string[],
  type: NotificationType,
  options: SendToUsersOptions = {},
): Promise<void> => {
  if (!PUSH_NOTIFICATIONS_ENABLED || !userIds.length) {
    return;
  }

  const entry = getCatalogEntry(type);
  if (!entry) {
    console.warn(`⚠️ [notificationCenter] Tipo de notificación desconocido: ${type}`);
    return;
  }

  try {
    let title = options.fallbackTitle ?? '';
    let body = options.fallbackBody ?? '';

    if (entry.i18nKey) {
      const lang = await getUserLanguage(userIds[0]);
      const translated = getTranslatedNotification(entry.i18nKey, lang, title, body);
      title = translated.title;
      body = translated.body;
    }

    const rideIdRaw = options.data?.rideId ?? options.data?.ride_id;
    const normalizedRideId = typeof rideIdRaw === 'string'
      ? rideIdRaw
      : typeof rideIdRaw === 'number' && Number.isFinite(rideIdRaw)
        ? String(rideIdRaw)
        : '';
    const explicitKey = typeof options.notificationKey === 'string' && options.notificationKey.trim().length
      ? options.notificationKey.trim()
      : undefined;
    const prefix = entry.notificationKeyPrefix ?? 'notif';
    const notificationKey = explicitKey || (normalizedRideId ? `${prefix}-${normalizedRideId}` : undefined);

    await sendNotificationToUsers(userIds, {
      title,
      body,
      data: {
        ...options.data,
        type,
        rideId: normalizedRideId || undefined,
      },
      androidChannelId: entry.androidChannelId,
      notificationKey,
      expiresInMs: options.expiresInMs ?? entry.ttlMs,
    });
  } catch (error) {
    console.error('❌ [notificationCenter] Error enviando notificación a múltiples usuarios:', { type, error });
  }
};

interface LiveRideParams {
  userId: string | null | undefined;
  rideId: string;
  status: LiveRideStatus;
  driverName?: string | null;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  expiresInMs?: number;
}

export const sendLiveRideUpdate = async (params: LiveRideParams): Promise<void> => {
  if (!PUSH_NOTIFICATIONS_ENABLED || !params.userId || !params.rideId) {
    return;
  }

  const entry = getCatalogEntry('ride_live_update');
  if (!entry) {
    return;
  }

  const i18nKey = getLiveRideI18nKey(params.status);
  if (!i18nKey) {
    console.warn(`⚠️ [notificationCenter] Live ride status desconocido: ${params.status}`);
    return;
  }

  try {
    const lang = await getUserLanguage(params.userId);
    const translated = getTranslatedNotification(i18nKey, lang, '', '');

    const formatValue = (value?: number | null, unit?: string) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      return unit ? `${value}${unit}` : String(value);
    };

    const etaText = formatValue(
      typeof params.etaMinutes === 'number' ? Math.max(1, Math.round(params.etaMinutes)) : undefined,
      ' min',
    );
    const distanceText = formatValue(
      typeof params.distanceKm === 'number' ? Number(params.distanceKm.toFixed(1)) : undefined,
      ' km',
    );
    const driverName = (params.driverName || '').trim();
    const bodyParts = [translated.body];

    if (driverName) {
      bodyParts.unshift(driverName);
    }
    if (etaText || distanceText) {
      bodyParts.push(
        [etaText ? `ETA ${etaText}` : null, distanceText ? distanceText : null]
          .filter(Boolean)
          .join(' • '),
      );
    }

    await sendNotificationToUser(params.userId, {
      title: translated.title,
      body: bodyParts.filter(Boolean).join('\n'),
      data: {
        type: 'ride_live_update',
        rideId: params.rideId,
        status: params.status,
        driverName,
        fallbackEtaMinutes: etaText ? etaText.replace(' min', '') : undefined,
        fallbackDistanceKm: distanceText ? distanceText.replace(' km', '') : undefined,
      },
      androidChannelId: entry.androidChannelId,
      notificationKey: `live-ride-${params.rideId}`,
      expiresInMs: params.expiresInMs ?? entry.ttlMs,
    });
  } catch (error) {
    console.error('❌ [notificationCenter] Error enviando live ride update:', { params, error });
  }
};

type NotificationSegment = 'all' | 'clients' | 'drivers' | 'users';

interface SendToSegmentOptions {
  segment: NotificationSegment;
  userIds?: string[];
  title: string | { es: string; en: string };
  body: string | { es: string; en: string };
  data?: PushData;
  category?: string;
}

export const sendToSegment = async (options: SendToSegmentOptions): Promise<number> => {
  if (!PUSH_NOTIFICATIONS_ENABLED) {
    return 0;
  }

  const { segment, userIds, title, body, data, category } = options;

  if (segment === 'users') {
    if (!userIds?.length) {
      return 0;
    }
    const resolveText = (text: string | { es: string; en: string }, lang: NotificationLanguage) =>
      typeof text === 'string' ? text : text[lang] ?? text.es;

    for (const uid of userIds) {
      try {
        const lang = await getUserLanguage(uid);
        await sendNotificationToUser(uid, {
          title: resolveText(title, lang),
          body: resolveText(body, lang),
          data: {
            ...data,
            type: 'admin_notice',
            category: category ?? 'notice',
          },
          androidChannelId: 'rundi-default-v2',
          notificationKey: `admin-${uid}-${Date.now()}`,
          expiresInMs: 24 * 60 * 60 * 1000,
        });
      } catch (error) {
        console.error(`❌ [notificationCenter] Error enviando admin notice a ${uid}:`, error);
      }
    }
    return userIds.length;
  }

  const topicMap: Record<string, string> = {
    all: 'all',
    clients: 'clients',
    drivers: 'drivers',
  };
  const topic = topicMap[segment];
  if (!topic) {
    return 0;
  }

  const resolveText = (text: string | { es: string; en: string }) =>
    typeof text === 'string' ? text : text.es;

  try {
    await sendToTopic(topic, {
      title: resolveText(title),
      body: resolveText(body),
      data: {
        ...data,
        type: 'admin_notice',
        category: category ?? 'notice',
      },
      androidChannelId: 'rundi-default-v2',
      notificationKey: `admin-${topic}-${Date.now()}`,
      expiresInMs: 24 * 60 * 60 * 1000,
    });
    return 1;
  } catch (error) {
    console.error('❌ [notificationCenter] Error enviando a segmento:', { segment, error });
    return 0;
  }
};
