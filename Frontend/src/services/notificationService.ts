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

  /**
   * Inicializar servicio de notificaciones
   */
  async initialize(): Promise<string | null> {
    try {
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

      // Obtener token de Expo Push
      const token = await this.getExpoPushToken();
      this.expoPushToken = token;

      console.log('✅ Notificaciones inicializadas. Token:', token);
      return token;
    } catch (error) {
      console.error('❌ Error inicializando notificaciones:', error);
      return null;
    }
  }

  /**
   * Obtener Expo Push Token
   */
  private async getExpoPushToken(): Promise<string> {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token.data;
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
   * Notificar nuevo viaje disponible
   */
  async notifyNewRide(ride: any) {
    const distance = (ride.estimatedDistance / 1000).toFixed(1);
    const price = ride.estimatedPrice.toFixed(0);

    await this.showLocalNotification(
      '🚗 Nuevo Viaje Disponible',
      `${distance} km • C$${price} • ${ride.origin.address}`,
      { type: 'new_ride', rideId: ride.id }
    );
  }

  /**
   * Notificar viaje aceptado
   */
  async notifyRideAccepted(ride: any) {
    await this.showLocalNotification(
      '✅ Viaje Aceptado',
      `El conductor ${ride.driver.name} aceptó tu viaje`,
      { type: 'ride_accepted', rideId: ride.id }
    );
  }

  /**
   * Notificar viaje iniciado
   */
  async notifyRideStarted(ride: any) {
    await this.showLocalNotification(
      '🚗 Viaje Iniciado',
      'Tu conductor ha iniciado el viaje',
      { type: 'ride_started', rideId: ride.id }
    );
  }

  /**
   * Notificar viaje completado
   */
  async notifyRideCompleted(ride: any) {
    await this.showLocalNotification(
      '✅ Viaje Completado',
      'Tu viaje ha finalizado. ¡Califica tu experiencia!',
      { type: 'ride_completed', rideId: ride.id }
    );
  }

  /**
   * Notificar viaje cancelado
   */
  async notifyRideCanceled(ride: any, reason?: string) {
    await this.showLocalNotification(
      '❌ Viaje Cancelado',
      reason || 'El viaje ha sido cancelado',
      { type: 'ride_canceled', rideId: ride.id }
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
