/**
 * useNotifications Hook
 * Hook para manejar notificaciones push
 */

import { useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import notificationService from '../../../services/notificationService';
import liveRideNotificationService from '../../../services/liveRideNotificationService';
import { useAuth } from '../../../context/AuthContext';
import { navigate } from '../../../navigation/NavigationService';

const parseMaybeJson = (value: any) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseProximityPayload = (data: any) => {
  const ride = parseMaybeJson(data?.ride);
  const nearbyRidesRaw = parseMaybeJson(data?.nearbyRides);
  const nearbyRides = Array.isArray(nearbyRidesRaw) ? nearbyRidesRaw : [];
  return {
    ride: ride && typeof ride === 'object' ? ride : null,
    nearbyRides,
  };
};

export function useNotifications() {
  const { user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  const openSupportChatFromData = (
    data: any,
    options?: { delayMs?: number },
  ) => {
    if (typeof data?.complaintId !== 'string' || !data.complaintId) {
      return;
    }
    const rideId = typeof data.rideId === 'string' ? data.rideId : null;
    const initialCategory = typeof data.category === 'string' ? data.category : undefined;
    const initialTitle = typeof data.title === 'string' ? data.title : undefined;
    const delay = options?.delayMs ?? 0;

    setTimeout(() => {
      navigate('SupportChat', {
        rideId,
        initialCategory,
        initialTitle,
        complaintId: data.complaintId,
      } as any);
    }, delay);
  };

  const routeNotificationData = async (data: any, options?: { coldStart?: boolean }) => {
    switch (data?.type) {
      case 'new_ride':
        console.log('Navegar a viaje:', data.rideId);
        break;
      case 'proximity_ride':
        try {
          const payload = parseProximityPayload(data);
          if (payload.ride) {
            navigate('RidePreview', { ride: payload.ride, nearbyRides: payload.nearbyRides, proximity: true });
          }
        } catch {
          // noop
        }
        break;
      case 'quick_return_active_ride':
        if (typeof data?.rideId === 'string') {
          if (options?.coldStart) {
            setTimeout(() => {
              if (user?.role === 'driver' || user?.role === 'designated_driver') {
                navigate('ActiveRide', { rideId: data.rideId });
              }
            }, 400);
          } else if (user?.role === 'driver' || user?.role === 'designated_driver') {
            navigate('ActiveRide', { rideId: data.rideId });
          }
        }
        break;
      case 'ride_accepted':
        console.log('Viaje aceptado:', data.rideId);
        break;
      case 'ride_started':
        console.log('Viaje iniciado:', data.rideId);
        break;
      case 'ride_completed':
        console.log('Viaje completado:', data.rideId);
        break;
      case 'ride_live_update':
        try {
          await liveRideNotificationService.presentFromPush(data);
        } catch (error) {
          console.warn('[useNotifications] Error mostrando live update:', error);
        }
        break;
      case 'support_chat':
      case 'support_ticket_message':
        openSupportChatFromData(data, options?.coldStart ? { delayMs: 400 } : undefined);
        break;
      case 'programmed_ride_client_confirm':
        navigate('ClientPreflight', {});
        break;
      case 'programmed_ride_driver_confirm':
        navigate('DriverPreflight', {});
        break;
      default:
        console.log('Notificación desconocida:', data);
    }
  };

  useEffect(() => {
    // Inicializar notificaciones
    initializeNotifications();

    // Listener para notificaciones recibidas
    notificationListener.current = notificationService.addNotificationReceivedListener(
      (notification) => {
        console.log('📬 Notificación recibida:', notification);
        setNotification(notification);
      }
    );

    // Listener para cuando se toca una notificación
    responseListener.current = notificationService.addNotificationResponseListener(
      (response) => {
        console.log('👆 Notificación tocada:', response);
        handleNotificationResponse(response);
      }
    );

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
  }, []);

  const initializeNotifications = async () => {
    const token = await notificationService.initialize();
    setExpoPushToken(token);

    if (token && user) {
      // Aquí podrías guardar el token en el backend
      console.log('💾 Token de notificaciones para usuario:', user.id);
      // await saveTokenToBackend(user.id, token);
    }

    // Manejar notificación que abrió la app (cold start)
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last && last.notification?.request?.content?.data) {
        const data: any = last.notification.request.content.data;
        await routeNotificationData(data, { coldStart: true });
      }
    } catch (e) {
      // noop
    }
  };

  const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    await routeNotificationData(data);
  };

  return {
    expoPushToken,
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
