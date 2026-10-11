/**
 * Servicio de Notificaciones Push usando Firebase Cloud Messaging (FCM)
 * Alternativa más confiable a WebSocket para notificaciones en tiempo real
 * 
 * NOTA: FCM requiere Development Build, no funciona en Expo Go
 * Para Expo Go, usar Expo Notifications como fallback
 */

import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseFunctions, getFirebaseAuth } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import notificationService from './notificationService';
import { routeNotification } from './notificationRouter';
import { requestNotificationPermissions } from './notificationSetup';
import i18n from '../i18n';
import {
  isNativeFirebaseSupported,
  loadNativeFirebaseAuth,
  loadNativeFirebaseMessaging,
} from '../utils/nativeFirebase';

// Importar FCM solo si está disponible (Development Build)
let messagingModule: any = null;
let messagingInstance: any = null;
let AuthorizationStatusEnum: any = null;
let backgroundHandlersRegistered = false;

// Notifications.setNotificationHandler is centralized in notificationService.ts

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

    try {
      console.log('🔔 Mostrando notificación local en background (data-only):', {
        data,
      });

              // Usar directamente Expo Notifications en background
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('shared.notifications.generic.defaultTitle'),
          body: i18n.t('shared.notifications.generic.defaultBody'),
          data: data || {},
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 250, 250, 250],
        },
        trigger: null,
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

const initializeMessagingModule = async (): Promise<boolean> => {
  if (messagingModule && messagingInstance) {
    return true;
  }

  try {
    // Solo intentar inicializar FCM si los módulos nativos están disponibles
    if (!isNativeFirebaseSupported()) {
      console.log('⚠️ React Native Firebase no está soportado en este entorno (probablemente Expo Go)');
      logAvailability('unavailable');
      return false;
    }

    const rnMessaging = await loadNativeFirebaseMessaging();
    if (!rnMessaging || !rnMessaging.getMessaging) {
      console.warn('⚠️ No se pudo cargar el módulo nativo de Firebase Messaging.');
      logAvailability('unavailable');
      return false;
    }

    // React Native Firebase se inicializa automáticamente con google-services.json
    // RNFB v26: solo API modular (la API namespaced fue eliminada)
    const instance = rnMessaging.getMessaging();

    if (!instance) {
      console.warn('⚠️ No se pudo obtener una instancia de Firebase Messaging.');
      logAvailability('unavailable');
      return false;
    }

    messagingModule = {
      AuthorizationStatus: rnMessaging.AuthorizationStatus,
      requestPermission: async (currentInstance: any) =>
        rnMessaging.requestPermission(currentInstance),
      hasPermission: async (currentInstance: any) =>
        rnMessaging.hasPermission(currentInstance),
      getToken: async (currentInstance: any) =>
        rnMessaging.getToken(currentInstance),
      isDeviceRegisteredForRemoteMessages: async (currentInstance: any) =>
        rnMessaging.isDeviceRegisteredForRemoteMessages(currentInstance),
      registerDeviceForRemoteMessages: async (currentInstance: any) =>
        rnMessaging.registerDeviceForRemoteMessages(currentInstance),
      onMessage: (currentInstance: any, handler: any) =>
        rnMessaging.onMessage(currentInstance, handler),
      onNotificationOpenedApp: (currentInstance: any, handler: any) =>
        rnMessaging.onNotificationOpenedApp(currentInstance, handler),
      getInitialNotification: (currentInstance: any) =>
        rnMessaging.getInitialNotification(currentInstance),
      setBackgroundMessageHandler: (arg1: any, arg2?: any) => {
        const handler = typeof arg1 === 'function' ? arg1 : arg2;
        if (typeof handler === 'function') {
          rnMessaging.setBackgroundMessageHandler(instance, handler);
        }
      },
    };
    messagingInstance = instance;
    AuthorizationStatusEnum = rnMessaging.AuthorizationStatus;

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
  private isFCMAvailable: boolean = true;
  private recentForegroundMessageIds: Set<string> = new Set();
  private listenersConfigured = false;
  private onMessageUnsubscribe: (() => void) | null = null;
  private onNotificationOpenedUnsubscribe: (() => void) | null = null;
  private messagingInitPromise: Promise<boolean> | null = null;
  private apnsRegistrationPromise: Promise<boolean> | null = null;

  /**
   * Registro único en APNs (iOS). La promesa se cachea para que llamadas
   * concurrentes a getToken no superscedan el registro entre sí
   * ([messaging/registration-superseded]). Un timeout se tolera — es frecuente
   * en simulador ARM64; getToken re-verifica el registro antes de llamar a APNs.
   */
  private ensureApnsRegistered(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return Promise.resolve(true);
    }
    if (!this.apnsRegistrationPromise) {
      this.apnsRegistrationPromise = (async () => {
        try {
          if (await messagingModule.isDeviceRegisteredForRemoteMessages(messagingInstance)) {
            return true;
          }
          await messagingModule.registerDeviceForRemoteMessages(messagingInstance);
          return true;
        } catch (regError) {
          console.warn('⚠️ Registro APNs sin confirmar (frecuente en simulador); se intenta getToken igualmente:', regError);
          return false;
        }
      })();
    }
    return this.apnsRegistrationPromise;
  }

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  private async getAuth() {
    if (!isNativeFirebaseSupported()) {
      return { currentUser: null } as any;
    }

    const nativeAuthModule = await loadNativeFirebaseAuth();
    const rnAuth = nativeAuthModule?.getAuth?.();
    if (!rnAuth) {
      console.warn('⚠️ No se pudo cargar el módulo nativo de Firebase Auth.');
      return { currentUser: null } as any;
    }

    return rnAuth;
  }

  private async getWebAuthUser() {
    try {
      const webAuth = await getFirebaseAuth();
      return webAuth.currentUser;
    } catch (error) {
      console.warn('⚠️ No se pudo obtener usuario de Firebase Auth Web:', error);
      return null;
    }
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
    return requestNotificationPermissions();
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

      // RNFB v26: iOS requiere registro explícito en APNs antes de getToken
      // (la API namespaced lo hacía implícitamente).
      if (Platform.OS === 'ios') {
        const apnsRegistered = await this.ensureApnsRegistered();
        if (!apnsRegistered) {
          // Registro APNs no confirmado (típico en simulador ARM64): llamar a
          // getToken lanzaría [messaging/unregistered]. Solo se intenta si APNs
          // completó el registro en segundo plano mientras tanto.
          const isRegistered = await messagingModule
            .isDeviceRegisteredForRemoteMessages(messagingInstance)
            .catch(() => false);
          if (!isRegistered) {
            console.log('⚠️ APNs no registró el dispositivo (¿simulador?); se omite token FCM');
            return null;
          }
        }
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
      const webUser = await this.getWebAuthUser();

      if (!webUser) {
        console.log('⚠️ Usuario no autenticado en Firebase (web), saltando registro de token');
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
        routeNotification(remoteMessage?.data, { coldStart: false });
      }
    );

    // Listener para cuando se abre la app desde una notificación (app cerrada)
    messagingModule
      .getInitialNotification(messagingInstance)
      .then((remoteMessage: any) => {
        if (remoteMessage) {
          console.log('🚀 App abierta desde notificación:', remoteMessage);
          routeNotification(remoteMessage?.data, { coldStart: true });
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

        resolvedTitle = notification?.title || resolvedTitle;
        resolvedBody = notification?.body || resolvedBody;

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
            onPress: () => routeNotification(remoteMessage?.data, { coldStart: false }),
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
      const webUser = await this.getWebAuthUser();
      const storedToken = this.fcmToken ?? (await AsyncStorage.getItem('fcmToken'));

      if (webUser && storedToken) {
        const functions = await this.getFunctions();
        const clearTokenFunction = httpsCallable(functions, 'clearFCMToken');
        await clearTokenFunction({ fcmToken: storedToken });
      } else if (storedToken && !webUser) {
        console.log('⚠️ Sesión Firebase no disponible, limpiando token FCM solo de manera local.');
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
