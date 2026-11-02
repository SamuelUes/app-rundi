import type { Vehicle } from '../../hooks/driver/DriverProfileScreen/useDriverProfile';
import type { DriverData } from '../../hooks/driver/DriverProfileScreen/useDriverProfile';
import { formatCurrency } from '../format/safeFormatters';

export { formatCurrency };

export const getDocumentIconName = (type: string): string => {
  switch (type) {
    case 'license':
      return 'badge';
    case 'registration':
      return 'description';
    case 'insurance':
      return 'security';
    default:
      return 'assignment';
  }
};

export const getDocumentName = (type: string, t: (key: string) => string): string => {
  switch (type) {
    case 'license':
      return t('driver.profile.documents.types.license');
    case 'registration':
      return t('driver.profile.documents.types.registration');
    case 'insurance':
      return t('driver.profile.documents.types.insurance');
    default:
      return t('driver.profile.documents.types.default');
  }
};

export const getStatusColor = (
  status: string,
  fallbackColor: string,
): string => {
  switch (status) {
    case 'verified':
      return '#4CAF50';
    case 'pending':
      return '#FF9800';
    case 'rejected':
      return '#f44336';
    default:
      return fallbackColor;
  }
};

export const getStatusText = (
  status: string,
  t: (key: string) => string,
): string => {
  switch (status) {
    case 'verified':
      return t('driver.profile.documents.status.verified');
    case 'pending':
      return t('driver.profile.documents.status.pending');
    case 'rejected':
      return t('driver.profile.documents.status.rejected');
    default:
      return t('driver.profile.documents.status.missing');
  }
};

export const isVehicleComplete = (vehicle: Vehicle): boolean => {
  const hasBasicInfo =
    vehicle.plate &&
    vehicle.brand &&
    vehicle.model &&
    vehicle.year &&
    vehicle.color &&
    vehicle.type;
  const hasRegistration =
    vehicle.registrationNumber &&
    vehicle.registrationExpiry &&
    vehicle.registrationPhotoFront &&
    vehicle.registrationPhotoBack;
  const hasInsurance =
    vehicle.insuranceNumber &&
    vehicle.insuranceCompany &&
    vehicle.insuranceExpiry &&
    vehicle.insurancePhoto;
  const hasVehiclePhoto = vehicle.vehiclePhoto;

  return !!(hasBasicInfo && hasRegistration && hasInsurance && hasVehiclePhoto);
};

export const getIncompleteReason = (
  vehicle: Vehicle,
  t: (key: string) => string,
): string => {
  const issues: string[] = [];

  if (!vehicle.plate || !vehicle.brand || !vehicle.model || !vehicle.year || !vehicle.color || !vehicle.type) {
    issues.push(t('driver.profile.alerts.vehicles.issues.basicInfo'));
  }
  if (!vehicle.registrationNumber || !vehicle.registrationExpiry || !vehicle.registrationPhotoFront || !vehicle.registrationPhotoBack) {
    issues.push(t('driver.profile.alerts.vehicles.issues.registration'));
  }
  if (!vehicle.insuranceNumber || !vehicle.insuranceCompany || !vehicle.insuranceExpiry || !vehicle.insurancePhoto) {
    issues.push(t('driver.profile.alerts.vehicles.issues.insurance'));
  }
  if (!vehicle.vehiclePhoto) {
    issues.push(t('driver.profile.alerts.vehicles.issues.vehiclePhoto'));
  }

  return issues.join(', ');
};

export const hasBothLicensePhotos = (driverData: DriverData | null): boolean =>
  Boolean(
    driverData &&
      ((driverData.license_photo_front || driverData.licensePhotoFront) &&
        (driverData.license_photo_back || driverData.licensePhotoBack)),
  );

export const hasSingleLicensePhoto = (driverData: DriverData | null): boolean =>
  Boolean(driverData && (driverData.license_photo || driverData.licensePhoto));

export const hasLicenseNumber = (driverData: DriverData | null): boolean =>
  Boolean(driverData && (driverData.license_number || driverData.licenseNumber));

export const hasLicenseExpiry = (driverData: DriverData | null): boolean =>
  Boolean(driverData && (driverData.license_expiry || driverData.licenseExpiry));

export const hasCompleteDocuments = (driverData: DriverData | null): boolean =>
  Boolean(
    driverData &&
      (hasBothLicensePhotos(driverData) || hasSingleLicensePhoto(driverData)) &&
      hasLicenseNumber(driverData) &&
      hasLicenseExpiry(driverData),
  );

export const getDocumentStatusColor = (
  normalizedDocumentStatus: string | null,
  hasCompleteDocs: boolean,
): string => {
  if (normalizedDocumentStatus === 'verified') return '#4CAF50';
  if (normalizedDocumentStatus === 'rejected' || normalizedDocumentStatus === 'suspended') return '#f44336';
  if (normalizedDocumentStatus === 'pending') return '#FF9800';
  return hasCompleteDocs ? '#4CAF50' : '#FF9800';
};

export const getDocumentStatusIconName = (
  normalizedDocumentStatus: string | null,
): 'check' | 'close' | 'warning' | 'schedule' => {
  if (normalizedDocumentStatus === 'verified') return 'check';
  if (normalizedDocumentStatus === 'rejected') return 'close';
  if (normalizedDocumentStatus === 'suspended') return 'warning';
  return 'schedule';
};

export const getDocumentStatusText = (
  normalizedDocumentStatus: string | null,
  hasCompleteDocs: boolean,
  t: (key: string) => string,
): string => {
  if (normalizedDocumentStatus === 'verified') return t('driver.profile.documents.status.verified');
  if (normalizedDocumentStatus === 'rejected') return t('driver.profile.documents.status.rejected');
  if (normalizedDocumentStatus === 'suspended') return t('driver.profile.documents.status.suspended');
  if (normalizedDocumentStatus === 'pending') return t('driver.profile.documents.status.pending');
  return hasCompleteDocs
    ? t('driver.profile.documents.status.complete')
    : t('driver.profile.documents.status.missing');
};

export const getDocumentButtonLabel = (
  normalizedDocumentStatus: string | null,
  hasCompleteDocs: boolean,
  t: (key: string) => string,
): string => {
  if (normalizedDocumentStatus === 'verified') return t('driver.profile.documents.button.view');
  if (normalizedDocumentStatus === 'pending') return t('driver.profile.documents.button.details');
  if (normalizedDocumentStatus === 'rejected' || normalizedDocumentStatus === 'suspended')
    return t('driver.profile.documents.button.fix');
  return hasCompleteDocs
    ? t('driver.profile.documents.button.submit')
    : t('driver.profile.documents.button.complete');
};

export const getDisplayName = (
  driverData: DriverData | null,
  userName: string | undefined,
  t: (key: string) => string,
): string => {
  const firstName =
    driverData?.firstName ||
    driverData?.first_name ||
    userName?.split(' ')?.[0] ||
    userName ||
    t('driver.profile.header.nameFallback');
  const lastName = driverData?.lastName || driverData?.last_name || '';
  return [firstName, lastName].filter(Boolean).join(' ').trim() || t('driver.profile.header.nameFallback');
};

export const getDisplayEmail = (
  driverData: DriverData | null,
  userEmail: string | undefined,
): string | null => driverData?.email || userEmail || null;

export const getDesignatedStatusLabel = (
  normalizedStatus: string | null,
  t: (key: string) => string,
): string => {
  const labelMap: Record<string, string> = {
    pending: t('driver.profile.designated.statusLabel.pending'),
    requested: t('driver.profile.designated.statusLabel.requested'),
    approved: t('driver.profile.designated.statusLabel.approved'),
    verified: t('driver.profile.designated.statusLabel.verified'),
    rejected: t('driver.profile.designated.statusLabel.rejected'),
    revoked: t('driver.profile.designated.statusLabel.revoked'),
  };
  return normalizedStatus
    ? labelMap[normalizedStatus] || t('driver.profile.designated.statusLabel.unknown')
    : t('driver.profile.designated.statusLabel.pending');
};

export const getDesignatedStatusHelper = (
  normalizedStatus: string | null,
  t: (key: string) => string,
): string => {
  const helperMap: Record<string, string> = {
    pending: t('driver.profile.designated.statusHelper.pending'),
    requested: t('driver.profile.designated.statusHelper.requested'),
    approved: t('driver.profile.designated.statusHelper.approved'),
    verified: t('driver.profile.designated.statusHelper.verified'),
    rejected: t('driver.profile.designated.statusHelper.rejected'),
    revoked: t('driver.profile.designated.statusHelper.revoked'),
  };
  return normalizedStatus
    ? helperMap[normalizedStatus] || t('driver.profile.designated.statusHelper.default')
    : t('driver.profile.designated.statusHelper.default');
};

export const getDesignatedButtonLabel = (
  isApproved: boolean,
  isPending: boolean,
  isRejected: boolean,
  t: (key: string) => string,
): string => {
  if (isApproved) return t('driver.profile.designated.button.approved');
  if (isPending) return t('driver.profile.designated.button.pending');
  if (isRejected) return t('driver.profile.designated.button.rejected');
  return t('driver.profile.designated.button.default');
};
