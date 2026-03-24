export type PreflightRole = 'driver' | 'client';

// Información de región/respaldo de área de servicio calculada en el preflight
export type ServiceAreaPoint = {
  lat: number;
  lng: number;
};

export type PreflightRegionInfo = {
  allowed: boolean;
  serviceAreaId: string | null;
  areaName?: string;
  message?: string;
  reasonCode?: string;
  latitude?: number;
  longitude?: number;
  polygon?: ServiceAreaPoint[];
};

export type PreflightRouteConfig = {
  role?: PreflightRole;
  successRoute?: string;
  activeRideRoute?: string;
  rideTrackingRoute?: string;
  waitingRideRoute?: string;
  pendingPaymentsRoute?: string;
  rechargeFundsRoute?: string;
  pendingApprovalRoute?: string;
};

export type DriverApprovalStatus = 'active' | 'pending' | 'suspended' | 'rejected';
export type DriverDocumentsStatus = 'verified' | 'pending' | 'suspended' | 'rejected';

export type PreflightTermsSummary = {
  currentVersion: string;
  acceptedVersion?: string;
  acceptedAt?: number;
};

export type PreflightDriverApprovalSummary = {
  allowed: boolean;
  accountStatus: DriverApprovalStatus;
  documentsStatus: DriverDocumentsStatus;
  hasActiveVehicle: boolean;
};

export type PreflightPendingPaymentsSummary = {
  type: PreflightRole;
  count: number;
  amount: number;
  firstRideId?: string;
  firstAmount?: number;
  firstPaymentMethod?: string;
};

export type PreflightPenaltiesSummary = {
  pendingAmount: number;
  pendingCount: number;
};

export type PreflightRechargeFundsSummary = {
  availableBalance: number;
  blocked: boolean;
};

export type PreflightActiveRideSummary = {
  rideId: string;
  status: string;
  roleView: 'driver' | 'client_waiting' | 'client_tracking';
  routeHint: 'active' | 'waiting' | 'tracking';
  metadata?: Record<string, any>;
};

export type PreflightProgrammedRideSummary = {
  type: 'programmed_ride_client_confirm' | 'programmed_ride_driver_confirm';
  rideId: string;
  scheduledAt?: number;
};

export type GetPreflightDataRequest = {
  role: PreflightRole;
  userId?: string;
  platform?: string;
  appVersion?: string;
  location?: {
    lat: number;
    lng: number;
  } | null;
};

export type GetPreflightDataResponse = {
  success: boolean;
  role: PreflightRole;
  userId: string;
  timestamp: number;
  latencyMs?: number;
  region?: PreflightRegionInfo | null;
  terms?: PreflightTermsSummary | null;
  driverApproval?: PreflightDriverApprovalSummary | null;
  activeRide?: PreflightActiveRideSummary | null;
  programmedRide?: PreflightProgrammedRideSummary | null;
  pendingPayments?: PreflightPendingPaymentsSummary | null;
  penalties?: PreflightPenaltiesSummary | null;
  rechargeFunds?: PreflightRechargeFundsSummary | null;
};
 