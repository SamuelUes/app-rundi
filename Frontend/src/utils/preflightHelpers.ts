import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GetPreflightDataResponse,
  PreflightDriverApprovalSummary,
  PreflightPendingPaymentsSummary,
  PreflightRechargeFundsSummary,
  PreflightRole,
  PreflightRegionInfo,
  TermsDocumentType,
  PreflightTermsSummary,
  ServiceAreaPoint,
} from '../types/preflight';
import type { PreflightAction } from '../stores/preflightStore';
import { CURRENT_TERMS_VERSION } from '../components/shared/TermsAndConditionsModal';

export type NormalizedAccountStatus = 'active' | 'pending' | 'suspended' | 'rejected';
export type NormalizedDocumentsStatus = 'verified' | 'pending' | 'suspended' | 'rejected';

export type DriverApprovalResult = {
  allowed: boolean;
  accountStatus: NormalizedAccountStatus;
  documentsStatus: NormalizedDocumentsStatus;
  hasActiveVehicle: boolean;
};

export const ACTIVE_DRIVER_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
export const ACTIVE_CLIENT_TRACK_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
export const CLIENT_WAITING_STATUSES = ['requested', 'searching', 'pending', 'pending_confirmation'];
export const TERMS_DOCUMENTS: TermsDocumentType[] = ['general', 'users', 'designated_driver'];

export const CRITICAL_CHECKS = ['auth', 'notifications', 'foregroundLocation', 'backgroundLocation', 'overlay'];
export const DRIVER_BIOMETRIC_CONTEXT = 'app_access_preflight';
export const DRIVER_BIOMETRIC_MAX_ATTEMPTS = 3;
export const DRIVER_BIOMETRIC_RISK_WINDOW_MS = 15 * 60 * 1000;
export const recentDriverBiometricAuthByUserId = new Map<string, number>();

const DRIVER_BIOMETRIC_AUTH_STORAGE_PREFIX = '@rundi_driver_biometric_auth:';

const getDriverBiometricStorageKey = (userId: string): string =>
  `${DRIVER_BIOMETRIC_AUTH_STORAGE_PREFIX}${userId}`;

export function markDriverBiometricSuccess(userId: string, verifiedAt: number = Date.now()): void {
  recentDriverBiometricAuthByUserId.set(userId, verifiedAt);
  AsyncStorage.setItem(getDriverBiometricStorageKey(userId), String(verifiedAt)).catch((error) => {
    console.warn('⚠️ [Preflight] No se pudo persistir verificación biométrica:', error);
  });
}

export const DEFAULT_MANAGUA_POLYGON: ServiceAreaPoint[] = [
  { lat: 12.2, lng: -86.35 },
  { lat: 12.2, lng: -86.15 },
  { lat: 12.05, lng: -86.15 },
  { lat: 12.05, lng: -86.35 },
  { lat: 12.2, lng: -86.35 },
];

export function isPointInPolygon(lat: number, lng: number, polygon: ServiceAreaPoint[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function getDriverBiometricUserType(user: any, role: PreflightRole): 'driver' | 'designated_driver' | null {
  if (role !== 'driver') {
    return null;
  }

  const rawRole = String(user?.role || '')
    .trim()
    .toLowerCase();

  if (rawRole === 'designated_driver') {
    return 'designated_driver';
  }

  if (rawRole === 'driver') {
    return 'driver';
  }

  return 'driver';
}

export async function shouldRequireDriverBiometricCheck(user: any, role: PreflightRole): Promise<boolean> {
  const userType = getDriverBiometricUserType(user, role);
  if (!userType || !user?.id) {
    return false;
  }

  const now = Date.now();
  const lastSuccessAt = recentDriverBiometricAuthByUserId.get(user.id);
  if (lastSuccessAt && now - lastSuccessAt <= DRIVER_BIOMETRIC_RISK_WINDOW_MS) {
    return false;
  }

  try {
    const persisted = await AsyncStorage.getItem(getDriverBiometricStorageKey(user.id));
    const persistedAt = Number(persisted);
    if (persisted && Number.isFinite(persistedAt) && now - persistedAt <= DRIVER_BIOMETRIC_RISK_WINDOW_MS) {
      recentDriverBiometricAuthByUserId.set(user.id, persistedAt);
      return false;
    }
  } catch (error) {
    console.warn('⚠️ [Preflight] No se pudo leer cache biométrico:', error);
  }

  return true;
}

export function buildInitialTermsCheckedState(): Record<TermsDocumentType, boolean> {
  return {
    general: false,
    users: false,
    designated_driver: false,
  };
}

export function hasAcceptedAllCurrentTerms(
  termsSummary: PreflightTermsSummary | null | undefined,
  fallbackProfile?: Record<string, any> | null,
): boolean {
  const summaryAccepted = termsSummary?.acceptedAllDocuments === true;
  if (summaryAccepted) {
    return true;
  }

  const summaryDocuments = termsSummary?.acceptedDocuments;
  const summaryAllDocsAccepted =
    summaryDocuments &&
    TERMS_DOCUMENTS.every((documentType) => summaryDocuments[documentType]?.accepted === true);
  if (summaryAllDocsAccepted) {
    return true;
  }

  const acceptedVersion = termsSummary?.acceptedVersion || String(fallbackProfile?.termsVersion || '').trim();
  if (acceptedVersion === CURRENT_TERMS_VERSION) {
    return true;
  }

  const termsAcceptance =
    fallbackProfile?.termsAcceptance && typeof fallbackProfile.termsAcceptance === 'object'
      ? (fallbackProfile.termsAcceptance as Record<string, any>)
      : null;

  const acceptanceType = String(termsAcceptance?.type || '').trim().toLowerCase();
  const acceptanceVersion = String(termsAcceptance?.version || '').trim();
  if (acceptanceType === 'general' && acceptanceVersion === CURRENT_TERMS_VERSION) {
    return true;
  }

  const acceptanceDocs =
    termsAcceptance?.documents && typeof termsAcceptance.documents === 'object'
      ? (termsAcceptance.documents as Record<string, any>)
      : null;

  if (!acceptanceDocs) {
    return false;
  }

  return TERMS_DOCUMENTS.every((documentType) => {
    const documentAcceptance = acceptanceDocs[documentType];
    if (!documentAcceptance || typeof documentAcceptance !== 'object') {
      return false;
    }
    const documentVersion = String(documentAcceptance.version || '').trim();
    const accepted = documentAcceptance.accepted === true;
    return accepted && documentVersion === CURRENT_TERMS_VERSION;
  });
}

export function getLocalRegionFallback(
  t: (key: string, opts?: any) => string,
  latitude: number,
  longitude: number,
): PreflightRegionInfo {
  const isInsideDefault = isPointInPolygon(latitude, longitude, DEFAULT_MANAGUA_POLYGON);

  if (isInsideDefault) {
    return {
      allowed: true,
      serviceAreaId: 'ni-managua',
      areaName: 'Fallback Managua',
      message: t('shared.preflight.regionFallback.available'),
      reasonCode: 'OK_FALLBACK_LOCAL_POLYGON',
      latitude,
      longitude,
      polygon: DEFAULT_MANAGUA_POLYGON,
    };
  }

  return {
    allowed: false,
    serviceAreaId: null,
    areaName: undefined,
    message: t('shared.preflight.regionFallback.unavailable'),
    reasonCode: 'AREA_NOT_SUPPORTED_LOCAL_POLYGON',
    latitude,
    longitude,
    polygon: DEFAULT_MANAGUA_POLYGON,
  };
}

export const getCheckLabels = (t: (key: string, opts?: any) => string): Record<string, string> => ({
  auth: t('shared.preflight.checks.auth'),
  driverBiometric: t('shared.preflight.checks.driverBiometric'),
  notifications: t('shared.preflight.checks.notifications'),
  foregroundLocation: t('shared.preflight.checks.foregroundLocation'),
  backgroundLocation: t('shared.preflight.checks.backgroundLocation'),
  overlay: t('shared.preflight.checks.overlay'),
  activity: t('shared.preflight.checks.activity'),
  region: t('shared.preflight.checks.region'),
  rechargeFunds: t('shared.preflight.checks.rechargeFunds'),
  activeRide: t('shared.preflight.checks.activeRide'),
  programmedRideConfirm: t('shared.preflight.programmedRide.checkLabel'),
});

export function toDriverApprovalResult(
  value: PreflightDriverApprovalSummary | null | undefined,
): DriverApprovalResult | null {
  if (!value) {
    return null;
  }
  return {
    allowed: value.allowed,
    accountStatus: value.accountStatus,
    documentsStatus: value.documentsStatus,
    hasActiveVehicle: value.hasActiveVehicle,
  };
}

export function buildPendingPaymentAction(
  t: (key: string, opts?: any) => string,
  summary: PreflightPendingPaymentsSummary,
  pendingPaymentsRoute: string,
): PreflightAction {
  if (summary.type === 'driver') {
    return {
      type: 'pending_payment',
      title:
        summary.count === 1 ? 'Pago pendiente' : `${summary.count} pagos pendientes`,
      subtitle: 'Confirma los pagos pendientes',
      ctaLabel: 'Ver pagos',
      routeName: 'PaymentConfirmation',
      routeParams: {
        rideId: summary.firstRideId,
        amount: summary.firstAmount,
        paymentMethod: summary.firstPaymentMethod || 'cash',
        clientName: 'Cliente',
        fromHome: true,
      },
      metadata: { count: summary.count, totalDebt: summary.amount },
    };
  }

  return {
    type: 'pending_payment',
    title:
      summary.count === 1 ? 'Pago pendiente' : `${summary.count} pagos pendientes`,
    subtitle: `Total: C$${summary.amount.toFixed(2)}`,
    ctaLabel: 'Pagar ahora',
    routeName: pendingPaymentsRoute,
    metadata: { count: summary.count, totalDebt: summary.amount },
  };
}

export function buildRechargeFundsAction(
  summary: PreflightRechargeFundsSummary,
  rechargeFundsRoute?: string,
): PreflightAction | undefined {
  if (!rechargeFundsRoute) {
    return undefined;
  }
  if (summary.availableBalance > 0 && !summary.blocked) {
    return undefined;
  }
  return {
    type: 'recharge_funds',
    title: 'Fondos insuficientes',
    subtitle: `Saldo actual: C$${Number(summary.availableBalance || 0).toFixed(2)}`,
    ctaLabel: 'Recargar fondos',
    routeName: rechargeFundsRoute,
    metadata: {
      availableBalance: Number(summary.availableBalance || 0),
      blocked: summary.blocked || Number(summary.availableBalance || 0) <= 0,
    },
  };
}

export function buildActiveRideAction(
  role: PreflightRole,
  t: (key: string, opts?: any) => string,
  activeRide: NonNullable<GetPreflightDataResponse['activeRide']>,
  activeRideRoute: string,
  rideTrackingRoute: string,
  waitingRideRoute: string,
): PreflightAction {
  if (role === 'driver') {
    return {
      type: 'active_ride',
      title: 'Viaje activo',
      subtitle: `Estado: ${activeRide.status}`,
      ctaLabel: 'Ir al viaje',
      routeName: activeRideRoute,
      routeParams: {
        rideId: activeRide.rideId,
        ...(activeRide.metadata || {}),
      },
      metadata: {
        rideId: activeRide.rideId,
        status: activeRide.status,
      },
    };
  }

  if (activeRide.roleView === 'client_waiting') {
    return {
      type: 'active_ride',
      title: 'Viaje en espera',
      subtitle: `Estado: ${activeRide.status}`,
      ctaLabel: 'Ver viaje',
      routeName: waitingRideRoute,
      routeParams: {
        rideId: activeRide.rideId,
      },
      metadata: {
        rideId: activeRide.rideId,
        status: activeRide.status,
      },
    };
  }

  return {
    type: 'active_ride',
    title: t('client.home.activeRide.driverOnRoute'),
    subtitle: `Estado: ${activeRide.status}`,
    ctaLabel: 'Ver viaje',
    routeName: rideTrackingRoute,
    routeParams: {
      rideId: activeRide.rideId,
      ...(activeRide.metadata || {}),
    },
    metadata: {
      rideId: activeRide.rideId,
      status: activeRide.status,
    },
  };
}

export function buildProgrammedRideAction(
  t: (key: string, opts?: any) => string,
  programmedRide: NonNullable<GetPreflightDataResponse['programmedRide']>,
): PreflightAction {
  const subtitleDate = programmedRide.scheduledAt
    ? new Date(programmedRide.scheduledAt).toLocaleString()
    : undefined;
  return {
    type: programmedRide.type,
    title: t('shared.preflight.programmedRide.actionTitle'),
    subtitle: subtitleDate
      ? t('shared.preflight.programmedRide.actionSubtitle', { date: subtitleDate })
      : undefined,
    ctaLabel: t('shared.preflight.programmedRide.confirmButton'),
    metadata: {
      rideId: programmedRide.rideId,
      scheduledAt: programmedRide.scheduledAt ?? null,
    },
  };
}

export function buildActionsFromPreflightData(
  role: PreflightRole,
  t: (key: string, opts?: any) => string,
  preflightData: GetPreflightDataResponse | null,
  pendingPaymentsRoute: string,
  rechargeFundsRoute: string | undefined,
  activeRideRoute: string,
  rideTrackingRoute: string,
  waitingRideRoute: string,
): PreflightAction[] {
  if (!preflightData || !preflightData.success) {
    return [];
  }

  const actions: PreflightAction[] = [];

  if (preflightData.activeRide) {
    actions.push(
      buildActiveRideAction(
        role,
        t,
        preflightData.activeRide,
        activeRideRoute,
        rideTrackingRoute,
        waitingRideRoute,
      ),
    );
  }

  if (preflightData.programmedRide) {
    actions.push(buildProgrammedRideAction(t, preflightData.programmedRide));
  }

  if (role === 'driver' && preflightData.pendingPayments && preflightData.pendingPayments.count > 0) {
    actions.push(buildPendingPaymentAction(t, preflightData.pendingPayments, pendingPaymentsRoute));
  }

  if (role === 'driver' && preflightData.rechargeFunds) {
    const rechargeAction = buildRechargeFundsAction(preflightData.rechargeFunds, rechargeFundsRoute);
    if (rechargeAction) {
      actions.push(rechargeAction);
    }
  }

  return actions;
}
