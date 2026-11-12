import { Platform } from 'react-native';
import { RideProgressModule } from '../../modules/rundi-native/src';
import i18n from '../i18n';

const isAndroid = Platform.OS === 'android';

const STATUS_PROGRESS: Record<string, number> = {
  requested: 10,
  driver_offered: 25,
  accepted: 25,
  driver_on_route: 50,
  driver_arrived: 70,
  in_progress: 90,
};

const HIDDEN_STATUSES = new Set([
  'completed',
  'canceled',
  'cancelled',
  'rating_completed',
  'pending_payment',
]);

const translate = (key: string, fallback: string): string => {
  const value = i18n.t(key) as string;
  return !value || value === key ? fallback : value;
};

/**
 * Notificación ongoing de progreso del viaje (solo Android; iOS usa el
 * Live Activity de overlayManager). No-op seguro en cualquier fallo.
 */
export const rideProgressNotification = {
  async updateForRide(args: {
    rideId: string;
    status: string;
    destinationAddress?: string | null;
  }) {
    if (!isAndroid || !RideProgressModule) return;

    const status = (args.status || '').trim().toLowerCase();
    try {
      if (HIDDEN_STATUSES.has(status) || !status) {
        await RideProgressModule.hideRideProgress();
        return;
      }
      const title = translate('shared.rideProgress.title', 'Viaje Rundi');
      const label = translate(`shared.rideProgress.status.${status}`, status);
      const body = args.destinationAddress
        ? `${label} · ${args.destinationAddress}`
        : label;
      await RideProgressModule.showRideProgress(
        args.rideId,
        title,
        body,
        STATUS_PROGRESS[status] ?? -1,
      );
    } catch (error) {
      console.warn('[rideProgress] update error:', error);
    }
  },

  async clear() {
    if (!isAndroid || !RideProgressModule) return;
    try {
      await RideProgressModule.hideRideProgress();
    } catch (error) {
      console.warn('[rideProgress] clear error:', error);
    }
  },
};

export default rideProgressNotification;
