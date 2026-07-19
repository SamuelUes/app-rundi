import { sendNotificationToUser } from './pushNotifications';
import { PUSH_NOTIFICATIONS_ENABLED } from '../config/constants';
import { getNotificationForUser } from './notificationI18n';

interface NotifyUserSafeOptions {
  notificationKeyPrefix?: string;
  androidChannelId?: string;
  expiresInMs?: number;
  /** Clave de i18n para traducir título y cuerpo según idioma del usuario */
  i18nKey?: string;
}

export const notifyUserSafe = async (
  userId: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, string | number | boolean | null | undefined> = {},
  options: NotifyUserSafeOptions = {},
) => {
  if (!PUSH_NOTIFICATIONS_ENABLED) {
    return;
  }

  if (!userId) {
    return;
  }

  try {
    // Si se proporciona i18nKey, traducir título y cuerpo según idioma del usuario
    let finalTitle = title;
    let finalBody = body;
    if (options.i18nKey) {
      const translated = await getNotificationForUser(userId, options.i18nKey, title, body);
      finalTitle = translated.title;
      finalBody = translated.body;
    }

    const rideIdRaw = data?.rideId ?? data?.ride_id;
    const normalizedRideId = typeof rideIdRaw === 'string'
      ? rideIdRaw
      : typeof rideIdRaw === 'number' && Number.isFinite(rideIdRaw)
        ? String(rideIdRaw)
        : '';
    const explicitNotificationKey = typeof data?.notificationKey === 'string' && data.notificationKey.trim().length
      ? data.notificationKey.trim()
      : undefined;
    const prefix = options.notificationKeyPrefix ?? 'ride';
    const notificationKey = explicitNotificationKey || (normalizedRideId ? `${prefix}-${normalizedRideId}` : undefined);
    const expiresInMsRaw = data?.expiresInMs ?? data?.expires_in_ms;
    const parsedExpires = typeof expiresInMsRaw === 'number'
      ? expiresInMsRaw
      : typeof expiresInMsRaw === 'string'
        ? Number(expiresInMsRaw)
        : NaN;
    const expiresInMs = Number.isFinite(parsedExpires) && parsedExpires > 0
      ? parsedExpires
      : options.expiresInMs ?? 120_000;

    await sendNotificationToUser(userId, {
      title: finalTitle,
      body: finalBody,
      data: {
        ...data,
        rideId: normalizedRideId || undefined,
      },
      androidChannelId: options.androidChannelId,
      notificationKey,
      expiresInMs,
    });
  } catch (error) {
    console.error('❌ [notifyUserSafe] Error enviando notificación push:', {
      userId,
      title,
      error,
    });
  }
};
