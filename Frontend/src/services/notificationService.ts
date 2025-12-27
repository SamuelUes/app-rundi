/**
 * Notification Service
 * Manejo de notificaciones push con Expo Notifications
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Configurar cómo se muestran las notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  private expoPushToken: string | null = null;
  private quickReturnNotificationId: string | null = null;
  private managedNotifications = new Map<
    string,
    {
      notificationId: string;
      timeoutHandle: ReturnType<typeof setTimeout>;
      expiresAt: number;
    }
  >();

  /**
   * Inicializar servicio de notificaciones
   */
  async initialize(): Promise<string | null> {
    try {
      // CRÍTICO: Usar projectId del owner (samuelues) desde app.json
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || '79fc9fff-5481-4aba-a29a-632db706c382';
      
      if (!projectId || !this.isValidUUID(projectId)) {
        console.log('ℹ️ Expo Push Notifications deshabilitado - usando FCM');
        return null;
      }
      
      console.log('🔔 Inicializando notificaciones con projectId:', projectId);

      // Solicitar permisos
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('⚠️ Permisos de notificaciones denegados');
        return null;
      }

      // Configurar canal Android de alta prioridad
      await this.ensureAndroidChannel();

      // Obtener token de Expo Push
      const token = await this.getExpoPushToken();
      this.expoPushToken = token;

      console.log('✅ Notificaciones inicializadas. Token:', token);
      return token;
    } catch (error) {
      console.error('❌ Error inicializando notificaciones:', error);
      console.log('ℹ️ Expo Notifications falló, usando FCM como alternativa');
      return null;
    }
  }

  private clearManagedNotification(notificationKey: string) {
    const entry = this.managedNotifications.get(notificationKey);
    if (!entry) {
      return;
    }

    try {
      clearTimeout(entry.timeoutHandle);
    } catch (_) {
      // noop
    }

    this.managedNotifications.delete(notificationKey);
  }

  async dismissManagedNotification(notificationKey: string) {
    const entry = this.managedNotifications.get(notificationKey);
    if (!entry) {
      return;
    }

    try {
      await Notifications.dismissNotificationAsync(entry.notificationId);
    } catch (error) {
      console.warn('⚠️ Error descartando notificación administrada:', error);
    } finally {
      this.clearManagedNotification(notificationKey);
    }
  }

  async showManagedNotification(
    title: string,
    body: string,
    data: any,
    notificationKey: string,
    expiresInMs: number = 120_000,
  ) {
    if (!notificationKey) {
      await this.showLocalNotification(title, body, data);
      return;
    }

    const normalizedExpires = Number.isFinite(expiresInMs) && expiresInMs > 0 ? expiresInMs : 120_000;

    await this.dismissManagedNotification(notificationKey);

    try {
      await this.ensureAndroidChannel();
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            ...data,
            notificationKey,
            expiresInMs: normalizedExpires,
          },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 250, 250, 250],
        },
        trigger: null, // Mostrar inmediatamente
      });

      const timeoutHandle = setTimeout(async () => {
        try {
          await Notifications.dismissNotificationAsync(notificationId);
        } catch (error) {
          console.warn('⚠️ Error descartando notificación por expiración:', error);
        } finally {
          this.managedNotifications.delete(notificationKey);
        }
      }, normalizedExpires);

      this.managedNotifications.set(notificationKey, {
        notificationId,
        timeoutHandle,
        expiresAt: Date.now() + normalizedExpires,
      });
    } catch (error) {
      console.error('❌ Error mostrando notificación administrada:', error);
      await this.showLocalNotification(title, body, data);
    }
  }

  /**
   * Validar si es un UUID válido
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Obtener Expo Push Token
   */
  private async getExpoPushToken(): Promise<string> {
    // CRÍTICO: Usar el mismo projectId que en initialize()
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || '79fc9fff-5481-4aba-a29a-632db706c382';
    
    console.log('🔑 Obteniendo Expo Push Token con projectId:', projectId);
    
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token.data;
  }

  /**
   * Crear canal Android de alta prioridad para proximidad
   */
  private async ensureAndroidChannel() {
    try {
      if (Platform.OS !== 'android') return;
      // Configurar canal por defecto como alta prioridad
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Viajes Cercanos',
        importance: Notifications.AndroidImportance.MAX,
        bypassDnd: true,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
        enableLights: true,
        lightColor: '#FF9800',
        showBadge: true,
      });
    } catch (e) {
      // noop
    }
  }

  /**
   * Canal dedicado para "Viaje activo" (Android)
   */
  private async ensureActiveRideChannel() {
    try {
      if (Platform.OS !== 'android') return;
      await Notifications.setNotificationChannelAsync('active-ride', {
        name: 'Viaje activo',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
        enableLights: true,
        lightColor: '#D4AF37',
      });
    } catch (_) {
      // noop
    }
  }

  /**
   * Obtener token actual
   */
  getToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Mostrar notificación local
   */
  async showLocalNotification(title: string, body: string, data?: any) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Mostrar inmediatamente
      });
    } catch (error) {
      console.error('❌ Error mostrando notificación:', error);
    }
  }

  /**
   * Mostrar notificación de retorno rápido a la pantalla de viaje activo
   * Compatible iOS/Android. En Android usa canal dedicado.
   */
  async showQuickReturnActiveRide(rideId: string): Promise<string | null> {
    try {
      await this.ensureActiveRideChannel();
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Viaje activo',
          body: 'Toca para volver al viaje',
          data: { type: 'quick_return_active_ride', rideId },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
      this.quickReturnNotificationId = id;
      return id;
    } catch (error) {
      console.error('❌ Error creando notificación de retorno rápido:', error);
      return null;
    }
  }

  /**
   * Limpiar notificación de retorno rápido (usa dismissAll por confiabilidad)
   */
  async clearQuickReturn() {
    try {
      await Notifications.dismissAllNotificationsAsync();
      this.quickReturnNotificationId = null;
      this.managedNotifications.forEach((entry, key) => {
        try {
          clearTimeout(entry.timeoutHandle);
        } catch (_) {
          // noop
        }
        this.managedNotifications.delete(key);
      });
    } catch (error) {
      console.error('❌ Error limpiando notificaciones:', error);
    }
  }

  /**
   * Notificar nuevo viaje disponible
   */
  async notifyNewRide(ride: any) {
    const distance = (ride.estimatedDistance / 1000).toFixed(1);
    const price = ride.estimatedPrice.toFixed(0);

    await this.showManagedNotification(
      '🚗 Nuevo Viaje Disponible',
      `${distance} km • C$${price} • ${ride.origin.address}`,
      { type: 'new_ride', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje aceptado
   */
  async notifyRideAccepted(ride: any) {
    await this.showManagedNotification(
      '✅ Viaje Aceptado',
      `El conductor ${ride.driver.name} aceptó tu viaje`,
      { type: 'ride_accepted', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje iniciado
   */
  async notifyRideStarted(ride: any) {
    await this.showManagedNotification(
      '🚗 Viaje Iniciado',
      'Tu conductor ha iniciado el viaje',
      { type: 'ride_started', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje completado
   */
  async notifyRideCompleted(ride: any) {
    await this.showManagedNotification(
      '✅ Viaje Completado',
      'Tu viaje ha finalizado. ¡Califica tu experiencia!',
      { type: 'ride_completed', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje cancelado
   */
  async notifyRideCanceled(ride: any, reason?: string) {
    await this.showManagedNotification(
      'Viaje Cancelado',
      reason || 'El viaje ha sido cancelado',
      { type: 'ride_canceled', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Configurar badge (número en el ícono)
   */
  async setBadgeCount(count: number) {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('❌ Error configurando badge:', error);
    }
  }

  /**
   * Limpiar badge
   */
  async clearBadge() {
    await this.setBadgeCount(0);
  }

  /**
   * Cancelar todas las notificaciones
   */
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      this.managedNotifications.forEach((entry, key) => {
        try {
          clearTimeout(entry.timeoutHandle);
        } catch (_) {
          // noop
        }
        this.managedNotifications.delete(key);
      });
    } catch (error) {
      console.error('❌ Error cancelando notificaciones:', error);
    }
  }

  /**
   * Agregar listener para notificaciones recibidas
   */
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  /**
   * Agregar listener para cuando se toca una notificación
   */
  addNotificationResponseListener(callback: (response: Notifications.NotificationResponse) => void) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export default new NotificationService();
