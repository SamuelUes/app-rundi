import notificationService from './notificationService';

export type LiveRideStatus =
  | 'driver_assigned'
  | 'driver_on_route'
  | 'arrived_pickup'
  | 'trip_in_progress'
  | 'completed'
  | 'canceled';

export interface LiveRideUpdatePayload {
  rideId: string;
  status: LiveRideStatus;
  driverName?: string | null;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  progress?: number | null;
  expiresInMs?: number;
}

const STATUS_COPY: Record<LiveRideStatus, { title: string; subtitle: string }> = {
  driver_assigned: {
    title: 'Conductor confirmado',
    subtitle: 'Estamos preparando tu viaje',
  },
  driver_on_route: {
    title: 'Conductor en camino',
    subtitle: 'Dirigiéndose al punto de recogida',
  },
  arrived_pickup: {
    title: 'Conductor llegó',
    subtitle: 'Sal a su encuentro',
  },
  trip_in_progress: {
    title: 'Viaje en progreso',
    subtitle: 'En camino a tu destino',
  },
  completed: {
    title: 'Viaje finalizado',
    subtitle: 'Revisa y califica tu experiencia',
  },
  canceled: {
    title: 'Viaje cancelado',
    subtitle: 'La solicitud fue cancelada',
  },
};

const DEFAULT_PROGRESS: Record<LiveRideStatus, number> = {
  driver_assigned: 0.15,
  driver_on_route: 0.35,
  arrived_pickup: 0.55,
  trip_in_progress: 0.8,
  completed: 1,
  canceled: 0,
};

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const parseNumber = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatEta = (etaMinutes?: number | null) => {
  if (!etaMinutes || !Number.isFinite(etaMinutes)) {
    return null;
  }
  return `${Math.max(1, Math.round(etaMinutes))} min`;
};

const formatDistance = (distanceKm?: number | null) => {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm)) {
    return null;
  }
  return `${distanceKm.toFixed(1)} km`;
};

const buildProgressBar = (progress?: number | null) => {
  const normalized = clamp(progress ?? 0, 0, 1);
  const segments = 8;
  const filled = Math.round(normalized * segments);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(Math.max(segments - filled, 0))}`;
  const percent = Math.round(normalized * 100);
  return `${bar} ${percent}%`;
};

const resolveStatus = (rawStatus?: string | null): LiveRideStatus => {
  const status = (rawStatus || '').toLowerCase();
  if (status.includes('canceled')) {
    return 'canceled';
  }
  if (status === 'driver_on_route') {
    return 'driver_on_route';
  }
  if (status === 'driver_arrived') {
    return 'arrived_pickup';
  }
  if (status === 'accepted' || status === 'driver_assigned' || status === 'driver_offered') {
    return 'driver_assigned';
  }
  if (status === 'in_progress') {
    return 'trip_in_progress';
  }
  if (status === 'pending_payment' || status === 'completed') {
    return 'completed';
  }
  return 'driver_assigned';
};

class LiveRideNotificationService {
  private keyFor(rideId: string) {
    return `live-ride-${rideId}`;
  }

  async updateFromApp(payload: LiveRideUpdatePayload) {
    await this.showNotification(payload);
  }

  async presentFromPush(data: any) {
    const rideId = typeof data?.rideId === 'string' ? data.rideId : null;
    if (!rideId) {
      return;
    }

    const status = resolveStatus(typeof data?.status === 'string' ? data.status : undefined);
    const etaMinutes = parseNumber(data?.etaMinutes ?? data?.fallbackEtaMinutes);
    const distanceKm = parseNumber(data?.distanceKm ?? data?.fallbackDistanceKm);
    const progress = parseNumber(data?.progress);

    await this.showNotification({
      rideId,
      status,
      driverName: typeof data?.driverName === 'string' ? data.driverName : undefined,
      etaMinutes,
      distanceKm,
      progress,
      expiresInMs: parseNumber(data?.expiresInMs) ?? undefined,
    });
  }

  async dismiss(rideId?: string | null) {
    if (!rideId) return;
    try {
      await notificationService.dismissManagedNotification(this.keyFor(rideId));
    } catch (error) {
      console.warn('[liveRideNotification] Error dismissing notification:', error);
    }
  }

  private async showNotification(payload: LiveRideUpdatePayload) {
    const statusCopy = STATUS_COPY[payload.status];
    const etaText = formatEta(payload.etaMinutes);
    const distanceText = formatDistance(payload.distanceKm);
    const progress = typeof payload.progress === 'number' ? clamp(payload.progress) : DEFAULT_PROGRESS[payload.status];
    const segments = [statusCopy.subtitle];

    if (payload.driverName) {
      segments.unshift(payload.driverName);
    }

    const metrics: string[] = [];
    if (etaText) metrics.push(`ETA ${etaText}`);
    if (distanceText) metrics.push(distanceText);

    if (metrics.length) {
      segments.push(metrics.join(' • '));
    }

    segments.push(buildProgressBar(progress));

    await notificationService.showManagedNotification(
      statusCopy.title,
      segments.filter(Boolean).join('\n'),
      {
        type: 'ride_live_update',
        rideId: payload.rideId,
        status: payload.status,
        driverName: payload.driverName ?? undefined,
        etaMinutes: payload.etaMinutes ? String(payload.etaMinutes) : undefined,
        distanceKm: payload.distanceKm ? String(payload.distanceKm) : undefined,
      },
      this.keyFor(payload.rideId),
      payload.expiresInMs ?? 15 * 60 * 1000,
    );
  }
}

export default new LiveRideNotificationService();
