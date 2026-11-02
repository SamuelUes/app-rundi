import { trackEvent } from '../../api/platform';

export const AnalyticsEvents = {
  RIDE_REQUESTED: 'ride_requested',
  RIDE_ACCEPTED: 'ride_accepted',
  RIDE_DRIVER_ON_ROUTE: 'ride_driver_on_route',
  RIDE_STARTED: 'ride_started',
  RIDE_COMPLETED: 'ride_completed',
  RIDE_CANCELED: 'ride_canceled',
  DRIVER_REJECTED_RIDE: 'driver_rejected_ride',
  CLIENT_CONFIRMED_DRIVER: 'client_confirmed_driver',
} as const;

export type AnalyticsEventType = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

async function sendEvent(payload: { eventType: AnalyticsEventType | string; eventData?: Record<string, any> }) {
  try {
    await trackEvent(payload.eventType, payload.eventData ?? {});
  } catch (error) {
    console.warn('[analyticsService] Error sending analytics event', error);
  }
}

async function logEvent(eventType: AnalyticsEventType | string, eventData?: Record<string, any>) {
  await sendEvent({ eventType, eventData });
}

async function logRideEvent(eventType: AnalyticsEventType | string, rideId: string, extra?: Record<string, any>) {
  await logEvent(eventType, {
    rideId,
    ...extra,
  });
}

const analyticsService = {
  logEvent,
  logRideEvent,
};

export default analyticsService;
