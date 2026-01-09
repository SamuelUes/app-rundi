import { sendNotificationToUser } from './pushNotifications';

type LiveRideStatus =
  | 'driver_assigned'
  | 'driver_on_route'
  | 'arrived_pickup'
  | 'trip_in_progress'
  | 'completed'
  | 'canceled';

export interface LiveRideNotificationPayload {
  userId: string | null | undefined;
  rideId: string;
  status: LiveRideStatus;
  driverName?: string | null;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  expiresInMs?: number;
}

const STATUS_COPY: Record<LiveRideStatus, { title: string; body: string }> = {
  driver_assigned: {
    title: 'Conductor confirmado',
    body: 'Tu viaje fue asignado. Te avisaremos del progreso.',
  },
  driver_on_route: {
    title: 'Conductor en camino',
    body: 'Tu conductor se dirige al punto de encuentro.',
  },
  arrived_pickup: {
    title: 'Conductor llegó',
    body: 'Tu conductor está en el punto de recogida.',
  },
  trip_in_progress: {
    title: 'Viaje en progreso',
    body: 'Estás en camino a tu destino.',
  },
  completed: {
    title: 'Viaje finalizado',
    body: 'Tu viaje terminó, revisa el resumen.',
  },
  canceled: {
    title: 'Viaje cancelado',
    body: 'El viaje fue cancelado.',
  },
};

const formatValue = (value?: number | null, unit?: string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return unit ? `${value}${unit}` : String(value);
};

export const notifyLiveRideUpdate = async (
  payload: LiveRideNotificationPayload,
) => {
  if (!payload.userId || !payload.rideId) {
    return;
  }

  const statusCopy = STATUS_COPY[payload.status] ?? STATUS_COPY.driver_assigned;
  const etaText = formatValue(
    typeof payload.etaMinutes === 'number'
      ? Math.max(1, Math.round(payload.etaMinutes))
      : undefined,
    ' min',
  );
  const distanceText = formatValue(
    typeof payload.distanceKm === 'number'
      ? Number(payload.distanceKm.toFixed(1))
      : undefined,
    ' km',
  );

  const driverName = (payload.driverName || '').trim();
  const bodyParts = [statusCopy.body];

  if (driverName) {
    bodyParts.unshift(driverName);
  }
  if (etaText || distanceText) {
    bodyParts.push(
      [etaText ? `ETA ${etaText}` : null, distanceText ? distanceText : null]
        .filter(Boolean)
        .join(' • '),
    );
  }

  await sendNotificationToUser(payload.userId, {
    title: statusCopy.title,
    body: bodyParts.filter(Boolean).join('\n'),
    data: {
      type: 'ride_live_update',
      rideId: payload.rideId,
      status: payload.status,
      driverName,
      fallbackEtaMinutes: etaText ? etaText.replace(' min', '') : undefined,
      fallbackDistanceKm: distanceText ? distanceText.replace(' km', '') : undefined,
    },
    androidChannelId: 'active-ride',
    notificationKey: `live-ride-${payload.rideId}`,
    expiresInMs: payload.expiresInMs ?? 15 * 60 * 1000,
  });
};
