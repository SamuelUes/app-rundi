export type PreflightRole = 'driver' | 'client';

export type PreflightRouteConfig = {
  role?: PreflightRole;
  successRoute?: string;
  activeRideRoute?: string;
  rideTrackingRoute?: string;
  pendingPaymentsRoute?: string;
  payCommissionsRoute?: string;
};
