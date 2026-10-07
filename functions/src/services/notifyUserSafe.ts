import { sendToUser } from './notificationCenter';
import { PUSH_NOTIFICATIONS_ENABLED } from '../config/constants';
import { NotificationType } from './notificationCatalog';

interface NotifyUserSafeOptions {
  notificationKeyPrefix?: string;
  androidChannelId?: string;
  expiresInMs?: number;
  i18nKey?: string;
  type?: NotificationType;
}

export const notifyUserSafe = async (
  userId: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, string | number | boolean | null | undefined> = {},
  options: NotifyUserSafeOptions = {},
) => {
  if (!PUSH_NOTIFICATIONS_ENABLED || !userId) {
    return;
  }

  const type = options.type ?? 'general';
  await sendToUser(userId, type, {
    data,
    fallbackTitle: title,
    fallbackBody: body,
    expiresInMs: options.expiresInMs,
  });
};
