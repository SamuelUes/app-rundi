import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { Vehicle } from './useDriverProfile';
import { normalizeDocumentsStatus, normalizeAccountStatus } from '../../../utils/driver/driverStatus';
import {
  hasCompleteDocuments,
  getDocumentStatusColor,
  getDocumentStatusIconName,
  getDocumentStatusText,
  getDocumentButtonLabel,
  getDisplayName,
  getDisplayEmail,
  getDesignatedStatusLabel,
  getDesignatedStatusHelper,
  getDesignatedButtonLabel,
  isVehicleComplete,
} from '../../../utils/driver/driverProfileHelpers';

interface UseDriverProfileDerivedParams {
  driverData: any;
  user: { id?: string; name?: string; email?: string; role?: string } | null;
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  designatedDriverRequestStatus: string | null;
  loadingRequestStatus: boolean;
  t: TFunction;
}

export function useDriverProfileDerived({
  driverData,
  user,
  vehicles,
  designatedDriverRequestStatus,
  loadingRequestStatus,
  t,
}: UseDriverProfileDerivedParams) {
  const normalizedDocumentStatus = normalizeDocumentsStatus(driverData);
  const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';

  const hasActiveVehicle = useMemo(
    () => Array.isArray(vehicles) && vehicles.some((vehicle) => (vehicle.is_active ?? vehicle.isActive) === true),
    [vehicles],
  );

  const normalizedAccountStatus = useMemo(() => normalizeAccountStatus(driverData), [driverData]);
  const completeDocs = hasCompleteDocuments(driverData);

  const driverLicenseExpiry = driverData?.license_expiry || driverData?.licenseExpiry || null;

  const documentStatusColor = getDocumentStatusColor(normalizedDocumentStatus, completeDocs);
  const documentStatusIconName = getDocumentStatusIconName(normalizedDocumentStatus);
  const documentStatusText = getDocumentStatusText(normalizedDocumentStatus, completeDocs, t);
  const documentButtonLabel = getDocumentButtonLabel(normalizedDocumentStatus, completeDocs, t);

  const displayName = getDisplayName(driverData, user?.name, t);
  const displayEmail = getDisplayEmail(driverData, user?.email);

  const normalizedDesignatedRequestStatus = designatedDriverRequestStatus
    ? String(designatedDriverRequestStatus).toLowerCase()
    : null;

  const isDesignatedRequestPending = normalizedDesignatedRequestStatus === 'requested';
  const isDesignatedDriverApproved = normalizedDesignatedRequestStatus === 'approved' || normalizedDesignatedRequestStatus === 'verified';
  const isDesignatedRequestRejected = normalizedDesignatedRequestStatus === 'rejected' || normalizedDesignatedRequestStatus === 'revoked';

  const designatedStatusLabel = getDesignatedStatusLabel(normalizedDesignatedRequestStatus, t);
  const designatedStatusHelper = getDesignatedStatusHelper(normalizedDesignatedRequestStatus, t);
  const designatedButtonLabel = getDesignatedButtonLabel(
    isDesignatedDriverApproved,
    isDesignatedRequestPending,
    isDesignatedRequestRejected,
    t,
  );

  const designatedButtonDisabled =
    loadingRequestStatus || isDesignatedRequestPending || isDesignatedDriverApproved || isDesignatedRequestRejected;

  return {
    normalizedDocumentStatus,
    normalizedAccountStatus,
    isDriverCapable,
    hasActiveVehicle,
    completeDocs,
    driverLicenseExpiry,
    documentStatusColor,
    documentStatusIconName,
    documentStatusText,
    documentButtonLabel,
    displayName,
    displayEmail,
    isDesignatedRequestPending,
    isDesignatedDriverApproved,
    isDesignatedRequestRejected,
    designatedStatusLabel,
    designatedStatusHelper,
    designatedButtonLabel,
    designatedButtonDisabled,
  };
}
