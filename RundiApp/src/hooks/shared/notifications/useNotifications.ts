/**
 * useNotifications Hook
 * Hook para manejar notificaciones push — delega routing a notificationRouter
 */

import { useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import notificationService from '../../../services/notification/notificationService';
import liveRideNotificationService from '../../../services/notification/liveRideNotificationService';
import { routeNotification } from '../../../services/notification/notificationRouter';
import { useAuth } from '../auth/useAuth';

export function useNotifications() {
  const { user } = useAuth();
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Listener para notificaciones recibidas en foreground
    notificationListener.current = notificationService.addNotificationReceivedListener(
      (notif) => {
        console.log('📬 Notificación recibida:', notif);
        setNotification(notif);

        // Si es un live ride update, delegar al liveRideNotificationService
        const data = notif?.request?.content?.data as any;
        if (data?.type === 'ride_live_update') {
          liveRideNotificationService.presentFromPush(data).catch((error) => {
            console.warn('[useNotifications] Error mostrando live update:', error);
          });
        }
      }
    );

    // Listener para cuando se toca una notificación
    responseListener.current = notificationService.addNotificationResponseListener(
      (response) => {
        console.log('👆 Notificación tocada:', response);
        const data = response.notification.request.content.data;
        routeNotification(data, { coldStart: false, userRole: user?.role ?? null });
      }
    );

    // Manejar notificación que abrió la app (cold start)
    Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last && last.notification?.request?.content?.data) {
          const data = last.notification.request.content.data as any;
          routeNotification(data, { coldStart: true, userRole: user?.role ?? null });
        }
      })
      .catch(() => {
        // noop
      });

    // Cleanup
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
        notificationListener.current = null;
      }
      if (responseListener.current) {
        responseListener.current.remove();
        responseListener.current = null;
      }
    };
  }, [user?.role]);

  return {
    notification,
    notifyNewRide: notificationService.notifyNewRide.bind(notificationService),
    notifyRideAccepted: notificationService.notifyRideAccepted.bind(notificationService),
    notifyRideStarted: notificationService.notifyRideStarted.bind(notificationService),
    notifyRideCompleted: notificationService.notifyRideCompleted.bind(notificationService),
    notifyRideCanceled: notificationService.notifyRideCanceled.bind(notificationService),
    setBadgeCount: notificationService.setBadgeCount.bind(notificationService),
    clearBadge: notificationService.clearBadge.bind(notificationService),
  };
}
