import { sendLiveRideUpdate } from './notificationCenter';

export type { LiveRideStatus } from './notificationCatalog';

export interface LiveRideNotificationPayload {
  userId: string | null | undefined;
  rideId: string;
  status: 'driver_assigned' | 'driver_on_route' | 'arrived_pickup' | 'trip_in_progress' | 'completed' | 'canceled';
  driverName?: string | null;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  expiresInMs?: number;
}

export const notifyLiveRideUpdate = async (payload: LiveRideNotificationPayload) => {
  await sendLiveRideUpdate(payload);
};
