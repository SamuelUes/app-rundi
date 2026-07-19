import type { DriverData } from '../hooks/driver/DriverProfileScreen/useDriverProfile';

export function normalizeDocumentsStatus(driver: DriverData | null): string | null {
  if (!driver) return null;

  const raw = driver.documentsStatus || driver.documents_status || '';
  if (!raw) return null;

  const normalized = String(raw).toLowerCase();

  if (['verified'].includes(normalized)) return 'verified';
  if (['pending', 'pending_verification', 'in_review', 'under_review', 'review', 'verifying'].includes(normalized)) return 'pending';
  if (['suspended'].includes(normalized)) return 'suspended';
  if (['rejected', 'declined', 'denied'].includes(normalized)) return 'rejected';

  return normalized;
}

export function normalizeAccountStatus(driver: DriverData | null): string | null {
  if (!driver) return null;

  const raw = driver.accountStatus || driver.account_status || driver.status || '';
  if (!raw) return null;

  const normalized = String(raw).toLowerCase();

  if (['active', 'verified', 'approved'].includes(normalized)) return 'active';
  if (['pending', 'pending_verification', 'in_review'].includes(normalized)) return 'pending';
  if (['suspended'].includes(normalized)) return 'suspended';
  if (['rejected', 'disabled', 'denied'].includes(normalized)) return 'rejected';

  return 'pending';
}
