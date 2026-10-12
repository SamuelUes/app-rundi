import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid } from 'react-native';

type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

let cachedStatus: NotificationPermissionStatus | null = null;
let requesting = false;

const isAndroidTiramisuOrHigher = (): boolean => {
  if (Platform.OS !== 'android') return false;
  const version = Platform.Version;
  const parsed = typeof version === 'number' ? version : parseInt(String(version), 10);
  return !Number.isNaN(parsed) && parsed >= 33;
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('rundi-default-v2', {
      name: 'Notificaciones',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'notification.wav',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (error) {
    console.warn('⚠️ [notificationPermission] No se pudo configurar canal Android:', error);
  }
};

export const requestNotificationsPermissionIfNeeded = async (): Promise<boolean> => {
  if (requesting) {
    return cachedStatus === 'granted';
  }

  requesting = true;
  try {
    if (cachedStatus === 'granted') {
      return true;
    }

    const entry = await Notifications.getPermissionsAsync();
    if (entry.granted || entry.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      cachedStatus = 'granted';
      await ensureAndroidChannel();
      return true;
    }

    if (Platform.OS === 'android' && isAndroidTiramisuOrHigher()) {
      const permissionId = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (!permissionId) {
        cachedStatus = 'granted';
        await ensureAndroidChannel();
        return true;
      }

      const alreadyGranted = await PermissionsAndroid.check(permissionId);
      if (alreadyGranted) {
        cachedStatus = 'granted';
        await ensureAndroidChannel();
        return true;
      }

      const status = await PermissionsAndroid.request(permissionId);
      cachedStatus = status === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
      if (cachedStatus === 'granted') {
        await ensureAndroidChannel();
      }
      return cachedStatus === 'granted';
    }

    const result = await Notifications.requestPermissionsAsync();
    if (result.granted || result.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      cachedStatus = 'granted';
      await ensureAndroidChannel();
      return true;
    }

    cachedStatus = 'denied';
    return false;
  } catch (error) {
    console.warn('⚠️ [notificationPermission] No se pudo solicitar permiso de notificaciones:', error);
    return false;
  } finally {
    requesting = false;
  }
};
