import { navigate, navigationRef } from '../../navigation/NavigationService';
import { openProgrammedPrompt } from '../../stores/programmedPromptStore';
import { getRideDetail } from '../../api/rides';

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

const waitForNavigation = async (maxWait = 3000): Promise<boolean> => {
  const startTime = Date.now();
  while (!navigationRef.isReady() && Date.now() - startTime < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return navigationRef.isReady();
};

export interface RouteOptions {
  coldStart?: boolean;
  userRole?: string | null;
}

export const routeNotification = async (data: any, options: RouteOptions = {}): Promise<void> => {
  if (!data) {
    return;
  }

  const type = data?.type as string | undefined;
  const rideId = data?.rideId as string | undefined;
  const delay = options?.coldStart ? 400 : 0;

  console.log('🔔 [notificationRouter] Routing notification:', { type, rideId, coldStart: options?.coldStart });

  switch (type) {
    case 'programmed_ride_prompt': {
      if (typeof rideId !== 'string' || !rideId) return;
      const role = data?.role === 'driver' ? 'driver' : data?.role === 'client' ? 'client' : null;
      if (role) openProgrammedPrompt(role, rideId);
      return;
    }

    case 'programmed_ride_update': {
      const ready = await waitForNavigation();
      if (ready && navigationRef.getRootState()?.routeNames.includes('ProgrammedRides')) {
        navigate('ProgrammedRides');
      }
      return;
    }

    case 'programmed_ride_driver_removed': {
      const ready = await waitForNavigation();
      if (ready && navigationRef.getRootState()?.routeNames.includes('AvailableRides')) {
        navigate('AvailableRides');
      }
      return;
    }

    case 'proximity_ride': {
      try {
        const payload = parseProximityPayload(data);
        if (payload.ride) {
          const ready = await waitForNavigation();
          if (!ready) return;
          navigate('RidePreview', { ride: payload.ride, nearbyRides: payload.nearbyRides, proximity: true });
        }
      } catch {
        // noop
      }
      return;
    }

    case 'programmed_ride_client_confirm': {
      const ready = await waitForNavigation();
      if (!ready) return;
      navigate('ClientPreflight', {});
      return;
    }

    case 'programmed_ride_driver_confirm': {
      const ready = await waitForNavigation();
      if (!ready) return;
      navigate('DriverPreflight', {});
      return;
    }

    case 'chat_message': {
      if (typeof rideId !== 'string' || !rideId) return;
      const senderId = typeof data?.senderId === 'string' ? data.senderId : undefined;
      const senderName = typeof data?.senderName === 'string' && data.senderName.trim()
        ? data.senderName.trim()
        : 'Chat';
      const ready = await waitForNavigation();
      if (!ready) return;
      const doNavigate = () => navigate('Chat', {
        rideId,
        otherUserId: senderId,
        otherUserName: senderName,
      } as any);
      if (delay > 0) {
        setTimeout(doNavigate, delay);
      } else {
        doNavigate();
      }
      return;
    }

    case 'support_chat':
    case 'support_ticket_message': {
      if (typeof data?.complaintId !== 'string' || !data.complaintId) return;
      const supportRideId = typeof data.rideId === 'string' ? data.rideId : null;
      const initialCategory = typeof data.category === 'string' ? data.category : undefined;
      const initialTitle = typeof data.title === 'string' ? data.title : undefined;
      const doNavigate = () =>
        navigate('SupportChat', {
          rideId: supportRideId,
          initialCategory,
          initialTitle,
          complaintId: data.complaintId,
        } as any);
      if (delay > 0) {
        setTimeout(doNavigate, delay);
      } else {
        doNavigate();
      }
      return;
    }

    case 'ride_call': {
      if (typeof rideId !== 'string' || !rideId) return;
      const callerUid =
        typeof data?.callerUid === 'string' && data.callerUid
          ? data.callerUid
          : typeof data?.otherUserId === 'string'
            ? data.otherUserId
            : undefined;
      if (!callerUid) return;
      const callerName =
        typeof data?.callerName === 'string' && data.callerName.trim()
          ? data.callerName.trim()
          : typeof data?.otherUserName === 'string' && data.otherUserName.trim()
            ? data.otherUserName.trim()
            : 'Llamada';
      const ready = await waitForNavigation();
      if (!ready) return;
      const doNavigate = () =>
        navigate('RideCall', {
          rideId,
          otherUserId: callerUid,
          otherUserName: callerName,
        } as any);
      if (delay > 0) {
        setTimeout(doNavigate, delay);
      } else {
        doNavigate();
      }
      return;
    }

    case 'ride_live_update':
    case 'ride_driver_offered': {
      if (typeof rideId !== 'string' || !rideId) return;
      // The notification may have been tapped after the trip advanced; SQL is
      // authoritative, not the status carried by the old notification.
      try {
        const start = Date.now();
        while (Date.now() - start < 10000) {
          if (navigationRef.isReady() && navigationRef.getRootState()?.routeNames.includes('ClientHome')) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!navigationRef.isReady() || !navigationRef.getRootState()?.routeNames.includes('ClientHome')) return;
        const ride = await getRideDetail(rideId);
        const status = String(ride.status || '').toLowerCase();
        if (['requested', 'driver_offered'].includes(status)) {
          navigate('HomeOffers', { rideId: ride.id });
        } else if (['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'].includes(status) && ride.driverId) {
          navigate('RideTracking', {
            rideId: ride.id,
            driverId: ride.driverId,
            driverName: '',
            vehiclePlate: '',
            estimatedFare: ride.finalFare || ride.estimatedPrice || 0,
          });
        } else if (['pending_payment', 'completed'].includes(status)) {
          const amount = ride.finalFare || ride.estimatedPrice || 0;
          if (ride.paymentType === 'card' || ride.paymentType === 'card_local') {
            navigate('Payment', { rideId: ride.id, amount, driverId: ride.driverId, isPendingPayment: true });
          } else {
            navigate('CashPayment', { rideId: ride.id, amount, driverName: 'Conductor' });
          }
        } else {
          navigate('ClientHome');
        }
      } catch (error) {
        console.warn('[notificationRouter] No se pudo abrir el viaje:', error);
      }
      return;
    }

    case 'support_call': {
      // Llamada entrante de soporte → abrir la pantalla de llamada (el listener
      // global useIncomingCalls también cubre foreground; esto es el tap al push).
      const complaintId = typeof data?.complaintId === 'string' ? data.complaintId : null;
      const ready = await waitForNavigation();
      if (!ready) return;
      if (complaintId) {
        navigate('SupportCall', { complaintId } as any);
      } else {
        navigate('SupportChat', {} as any);
      }
      return;
    }

    case 'new_ride':
    case 'ride_accepted':
    case 'ride_started':
    case 'ride_completed':
    case 'ride_canceled':
    case 'ride_requested':
    case 'ride_assigned':
    case 'ride_driver_on_route':
    case 'ride_completed_rating':
    case 'ride_canceled_client':
    case 'ride_canceled_driver':
    case 'programmed_ride_created':
    case 'programmed_ride_driver_assigned':
    case 'programmed_ride_driver_confirmed':
    case 'programmed_ride_canceled_by_client':
    case 'programmed_ride_canceled_by_driver':
    case 'programmed_ride_canceled':
    case 'programmed_ride_activated':
    case 'programmed_ride_reminder':
    case 'programmed_ride_confirmation':
    case 'support_call_request':
    case 'admin_notice':
    case 'general':
    case 'test': {
      // These types don't require navigation on tap
      console.log('ℹ️ [notificationRouter] No navigation for type:', type);
      return;
    }

    default:
      console.log('ℹ️ [notificationRouter] Unknown notification type:', type);
      return;
  }
};
