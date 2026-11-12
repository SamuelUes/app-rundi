export const SUPPORT_RINGING_STATUSES = new Set(['initiated', 'ringing_client', 'ringing_operator']);
export const TERMINAL_CALL_STATUSES = new Set(['ended', 'rejected', 'missed']);
const ACTIVE_STATUSES = new Set([...SUPPORT_RINGING_STATUSES, 'accepted', 'connected']);

export function normalizeCallStatus(status?: string | null): string {
  return String(status || '').trim().toLowerCase();
}

export function isActiveSupportCall(status?: string | null): boolean {
  return ACTIVE_STATUSES.has(normalizeCallStatus(status));
}

export function compareSupportCalls(
  a: { status?: string; createdAt?: number | { toMillis?: () => number } | null },
  b: { status?: string; createdAt?: number | { toMillis?: () => number } | null },
): number {
  const rank = (status?: string) => isActiveSupportCall(status) ? 0 : TERMINAL_CALL_STATUSES.has(normalizeCallStatus(status)) ? 1 : 2;
  const difference = rank(a.status) - rank(b.status);
  if (difference) return difference;
  const time = (value: typeof a.createdAt) =>
    typeof value === 'number' ? value : value?.toMillis?.() ?? 0;
  return time(b.createdAt) - time(a.createdAt);
}
