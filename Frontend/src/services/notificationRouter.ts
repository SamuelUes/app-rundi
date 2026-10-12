import { navigate, navigationRef } from '../navigation/NavigationService';

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

    case 'quick_return_active_ride': {
      if (typeof rideId !== 'string') return;
      const isDriver = options?.userRole === 'driver' || options?.userRole === 'designated_driver';
      if (!isDriver) return;
      const doNavigate = () => navigate('ActiveRide', { rideId });
      if (delay > 0) {
        setTimeout(doNavigate, delay);
      } else {
        doNavigate();
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

    case 'ride_live_update': {
      // Handled by liveRideNotificationService for display, no navigation needed
      return;
    }

    case 'new_ride':
    case 'ride_accepted':
    case 'ride_started':
    case 'ride_completed':
    case 'ride_canceled':
    case 'ride_requested':
    case 'ride_driver_offered':
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
    case 'support_call':
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
