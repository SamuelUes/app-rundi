import { Platform, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import i18n from '../i18n';

let channelsConfigured = false;
let permissionsRequested = false;

const tr = (path: string) => i18n.t(`common.services.notificationService.${path}`) as string;

export const setupAndroidChannels = async (): Promise<void> => {
  if (Platform.OS !== 'android' || channelsConfigured) {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('rundi-default-v2', {
      name: tr('channels.default'),
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      sound: 'notification.wav',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      lightColor: '#FF9800',
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('rundi-active-ride-v2', {
      name: tr('channels.activeRide'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'notification.wav',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      enableLights: true,
      lightColor: '#D4AF37',
    });

    channelsConfigured = true;
    console.log('✅ [notificationSetup] Android channels configured');
  } catch (error) {
    console.warn('⚠️ [notificationSetup] Error setting up Android channels:', error);
  }
};

export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (permissionsRequested) {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  permissionsRequested = true;

  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('❌ [notificationSetup] Notification permission denied (Android)');
        return false;
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('⚠️ [notificationSetup] Notification permissions denied');
      return false;
    }

    console.log('✅ [notificationSetup] Notification permissions granted');
    return true;
  } catch (error) {
    console.error('❌ [notificationSetup] Error requesting permissions:', error);
    return false;
  }
};

export const initializeNotificationSetup = async (): Promise<boolean> => {
  await setupAndroidChannels();
  const granted = await requestNotificationPermissions();
  return granted;
};
