import { Platform } from 'react-native';
import { RideProgressModule } from '../../modules/rundi-native/src';
import i18n from '../i18n';
import { normalizeVehicleType } from '../utils/driver/vehicleIcons';

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

const translate = (key: string, fallback: string, options?: Record<string, any>): string => {
  const value = i18n.t(key, options) as string;
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
    /** Tipo de vehículo (se normaliza a las claves de vehicleIcons) → largeIcon. */
    vehicleType?: string | null;
    /** Nombre de la contraparte (cliente para el conductor, conductor para el cliente). */
    partyName?: string | null;
    fare?: number | null;
    paymentMethod?: string | null;
  }) {
    if (!isAndroid || !RideProgressModule) return;

    const status = (args.status || '').trim().toLowerCase();
    try {
      if (HIDDEN_STATUSES.has(status) || !status) {
        await RideProgressModule.hideRideProgress();
        return;
      }
      const statusLabel = translate(`shared.rideProgress.status.${status}`, status);
      const fare = Math.round(args.fare ?? 0);
      const fareLabel =
        fare > 0 ? translate('shared.rideProgress.fare', `C$${fare}`, { amount: fare }) : null;
      // El precio va en el titular junto al estado (posición "headline" tipo
      // Maps) — setSubText lo mostraba colado en la línea del nombre de app.
      const title = fareLabel ? `${statusLabel} · ${fareLabel}` : statusLabel;
      const body =
        [args.partyName, args.destinationAddress].filter(Boolean).join(' · ') ||
        translate('shared.rideProgress.title', 'Viaje Rundi');
      const subText =
        args.paymentMethod === 'cash' || args.paymentMethod === 'card'
          ? translate(`shared.rideProgress.payment.${args.paymentMethod}`, args.paymentMethod)
          : null;
      const actionLabel = translate('shared.rideProgress.open', 'Ver viaje');
      await RideProgressModule.showRideProgress(
        args.rideId,
        title,
        body,
        STATUS_PROGRESS[status] ?? -1,
        normalizeVehicleType(args.vehicleType),
        subText,
        actionLabel,
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
