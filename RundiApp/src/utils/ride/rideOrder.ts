export function rideRequestedAtMillis(value: unknown): number | null {
  if (value && typeof value === 'object') {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if ('toMillis' in value && typeof value.toMillis === 'function') {
      const millis = value.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function compareRideOrder(
  a: { distance?: number | null; requestedAt?: unknown; id?: unknown },
  b: { distance?: number | null; requestedAt?: unknown; id?: unknown },
): number {
  const distanceA = typeof a.distance === 'number' && Number.isFinite(a.distance) ? a.distance : Infinity;
  const distanceB = typeof b.distance === 'number' && Number.isFinite(b.distance) ? b.distance : Infinity;
  if (distanceA !== distanceB) return distanceA < distanceB ? -1 : 1;
  const timeA = rideRequestedAtMillis(a.requestedAt) ?? Infinity;
  const timeB = rideRequestedAtMillis(b.requestedAt) ?? Infinity;
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}
