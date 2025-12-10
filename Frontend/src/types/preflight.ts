export type PreflightRole = 'driver' | 'client';

// Información de región/respaldo de área de servicio calculada en el preflight
export type PreflightRegionInfo = {
  allowed: boolean;
  serviceAreaId: string | null;
  areaName?: string;
  message?: string;
  reasonCode?: string;
  latitude?: number;
  longitude?: number;
};

export type PreflightRouteConfig = {
  role?: PreflightRole;
  successRoute?: string;
  activeRideRoute?: string;
  rideTrackingRoute?: string;
  pendingPaymentsRoute?: string;
  payCommissionsRoute?: string;
  pendingApprovalRoute?: string;
};
