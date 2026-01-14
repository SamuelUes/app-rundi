/**
 * Servicio de Notificaciones Push usando Firebase Cloud Messaging (FCM)
 * Alternativa más confiable a WebSocket para notificaciones en tiempo real
 * 
 * NOTA: FCM requiere Development Build, no funciona en Expo Go
 * Para Expo Go, usar Expo Notifications como fallback
 */

import { Platform, Alert, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import auth from '@react-native-firebase/auth';
import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import notificationService from './notificationService';
import i18n from '../i18n';

// Importar FCM solo si está disponible (Development Build)
let messagingModule: any = null;
let messagingInstance: any = null;
let AuthorizationStatusEnum: any = null;
let backgroundHandlersRegistered = false;

type NotificationCopy = {
  title: string;
  body: string;
};

const getFCMNotificationCopy = (type?: string | null): NotificationCopy => {
  const normalized = (type || '').toLowerCase();

  if (normalized === 'ride_requested') {
    return {
      title: i18n.t('common.services.fcm.rideRequested.title'),
      body: i18n.t('common.services.fcm.rideRequested.body'),
    };
  }

  if (normalized === 'proximity_ride') {
    return {
      title: i18n.t('common.services.fcm.proximityRide.title'),
      body: i18n.t('common.services.fcm.proximityRide.body'),
    };
  }

  return {
    title: i18n.t('common.services.fcm.fallback.title'),
    body: i18n.t('common.services.fcm.fallback.body'),
  };
};

const getGenericNotificationCopy = (): NotificationCopy => ({
  title: i18n.t('shared.notifications.generic.defaultTitle'),
  body: i18n.t('shared.notifications.generic.defaultBody'),
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let availabilityState: 'available' | 'unavailable' | null = null;

const logAvailability = (state: 'available' | 'unavailable') => {
  if (availabilityState === state) {
    return;
  }
  availabilityState = state;
  if (state === 'available') {
    console.log('✅ FCM disponible - usando Firebase Cloud Messaging');
  } else {
    console.log('⚠️ FCM no disponible - usando Expo Notifications como fallback');
  }
};

const handleBackgroundRemoteMessage = async (remoteMessage: any) => {
  try {
    console.log('📥 Notificación gestionada en background:', {
      id: remoteMessage?.messageId,
      data: remoteMessage?.data,
    });

    const { notification, data } = remoteMessage;

    if (notification?.title || notification?.body) {
      console.log('ℹ️ Notificación ya manejada por FCM (con payload visual), se omite réplica local');
      return;
    }

    const copy = getFCMNotificationCopy(data?.type);

    try {
      console.log('🔔 Mostrando notificación local en background (data-only):', {
        copy,
        data,
      });

              // Usar directamente Expo Notifications en background
      await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          data: data || {},
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 250, 250, 250],
        },
        trigger: null, // Mostrar inmediatamente
      });

      console.log('✅ Notificación local mostrada en background');
    } catch (notifError) {
      console.error('❌ Error mostrando notificación local en background:', notifError);
    }
  } catch (logError) {
    console.warn('⚠️ Error en background message handler:', logError);
  }
};

async function registerBackgroundHandlers(module: any) {
  if (backgroundHandlersRegistered || !module?.setBackgroundMessageHandler || !messagingInstance) {
    return;
  }

  try {
    module.setBackgroundMessageHandler(messagingInstance, handleBackgroundRemoteMessage);
    backgroundHandlersRegistered = true;
  } catch (handlerError) {
    try {
      module.setBackgroundMessageHandler(handleBackgroundRemoteMessage);
      backgroundHandlersRegistered = true;
    } catch (fallbackError) {
      console.warn('⚠️ No se pudo registrar handler de mensajes en background:', fallbackError ?? handlerError);
    }
  }
}

// React Native Firebase está disponible con google-services.json configurado
const isNativeFirebaseSupported = (): boolean => true;

const loadNativeFirebaseMessaging = async (): Promise<any> => {
  return { getMessaging: () => messaging(), AuthorizationStatus: messaging.AuthorizationStatus };
};

const initializeMessagingModule = async (): Promise<boolean> => {
  if (messagingModule && messagingInstance) {
    return true;
  }

  try {
    // React Native Firebase se inicializa automáticamente con google-services.json
    // Solo necesitamos obtener la instancia
    const instance = messaging();
    
    if (!instance) {
      console.warn('⚠️ No se pudo obtener una instancia de Firebase Messaging.');
      logAvailability('unavailable');
      return false;
    }

    messagingModule = {
      AuthorizationStatus: messaging.AuthorizationStatus,
      requestPermission: async (currentInstance: any) => currentInstance.requestPermission(),
      hasPermission: async (currentInstance: any) => {
        if (typeof currentInstance?.hasPermission === 'function') {
          return currentInstance.hasPermission();
        }
        return 0;
      },
      getToken: async (currentInstance: any) => currentInstance.getToken(),
      onMessage: (currentInstance: any, handler: any) => currentInstance.onMessage(handler),
      onNotificationOpenedApp: (currentInstance: any, handler: any) =>
        currentInstance.onNotificationOpenedApp(handler),
      getInitialNotification: (currentInstance: any) => currentInstance.getInitialNotification(),
      setBackgroundMessageHandler: (arg1: any, arg2?: any) => {
        const handler = typeof arg1 === 'function' ? arg1 : arg2;
        if (typeof handler === 'function') {
          messaging().setBackgroundMessageHandler(handler);
        }
      },
    };
    messagingInstance = instance;
    AuthorizationStatusEnum = messaging.AuthorizationStatus;

    await registerBackgroundHandlers(messagingModule);
    logAvailability('available');
    return true;
  } catch (error) {
    console.error('❌ Error inicializando React Native Firebase Messaging:', error);
    logAvailability('unavailable');
    return false;
  }
};

class FCMService {
  private fcmToken: string | null = null;
  private functions: any = null;
  private isFCMAvailable: boolean = true; // React Native Firebase configurado
  private recentForegroundMessageIds: Set<string> = new Set();
  private listenersConfigured = false;
  private onMessageUnsubscribe: (() => void) | null = null;
  private onNotificationOpenedUnsubscribe: (() => void) | null = null;
  private messagingInitPromise: Promise<boolean> | null = null;

  constructor() {
    this.ensureAndroidChannel();
  }

  private async ensureAndroidChannel() {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      await Notifications.setNotificationChannelAsync('rundi_default', {
        name: 'Notificaciones de viajes',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    } catch (error) {
      console.warn('⚠️ Error asegurando canal de notificaciones:', error);
    }
  }

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  private async getAuth() {
    return auth();
  }

  /**
   * Verificar si FCM está disponible
   */
  isFCMSupported(): boolean {
    return this.isFCMAvailable;
  }

  /**
   * Solicitar permisos de notificación
   */
  async requestPermission(): Promise<boolean> {
    try {
      // Si fcm no esta disponible, retornar false
      const ready = await this.ensureMessagingReady();
      if (!ready) {
        console.log('⚠️ FCM no disponible, no se pueden solicitar permisos');
        return false;
      }

      // Para Android
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('❌ Permiso de notificaciones denegado');
          return false;
        }
      }

      // Para iOS
      if (Platform.OS === 'ios' && messagingModule?.requestPermission) {
        const authStatus = await messagingModule.requestPermission(messagingInstance);
        const enabled =
          authStatus === AuthorizationStatusEnum?.AUTHORIZED ||
          authStatus === AuthorizationStatusEnum?.PROVISIONAL;

        if (!enabled) {
          console.log('❌ Permiso de notificaciones denegado');
          return false;
        }
      }

      console.log('✅ Permisos de notificación concedidos');
      return true;
    } catch (error) {
      console.error('❌ Error solicitando permisos:', error);
      return false;
    }
  }

  /**
   * Obtener token FCM del dispositivo
   */
  async getToken(): Promise<string | null> {
    try {
      // Si fcm no esta disponible, retornar null
      const ready = await this.ensureMessagingReady();
      if (!ready) {
        console.log('⚠️ FCM no disponible, no se puede obtener token');
        return null;
      }

      const fcmToken = await messagingModule.getToken(messagingInstance);

      if (fcmToken) {
        console.log('✅ Token FCM obtenido:', fcmToken.substring(0, 20) + '...');
        this.fcmToken = fcmToken;

        // Guardar token en AsyncStorage
        await AsyncStorage.setItem('fcmToken', fcmToken);

        return fcmToken;
      }

      return null;
    } catch (error) {
      console.error('❌ Error obteniendo token FCM:', error);
      return null;
    }
  }

  /**
   * Registrar token FCM en el backend
   */
  async registerToken(): Promise<void> {
    try {
      const auth = await this.getAuth();
      const user = auth.currentUser;
      if (!user) {
        console.log('⚠️ Usuario no autenticado, saltando registro de token');
        return;
      }

      const token = await this.getToken();
      if (!token) {
        console.log('⚠️ No hay token FCM disponible');
        return;
      }

      const functions = await this.getFunctions();
      const registerTokenFunction = httpsCallable(functions, 'registerFCMToken');
      await registerTokenFunction({
        fcmToken: token,
        platform: Platform.OS,
      });

      console.log('✅ Token FCM registrado en backend');
    } catch (error) {
      console.error('❌ Error registrando token FCM:', error);
    }
  }

  /**
   * Configurar listeners de notificaciones
   */
  async setupNotificationListeners(): Promise<void> {
    const ready = await this.ensureMessagingReady();
    if (!ready || !messagingModule || !messagingInstance) {
      console.log('⚠️ FCM no disponible, saltando configuración de listeners');
      return;
    }

    if (this.listenersConfigured) {
      console.log('ℹ️ Listeners de notificaciones ya estaban configurados, se omite nueva suscripción');
      return;
    }

    // Listener para notificaciones en foreground
    this.onMessageUnsubscribe = messagingModule.onMessage(
      messagingInstance,
      async (remoteMessage: any) => {
        this.handleForegroundNotification(remoteMessage);
      }
    );

    // Listener para cuando se toca una notificación (app en background)
    this.onNotificationOpenedUnsubscribe = messagingModule.onNotificationOpenedApp(
      messagingInstance,
      (remoteMessage: any) => {
        console.log('👆 Notificación tocada (app en background):', remoteMessage);
        this.handleNotificationTap(remoteMessage);
      }
    );

    // Listener para cuando se abre la app desde una notificación (app cerrada)
    messagingModule
      .getInitialNotification(messagingInstance)
      .then((remoteMessage: any) => {
        if (remoteMessage) {
          console.log('🚀 App abierta desde notificación:', remoteMessage);
          this.handleNotificationTap(remoteMessage);
        }
      });

    this.listenersConfigured = true;
    console.log('✅ Listeners de notificaciones configurados');
  }

  teardownNotificationListeners(): void {
    try {
      this.onMessageUnsubscribe?.();
    } catch (error) {
      console.warn('⚠️ Error eliminando listener onMessage:', error);
    } finally {
      this.onMessageUnsubscribe = null;
    }

    try {
      this.onNotificationOpenedUnsubscribe?.();
    } catch (error) {
      console.warn('⚠️ Error eliminando listener onNotificationOpenedApp:', error);
    } finally {
      this.onNotificationOpenedUnsubscribe = null;
    }

    this.listenersConfigured = false;
    this.recentForegroundMessageIds.clear();
  }

  /**
   * Manejar notificación en foreground
   */
  private handleForegroundNotification(remoteMessage: any): void {
    const { notification, data } = remoteMessage;
    const uniqueId =
      remoteMessage?.messageId ??
      `${data?.type ?? 'generic'}-${remoteMessage?.sentTime ?? Date.now()}`;

    if (uniqueId && this.recentForegroundMessageIds.has(uniqueId)) {
      console.log('ℹ️ Notificación duplicada detectada, se omite:', uniqueId);
      return;
    }

    if (uniqueId) {
      this.recentForegroundMessageIds.add(uniqueId);
      setTimeout(() => this.recentForegroundMessageIds.delete(uniqueId), 20_000);
    }

    console.log('📬 Notificación recibida en foreground:', {
      id: uniqueId,
      title: notification?.title,
      body: notification?.body,
      type: data?.type ?? 'general',
    });

    const presentNotification = async () => {
      let resolvedTitle = i18n.t('shared.notifications.generic.defaultTitle');
      let resolvedBody = i18n.t('shared.notifications.generic.defaultBody');

      try {
        await this.ensureAndroidChannel();

        const notificationKey = typeof data?.notificationKey === 'string' && data.notificationKey.trim().length
          ? data.notificationKey.trim()
          : data?.rideId
            ? `ride-${data.rideId}`
            : undefined;
        const expiresInMsRaw = data?.expiresInMs ?? data?.expires_in_ms;
        const parsedExpires = typeof expiresInMsRaw === 'number'
          ? expiresInMsRaw
          : typeof expiresInMsRaw === 'string'
            ? Number(expiresInMsRaw)
            : NaN;
        const expiresInMs = Number.isFinite(parsedExpires) && parsedExpires > 0 ? parsedExpires : 120_000;

        const copy = notification?.title || notification?.body ? undefined : getGenericNotificationCopy();
        resolvedTitle = notification?.title || copy?.title || resolvedTitle;
        resolvedBody = notification?.body || copy?.body || resolvedBody;

        console.log('🔔 Mostrando notificación local (foreground):', {
          uniqueId,
          notificationKey,
          title: resolvedTitle,
          body: resolvedBody,
          expiresInMs,
        });

        if (notificationKey) {
          await notificationService.showManagedNotification(
            resolvedTitle,
            resolvedBody,
            data || {},
            notificationKey,
            expiresInMs,
          );
        } else {
          await notificationService.showLocalNotification(
            resolvedTitle,
            resolvedBody,
            data || {},
          );
        }
      } catch (error) {
        console.error('❌ Error mostrando notificación local:', error);
        Alert.alert(resolvedTitle, resolvedBody, [
          {
            text: i18n.t('common.actions.accept'),
            onPress: () => this.handleNotificationTap(remoteMessage),
          },
          { text: i18n.t('common.actions.close'), style: 'cancel' },
        ]);
      }
    };

    presentNotification().catch((error) => {
      console.error('❌ Error presentando notificación:', error);
    });
  }

  /**
   * Manejar tap en notificación
   */
  private async handleNotificationTap(remoteMessage: any): Promise<void> {
    const { data } = remoteMessage;
    console.log('👆 Tap en notificación FCM:', data);

    if (!data?.rideId) {
      console.warn('⚠️ No rideId en notificación');
      return;
    }

    try {
      // Importar dinámicamente para evitar dependencias circulares
      const { navigate, navigationRef } = await import('../navigation/NavigationService');
      const { getDatabase, ref, get } = await import('firebase/database');

      // Esperar a que navigation esté listo
      const maxWait = 3000;
      const startTime = Date.now();
      while (!navigationRef.isReady() && Date.now() - startTime < maxWait) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!navigationRef.isReady()) {
        console.warn('⚠️ Navigation no está listo después de 3s');
        return;
      }

      // Obtener datos del viaje desde Firebase
      const db = getDatabase();
      const rideRef = ref(db, `activeRides/${data.rideId}`);
      const snapshot = await get(rideRef);

      if (!snapshot.exists()) {
        console.warn('⚠️ Ride no encontrado:', data.rideId);
        return;
      }

      const rideData = snapshot.val();

      // Construir objeto de viaje para RidePreviewScreen
      const ride = {
        id: data.rideId,
        clientId: rideData.clientId || '',
        clientName: rideData.clientName,
        clientPhone: rideData.clientPhone,
        origin: rideData.origin || { lat: 0, lng: 0 },
        destination: rideData.destination || { lat: 0, lng: 0 },
        extraDestinations: rideData.extraDestinations || [],
        estimatedPrice: rideData.estimatedPrice || 0,
        estimatedDistance: rideData.estimatedDistance,
        estimatedDuration: rideData.estimatedDuration,
        clientSuggestedPrice: rideData.clientSuggestedPrice,
        driverOfferedPrice: rideData.driverOfferedPrice,
        paymentMethod: rideData.paymentMethod || 'cash',
        negotiationStatus: rideData.negotiationStatus,
      };

      console.log('🚀 [FCM] Navegando a RidePreview:', ride.id);
      navigate('RidePreview', { ride, proximity: true });
    } catch (error) {
      console.error('❌ Error manejando tap en notificación:', error);
    }
  }
  /**
   * Enviar notificación de prueba
   */
  async sendTestNotification(): Promise<void> {
    try {
      const auth = await this.getAuth();
      const user = auth.currentUser;
      if (!user) {
        Alert.alert(
          i18n.t('common.services.fcm.alerts.authErrorTitle'),
          i18n.t('common.services.fcm.alerts.authErrorMessage'),
        );
        return;
      }

      const functions = await this.getFunctions();
      const sendTestNotificationFunction = httpsCallable(functions, 'sendTestNotification');
      await sendTestNotificationFunction({ userId: user.uid });

      Alert.alert(
        i18n.t('common.services.fcm.alerts.testSuccessTitle'),
        i18n.t('common.services.fcm.alerts.testSuccessMessage'),
      );
    } catch (error) {
      console.error('❌ Error enviando notificación de prueba:', error);
      Alert.alert(
        i18n.t('common.services.fcm.alerts.testErrorTitle'),
        i18n.t('common.services.fcm.alerts.testErrorMessage'),
      );
    }
  }

  /**
   * Limpiar token al cerrar sesión
   */
  async clearToken(): Promise<void> {
    try {
      const auth = await this.getAuth();
      const user = auth.currentUser;
      const storedToken = this.fcmToken ?? (await AsyncStorage.getItem('fcmToken'));

      if (user && storedToken) {
        const functions = await this.getFunctions();
        const clearTokenFunction = httpsCallable(functions, 'clearFCMToken');
        await clearTokenFunction({ fcmToken: storedToken });
      }

      if (storedToken) {
        await AsyncStorage.removeItem('fcmToken');
      }

      this.fcmToken = null;
      this.teardownNotificationListeners();

      console.log('🧹 Token FCM limpiado');
    } catch (error) {
      console.error('❌ Error limpiando token FCM:', error);
    }
  }
  /**
   * Verificar estado de permisos
   */
  async checkPermissionStatus(): Promise<boolean> {
    try {
      const ready = await this.ensureMessagingReady();
      if (!ready || !messagingModule || !messagingInstance || !AuthorizationStatusEnum) {
        console.log('⚠️ FCM no disponible, permisos considerados como no concedidos');
        return false;
      }

      const authStatus = await messagingModule.hasPermission(messagingInstance);
      const enabled =
        authStatus === AuthorizationStatusEnum.AUTHORIZED ||
        authStatus === AuthorizationStatusEnum.PROVISIONAL;

      return enabled;
    } catch (error) {
      console.error('❌ Error verificando permisos:', error);
      return false;
    }
  }

  /**
   * Obtener token guardado
   */
  async getStoredToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('fcmToken');
    } catch (error) {
      console.error('❌ Error obteniendo token guardado:', error);
      return null;
    }
  }

  private ensureMessagingReady(): Promise<boolean> {
    if (!this.messagingInitPromise) {
      this.messagingInitPromise = initializeMessagingModule().then((result: boolean) => {
        this.isFCMAvailable = result;
        return result;
      });
    }
    return this.messagingInitPromise!;
  }
}

export default new FCMService();
