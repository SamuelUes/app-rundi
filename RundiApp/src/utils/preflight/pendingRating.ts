import type { GetPreflightDataResponse } from '../../types/preflight';

export function clientRatingAfterPreflight(data: GetPreflightDataResponse | null | undefined) {
  if (!data || data.role !== 'client' || data.activeRide || data.programmedRide || data.pendingPayments?.count) {
    return null;
  }
  return data.pendingRating?.status === 'pending' ? data.pendingRating : null;
}
