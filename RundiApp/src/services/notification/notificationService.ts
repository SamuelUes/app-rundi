/**
 * Notification Service
 * Manejo de notificaciones push con Expo Notifications
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '../../i18n';

// Configurar cómo se muestran las notificaciones
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldPlaySound: !['ride_live_update', 'ride_driver_offered'].includes(
      String(notification.request.content.data?.type ?? ''),
    ),
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  private managedNotifications = new Map<
    string,
    {
      notificationId: string;
      timeoutHandle: ReturnType<typeof setTimeout>;
      expiresAt: number;
      signature: string;
    }
  >();

  private buildManagedSignature(title: string, body: string): string {
    return `${title}::${body}`;
  }

  /**
   * Inicializar servicio de notificaciones (legacy — permissions now handled by notificationSetup)
   */
  async initialize(): Promise<string | null> {
    return null;
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

  async dismissRideOfferNotification(rideId: string) {
    try {
      const notifications = await Notifications.getPresentedNotificationsAsync();
      for (const notification of notifications) {
        const data = notification.request.content.data;
        if (data?.type !== 'ride_driver_offered' || data?.rideId !== rideId) continue;
        await Notifications.dismissNotificationAsync(notification.request.identifier);
        const key = `live-ride-${rideId}`;
        if (this.managedNotifications.get(key)?.notificationId === notification.request.identifier) {
          this.clearManagedNotification(key);
        }
      }
    } catch (error) {
      console.warn('[notificationService] Error descartando oferta:', error);
    }
  }

  async showManagedNotification(
    title: string,
    body: string,
    data: any,
    notificationKey: string,
    expiresInMs: number = 120_000,
    silent: boolean = false,
  ) {
    if (!notificationKey) {
      await this.showLocalNotification(title, body, data);
      return;
    }

    const normalizedExpires = Number.isFinite(expiresInMs) && expiresInMs > 0 ? expiresInMs : 120_000;
    const signature = this.buildManagedSignature(title, body);
    const existingEntry = this.managedNotifications.get(notificationKey);

    if (existingEntry && existingEntry.expiresAt > Date.now() && existingEntry.signature === signature) {
      return;
    }

    await this.dismissManagedNotification(notificationKey);

    try {
      if (!silent) await this.ensureAndroidChannel();
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            ...data,
            notificationKey,
            expiresInMs: normalizedExpires,
          },
          sound: silent ? false : 'notification.wav',
          priority: silent ? Notifications.AndroidNotificationPriority.LOW : Notifications.AndroidNotificationPriority.MAX,
          ...(!silent ? { vibrate: [0, 250, 250, 250] } : {}),
          ...(Platform.OS === 'android' ? { channelId: silent ? 'rundi-client-ride-silent-v1' : 'rundi-default-v2' } : {}),
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
        signature,
      });
    } catch (error) {
      console.error('❌ Error mostrando notificación administrada:', error);
      if (!silent) await this.showLocalNotification(title, body, data);
    }
  }

  /**
   * Crear canal Android de alta prioridad para proximidad
   */
  private async ensureAndroidChannel() {
    try {
      if (Platform.OS !== 'android') return;
      await Notifications.setNotificationChannelAsync('rundi-default-v2', {
        name: this.tr('channels.default'),
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
    } catch (e) {
      // noop
    }
  }

  /**
   * Obtener token actual (deprecated — FCM handles tokens now)
   */
  getToken(): string | null {
    return null;
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
          sound: 'notification.wav',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          ...(Platform.OS === 'android' ? { channelId: 'rundi-default-v2' } : {}),
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
    const distance = this.formatDistanceKm(ride.estimatedDistance);
    const price = this.formatPriceCordoba(ride.estimatedPrice);
    const origin = ride?.origin?.address || this.tr('newRide.originFallback');

    await this.showManagedNotification(
      this.tr('newRide.title'),
      this.tr('newRide.body', {
        distance: distance ?? '',
        price,
        origin,
      }),
      { type: 'new_ride', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje aceptado
   */
  async notifyRideAccepted(ride: any) {
    const driverName = ride?.driver?.name || this.tr('rideAccepted.driverFallback');
    await this.showManagedNotification(
      this.tr('rideAccepted.title'),
      this.tr('rideAccepted.body', { driverName }),
      { type: 'ride_accepted', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje iniciado
   */
  async notifyRideStarted(ride: any) {
    await this.showManagedNotification(
      this.tr('rideStarted.title'),
      this.tr('rideStarted.body'),
      { type: 'ride_started', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje completado
   */
  async notifyRideCompleted(ride: any) {
    await this.showManagedNotification(
      this.tr('rideCompleted.title'),
      this.tr('rideCompleted.body'),
      { type: 'ride_completed', rideId: ride.id },
      `ride-${ride.id}`,
    );
  }

  /**
   * Notificar viaje cancelado
   */
  async notifyRideCanceled(ride: any, reason?: string) {
    await this.showManagedNotification(
      this.tr('rideCanceled.title'),
      reason || this.tr('rideCanceled.body'),
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

  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`common.services.notificationService.${path}`, options) as string;
  }

  private formatPriceCordoba(amount?: number | string | null) {
    const numeric =
      typeof amount === 'number'
        ? amount
        : typeof amount === 'string' && amount.trim().length
          ? Number(amount)
          : NaN;
    const value = Number.isFinite(numeric) ? Number(numeric) : 0;
    return this.tr('formats.priceCordoba', { amount: value.toFixed(0) });
  }

  private formatDistanceKm(distanceMeters?: number | null) {
    if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters)) {
      return null;
    }
    const value = distanceMeters / 1000;
    return this.tr('formats.distanceKm', { value: value.toFixed(1) });
  }

}

export default new NotificationService();
