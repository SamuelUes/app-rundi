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
import { getFirebaseAuth, getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

// Importar FCM solo si está disponible (Development Build)
let messagingModule: any = null;
let messagingInstance: any = null;
let AuthorizationStatusEnum: any = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

try {
  messagingModule = require('@react-native-firebase/messaging');
  const { getMessaging, AuthorizationStatus } = messagingModule;
  messagingInstance = getMessaging();
  AuthorizationStatusEnum = AuthorizationStatus;
  try {
    if (messagingModule?.setBackgroundMessageHandler && messagingInstance) {
      messagingModule.setBackgroundMessageHandler(
        messagingInstance,
        async (remoteMessage: any) => {
          try {
            console.log('📥 Notificación gestionada en background:', {
              id: remoteMessage?.messageId,
              data: remoteMessage?.data,
            });
          } catch (logError) {
            console.warn('⚠️ Error registrando log de background message:', logError);
          }
        }
      );
    }
  } catch (handlerError) {
    try {
      // Compatibilidad con API antigua (sin instancia como primer parámetro)
      messagingModule?.setBackgroundMessageHandler?.(async (remoteMessage: any) => {
        try {
          console.log('📥 Notificación gestionada en background (compat):', {
            id: remoteMessage?.messageId,
            data: remoteMessage?.data,
          });
        } catch (logError) {
          console.warn('⚠️ Error registrando log de background message (compat):', logError);
        }
      });
    } catch (fallbackError) {
      console.warn('⚠️ No se pudo registrar handler de mensajes en background:', fallbackError ?? handlerError);
    }
  }
  console.log('✅ FCM disponible - usando Firebase Cloud Messaging');
} catch (error) {
  messagingModule = null;
  messagingInstance = null;
  AuthorizationStatusEnum = null;
  console.log('⚠️ FCM no disponible - usando Expo Notifications como fallback');
}

class FCMService {
  private fcmToken: string | null = null;
  private functions: any = null;
  private isFCMAvailable: boolean = messagingInstance !== null;
  private recentForegroundMessageIds: Set<string> = new Set();
  private listenersConfigured = false;
  private onMessageUnsubscribe: (() => void) | null = null;
  private onNotificationOpenedUnsubscribe: (() => void) | null = null;

  constructor() {
    this.ensureAndroidChannel();
  }

  private async ensureAndroidChannel() {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      await Notifications.setNotificationChannelAsync('driveangel_default', {
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
    return await getFirebaseAuth();
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
      // Si FCM no está disponible, retornar false
      if (!this.isFCMAvailable || !messagingModule || !messagingInstance) {
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
      // Si FCM no está disponible, retornar null
      if (!this.isFCMAvailable || !messagingModule || !messagingInstance) {
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
  setupNotificationListeners(): void {
    if (!this.isFCMAvailable || !messagingModule || !messagingInstance) {
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
      try {
        await this.ensureAndroidChannel();

        console.log('🔔 Mostrando notificación local (foreground):', {
          uniqueId,
          title: notification?.title,
          body: notification?.body,
        });

        await Notifications.presentNotificationAsync({
          title: notification?.title || 'Nueva notificación',
          body: notification?.body || '',
          data: data || {},
          sound: 'default',
        });
      } catch (error) {
        console.error('❌ Error mostrando notificación local:', error);
        Alert.alert(
          notification?.title || 'Nueva notificación',
          notification?.body || '',
          [
            {
              text: 'Ver',
              onPress: () => this.handleNotificationTap(remoteMessage),
            },
            { text: 'Cerrar', style: 'cancel' },
          ]
        );
      }
    };

    presentNotification().catch((error) => {
      console.error('❌ Error presentando notificación:', error);
    });
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
   * Manejar tap en notificación
   */
  private handleNotificationTap(remoteMessage: any): void {
    const { data } = remoteMessage;

    if (data?.rideId) {
      // Navegar a pantalla del viaje
      // Esto se implementará en el NavigationService
      console.log('🧭 Navegando a viaje:', data.rideId);
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
        Alert.alert('Error', 'Usuario no autenticado');
        return;
      }

      const functions = await this.getFunctions();
      const sendTestNotificationFunction = httpsCallable(functions, 'sendTestNotification');
      await sendTestNotificationFunction({ userId: user.uid });

      Alert.alert('Éxito', 'Notificación de prueba enviada');
    } catch (error) {
      console.error('❌ Error enviando notificación de prueba:', error);
      Alert.alert('Error', 'No se pudo enviar la notificación');
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
      // Si FCM no está disponible, retornar false
      if (!this.isFCMAvailable || !messagingModule || !messagingInstance || !AuthorizationStatusEnum) {
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
}

export default new FCMService();
