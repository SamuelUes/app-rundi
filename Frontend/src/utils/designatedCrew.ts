import type { CrewCandidateStatus, CrewRole } from '../types/designatedCrew';

export function getCrewRoleForRide(ride: any, uid: string | null | undefined): CrewRole | null {
  if (!ride || !uid || !ride.followerId) return null;
  if (ride.driverId === uid) return 'captain';
  if (ride.followerId === uid) return 'follower';
  return null;
}

export function isCandidateSelectable(status: CrewCandidateStatus): boolean {
  return status === 'available';
}

export function shouldShowSeparateCrewMarkers(ride: any): boolean {
  const status = String(ride?.status || '').toLowerCase();
  return !!ride?.followerId && ride?.follower?.status === 'active' && status === 'in_progress';
}

export function formatApproxAmount(value: number, formatCurrency: (value: number) => string): string {
  return `± ${formatCurrency(value)}`;
}

export function isFollowerWaitingPayment(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase() === 'pending_payment';
}
