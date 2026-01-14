/**
 * useNotifications Hook
 * Hook para manejar notificaciones push
 */

import { useEffect, useState, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import notificationService from '../services/notificationService';
import liveRideNotificationService from '../services/liveRideNotificationService';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../navigation/NavigationService';

export function useNotifications() {
  const { user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

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
        if (data?.type === 'proximity_ride' && data?.ride) {
          navigate('RidePreview', { ride: data.ride, nearbyRides: Array.isArray(data.nearbyRides) ? data.nearbyRides : [] });
        }
        if (data?.type === 'quick_return_active_ride' && typeof data?.rideId === 'string') {
          // Pequeño delay para asegurar que NavigationContainer esté listo
          setTimeout(() => {
            // Por ahora soportamos retorno rápido para conductores
            if (user?.role === 'driver' || user?.role === 'designated_driver') {
              navigate('ActiveRide', { rideId: data.rideId });
            }
          }, 400);
        }
      }
    } catch (e) {
      // noop
    }
  };

  const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;

    // Manejar diferentes tipos de notificaciones
    switch (data.type) {
      case 'new_ride':
        console.log('Navegar a viaje:', data.rideId);
        // navigation.navigate('RideDetails', { rideId: data.rideId });
        break;
      case 'proximity_ride':
        try {
          const ride = data.ride;
          const nearbyRides = Array.isArray(data.nearbyRides) ? data.nearbyRides : [];
          if (ride) {
            navigate('RidePreview', { ride, nearbyRides });
          }
        } catch (e) {
          // noop
        }
        break;
      case 'quick_return_active_ride':
        if (typeof (data.rideId) === 'string') {
          if (user?.role === 'driver' || user?.role === 'designated_driver') {
            navigate('ActiveRide', { rideId: data.rideId });
          }
        }
        break;
      case 'ride_accepted':
        console.log('Viaje aceptado:', data.rideId);
        // navigation.navigate('RideTracking', { rideId: data.rideId });
        break;
      case 'ride_started':
        console.log('Viaje iniciado:', data.rideId);
        break;
      case 'ride_completed':
        console.log('Viaje completado:', data.rideId);
        // navigation.navigate('RateRide', { rideId: data.rideId });
        break;
      case 'ride_live_update':
        try {
          await liveRideNotificationService.presentFromPush(data);
        } catch (error) {
          console.warn('[useNotifications] Error mostrando live update:', error);
        }
        break;
      default:
        console.log('Notificación desconocida:', data);
    }
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
