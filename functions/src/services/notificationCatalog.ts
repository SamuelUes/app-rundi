export type NotificationType =
  | 'ride_requested'
  | 'ride_driver_offered'
  | 'ride_assigned'
  | 'ride_driver_on_route'
  | 'ride_completed'
  | 'ride_completed_rating'
  | 'ride_canceled_client'
  | 'ride_canceled_driver'
  | 'programmed_ride_created'
  | 'programmed_ride_driver_assigned'
  | 'programmed_ride_driver_confirmed'
  | 'programmed_ride_canceled_by_client'
  | 'programmed_ride_canceled_by_driver'
  | 'programmed_ride_reminder'
  | 'programmed_ride_confirmation'
  | 'programmed_ride_client_confirm'
  | 'programmed_ride_driver_confirm'
  | 'programmed_ride_activated'
  | 'programmed_ride_canceled'
  | 'ride_live_update'
  | 'proximity_ride'
  | 'support_chat'
  | 'support_ticket_message'
  | 'support_call'
  | 'quick_return_active_ride'
  | 'general'
  | 'test'
  | 'admin_notice';

export type LiveRideStatus =
  | 'driver_assigned'
  | 'driver_on_route'
  | 'arrived_pickup'
  | 'trip_in_progress'
  | 'completed'
  | 'canceled';

export interface NotificationCatalogEntry {
  i18nKey?: string;
  androidChannelId: string;
  ttlMs: number;
  route?: string;
  notificationKeyPrefix?: string;
}

export const notificationCatalog: Record<NotificationType, NotificationCatalogEntry> = {
  ride_requested: {
    i18nKey: 'ride_request_sent',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_driver_offered: {
    i18nKey: 'driver_available',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_assigned: {
    i18nKey: 'ride_assigned',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_driver_on_route: {
    i18nKey: 'driver_on_way',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_completed: {
    i18nKey: 'ride_completed',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_completed_rating: {
    i18nKey: 'ride_completed_rating',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_canceled_client: {
    i18nKey: 'ride_canceled_client',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  ride_canceled_driver: {
    i18nKey: 'ride_canceled_driver',
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'ride',
  },
  programmed_ride_created: {
    i18nKey: 'ride_scheduled',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_driver_assigned: {
    i18nKey: 'driver_assigned',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_driver_confirmed: {
    i18nKey: 'driver_confirmed',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_canceled_by_client: {
    i18nKey: 'scheduled_canceled_by_client',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_canceled_by_driver: {
    i18nKey: 'scheduled_canceled_by_driver',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_reminder: {
    i18nKey: 'programmed_ride_reminder',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_confirmation: {
    i18nKey: 'programmed_ride_confirmation',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_client_confirm: {
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    route: 'ClientPreflight',
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_driver_confirm: {
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    route: 'DriverPreflight',
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_activated: {
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  programmed_ride_canceled: {
    i18nKey: 'scheduled_canceled_by_client',
    androidChannelId: 'default',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'programmed-ride',
  },
  ride_live_update: {
    androidChannelId: 'active-ride',
    ttlMs: 15 * 60 * 1000,
    notificationKeyPrefix: 'live-ride',
  },
  proximity_ride: {
    androidChannelId: 'default',
    ttlMs: 10_000,
    route: 'RidePreview',
    notificationKeyPrefix: 'proximity-ride',
  },
  support_chat: {
    androidChannelId: 'default',
    ttlMs: 120_000,
    route: 'SupportChat',
    notificationKeyPrefix: 'support',
  },
  support_ticket_message: {
    androidChannelId: 'default',
    ttlMs: 120_000,
    route: 'SupportChat',
    notificationKeyPrefix: 'support',
  },
  support_call: {
    androidChannelId: 'default',
    ttlMs: 120_000,
    notificationKeyPrefix: 'support',
  },
  quick_return_active_ride: {
    androidChannelId: 'default',
    ttlMs: 120_000,
    route: 'ActiveRide',
    notificationKeyPrefix: 'quick-return',
  },
  general: {
    androidChannelId: 'default',
    ttlMs: 120_000,
  },
  test: {
    androidChannelId: 'default',
    ttlMs: 120_000,
  },
  admin_notice: {
    androidChannelId: 'default',
    ttlMs: 24 * 60 * 60 * 1000,
  },
};

export const liveRideStatusCatalog: Record<LiveRideStatus, { i18nKey: string }> = {
  driver_assigned: { i18nKey: 'live_ride_driver_assigned' },
  driver_on_route: { i18nKey: 'live_ride_driver_on_route' },
  arrived_pickup: { i18nKey: 'live_ride_arrived_pickup' },
  trip_in_progress: { i18nKey: 'live_ride_trip_in_progress' },
  completed: { i18nKey: 'live_ride_completed' },
  canceled: { i18nKey: 'live_ride_canceled' },
};

export const getCatalogEntry = (type: string): NotificationCatalogEntry | undefined => {
  return notificationCatalog[type as NotificationType];
};

export const getLiveRideI18nKey = (status: string): string | undefined => {
  return liveRideStatusCatalog[status as LiveRideStatus]?.i18nKey;
};
