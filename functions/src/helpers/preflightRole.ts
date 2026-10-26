export type PreflightMode = 'client' | 'driver';

export function canRequestPreflightMode(profileRole: unknown, requestedMode: PreflightMode): boolean {
  const role = typeof profileRole === 'string' ? profileRole.trim().toLowerCase() : '';

  if (role === 'driver' || role === 'designated_driver') {
    return true;
  }

  return (role === 'client' || role === 'admin') && requestedMode === 'client';
}
