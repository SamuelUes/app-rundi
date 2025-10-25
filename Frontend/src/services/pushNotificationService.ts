/**
 * PUSH NOTIFICATION SERVICE
 * 
 * Gestiona notificaciones push en segundo plano
 * Integrado con Firebase Cloud Messaging (FCM)
 */

import messaging from '@react-native-firebase/messaging';
import { Platform, Alert } from 'react-native';
import { getDatabase, ref, set } from 'firebase/database';
import app from '../config/firebase';

interface NotificationPayload {
  title: string;
  body: string;
  rideId?: string;
  type: 'driver_found' | 'driver_accepted' | 'ride_started' | 'chat_message' | 'ride_completed' | 'general';
  data?: Record<string, any>;
}

class PushNotificationService {
  private initialized = false;

  /**
   * Inicializar servicio de notificaciones
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('🔔 Inicializando Push Notifications...');

      // Solicitar permisos
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.warn('⚠️ Permisos de notificaciones no otorgados');
        return;
      }

      // Obtener FCM token
      const token = await messaging().getToken();
      console.log('✅ FCM Token obtenido:', token);

      // Guardar token en Firebase
      await this.saveFCMToken(token);

      // Configurar listeners
      this.setupMessageHandlers();

      this.initialized = true;
      console.log('✅ Push Notifications inicializado');
    } catch (error) {
      console.error('❌ Error inicializando Push Notifications:', error);
    }
  }

  /**
   * Guardar FCM token en Firebase
   */
  private async saveFCMToken(token: string) {
    try {
      if (!app) {
        console.warn('⚠️ Firebase app no inicializado');
        return;
      }

      const db = getDatabase(app);
      const userId = await this.getCurrentUserId();

      if (!userId) {
        console.warn('⚠️ No hay usuario autenticado');
        return;
      }

      // Guardar token en /users/{userId}/fcmToken
      const tokenRef = ref(db, `users/${userId}/fcmToken`);
      await set(tokenRef, {
        token,
        platform: Platform.OS,
        timestamp: Date.now(),
      });

      console.log('✅ FCM Token guardado en Firebase');
    } catch (error) {
      console.error('❌ Error guardando FCM Token:', error);
    }
  }

  /**
   * Obtener ID del usuario actual
   */
  private async getCurrentUserId(): Promise<string | null> {
    try {
      // Obtener del contexto de autenticación o AsyncStorage
      // Por ahora retornamos null, se implementará con el contexto real
      return null;
    } catch (error) {
      console.error('❌ Error obteniendo usuario:', error);
      return null;
    }
  }

  /**
   * Configurar handlers para mensajes
   */
  private setupMessageHandlers() {
    // Mensaje recibido en foreground
    messaging().onMessage(async (remoteMessage) => {
      console.log('📬 Mensaje en foreground:', remoteMessage);
      this.handleForegroundNotification(remoteMessage);
    });

    // Mensaje recibido en background (usuario toca la notificación)
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('📬 Notificación abierta desde background:', remoteMessage);
      this.handleBackgroundNotification(remoteMessage);
    });

    // Verificar si la app fue abierta desde una notificación
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log('📬 App abierta desde notificación:', remoteMessage);
          this.handleBackgroundNotification(remoteMessage);
        }
      });

    // Token refresh
    messaging().onTokenRefresh((token) => {
      console.log('🔄 FCM Token refrescado:', token);
      this.saveFCMToken(token);
    });
  }

  /**
   * Manejar notificación en foreground
   */
  private handleForegroundNotification(remoteMessage: any) {
    const { notification, data } = remoteMessage;

    console.log('🔔 Notificación en foreground:', {
      title: notification?.title,
      body: notification?.body,
      type: data?.type,
    });

    // Mostrar alerta o usar un componente personalizado
    if (notification?.title && notification?.body) {
      Alert.alert(notification.title, notification.body);
    }
  }

  /**
   * Manejar notificación en background
   */
  private handleBackgroundNotification(remoteMessage: any) {
    const { data } = remoteMessage;
    const { type, rideId } = data;

    console.log('🔔 Notificación en background:', { type, rideId });

    // Navegar según el tipo de notificación
    switch (type) {
      case 'driver_found':
        console.log('🚕 Conductor encontrado');
        // Navegar a pantalla de espera del conductor
        break;
      case 'driver_accepted':
        console.log('✅ Conductor aceptó');
        // Actualizar UI
        break;
      case 'ride_started':
        console.log('🚗 Viaje iniciado');
        // Navegar a pantalla de viaje en progreso
        break;
      case 'chat_message':
        console.log('💬 Nuevo mensaje en chat');
        // Mostrar notificación de chat
        break;
      case 'ride_completed':
        console.log('✅ Viaje completado');
        // Navegar a pantalla de rating
        break;
      default:
        console.log('📬 Notificación general');
    }
  }

  /**
   * Enviar notificación de prueba (solo para desarrollo)
   */
  async sendTestNotification() {
    try {
      console.log('📤 Enviando notificación de prueba...');
      // Se implementará con una Cloud Function
    } catch (error) {
      console.error('❌ Error enviando notificación de prueba:', error);
    }
  }
}

export default new PushNotificationService();
