import { firestore, messaging } from '../config/firebase';

const TOKENS_SUBCOLLECTION = 'fcmTokens';
const MAX_TOKENS_PER_BATCH = 500;
const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

type PushData = Record<string, string | number | boolean | null | undefined>;

interface PushMessage {
  title: string;
  body: string;
  data?: PushData;
  androidChannelId?: string;
  notificationKey?: string;
  expiresInMs?: number;
}

interface TokenEntry {
  token: string;
  userId: string;
}

const sanitizeData = (data: PushData = {}) => {
  const sanitized: Record<string, string> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    sanitized[key] = typeof value === 'string' ? value : String(value);
  });
  return sanitized;
};

const getAndroidChannelId = (message: PushMessage) => {
  return message.androidChannelId ?? 'default';
};

const chunkTokens = (tokens: TokenEntry[]) => {
  const chunks: TokenEntry[][] = [];
  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_BATCH) {
    chunks.push(tokens.slice(i, i + MAX_TOKENS_PER_BATCH));
  }
  return chunks;
};

const getUserTokens = async (userId: string): Promise<TokenEntry[]> => {
  const snapshot = await firestore
    .collection('users')
    .doc(userId)
    .collection(TOKENS_SUBCOLLECTION)
    .get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs
    .map((doc) => {
      const token = doc.id;
      const data = doc.data();

      if (!token || typeof token !== 'string') {
        return null;
      }

      return {
        token,
        userId,
        platform: data.platform as string | undefined,
      } as TokenEntry & { platform?: string };
    })
    .filter((entry): entry is TokenEntry => Boolean(entry?.token));
};

const deleteToken = async (userId: string, token: string) => {
  try {
    await firestore
      .collection('users')
      .doc(userId)
      .collection(TOKENS_SUBCOLLECTION)
      .doc(token)
      .delete();
  } catch (error) {
    console.warn('⚠️ [pushNotifications] Error eliminando token inválido:', error);
  }
};

const sendToTokens = async (tokens: TokenEntry[], message: PushMessage) => {
  const expiresInMsRaw = typeof message.expiresInMs === 'number' && Number.isFinite(message.expiresInMs)
    ? Math.max(1, Math.floor(message.expiresInMs))
    : 120_000;
  const expiresInSeconds = Math.max(1, Math.round(expiresInMsRaw / 1000));
  const sanitizedData = sanitizeData({
    ...message.data,
    ...(message.notificationKey ? { notificationKey: message.notificationKey } : {}),
    expiresInMs: String(expiresInMsRaw),
  });

  const payload = {
    notification: {
      title: message.title,
      body: message.body,
    },
    data: sanitizedData,
    android: {
      priority: 'high' as const,
      ttl: expiresInSeconds,
      notification: {
        channelId: getAndroidChannelId(message),
        ...(message.notificationKey ? { tag: message.notificationKey } : {}),
      },
    },
    apns: {
      headers: {
        'apns-expiration': String(Math.floor(Date.now() / 1000) + expiresInSeconds),
        ...(message.notificationKey ? { 'apns-collapse-id': message.notificationKey } : {}),
      },
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  };

  const chunks = chunkTokens(tokens);

  for (const chunk of chunks) {
    const tokenValues = chunk.map((entry) => entry.token);

    try {
      const response = await messaging.sendEachForMulticast({
        tokens: tokenValues,
        notification: payload.notification,
        data: payload.data,
        android: payload.android,
        apns: payload.apns,
      });

      response.responses.forEach((res, index) => {
        if (!res.success) {
          const errorCode = res.error?.code;
          const failedToken = chunk[index];

          console.warn('⚠️ [pushNotifications] Error enviando push:', {
            token: failedToken && failedToken.token ? `${failedToken.token.slice(0, 12)}...` : 'desconocido',
            code: errorCode,
            message: res.error?.message,
          });

          if (failedToken && errorCode && INVALID_TOKEN_CODES.has(errorCode)) {
            deleteToken(failedToken.userId, failedToken.token).catch(() => undefined);
          }
        }
      });
    } catch (error) {
      console.error('❌ [pushNotifications] Error enviando notificaciones:', error);
    }
  }
};

export const sendNotificationToUsers = async (
  userIds: string[],
  message: PushMessage,
) => {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueUserIds.length) {
    return;
  }

  try {
    const tokenEntries: TokenEntry[] = [];

    for (const userId of uniqueUserIds) {
      try {
        const tokens = await getUserTokens(userId);
        if (tokens.length) {
          tokenEntries.push(...tokens);
        } else {
          console.log(`ℹ️ [pushNotifications] Usuario ${userId} sin tokens FCM`);
        }
      } catch (error) {
        console.error(`❌ [pushNotifications] Error obteniendo tokens para ${userId}:`, error);
      }
    }

    if (!tokenEntries.length) {
      console.log('ℹ️ [pushNotifications] No hay tokens FCM para enviar la notificación');
      return;
    }

    console.log('📣 [pushNotifications] Enviando notificación', {
      title: message.title,
      body: message.body,
      users: uniqueUserIds.length,
      tokens: tokenEntries.length,
    });

    await sendToTokens(tokenEntries, message);
  } catch (error) {
    console.error('❌ [pushNotifications] Error general enviando notificaciones:', error);
  }
};

export const sendNotificationToUser = async (userId: string, message: PushMessage) => {
  await sendNotificationToUsers([userId], message);
};

export const sendNotificationToUserWithTokens = async (
  userId: string,
  tokens: string[],
  message: PushMessage,
) => {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!userId || !uniqueTokens.length) {
    return;
  }

  const tokenEntries: TokenEntry[] = uniqueTokens.map((token) => ({
    token,
    userId,
  }));

  await sendToTokens(tokenEntries, message);
};
