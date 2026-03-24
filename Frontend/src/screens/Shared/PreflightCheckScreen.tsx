import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Animated,
  AppState,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFCM } from '../../context/FCMContext';
import { checkBackgroundLocationPermission } from '../../services/backgroundLocationService';
import { overlayManager } from '../../native/overlay';
import { ensureActivityRecognitionPermission } from '../../utils/activityPermission';
import alertService from '../../services/alertService';
import { setPreflightResult, PreflightAction, PreflightSummary } from '../../state/preflightStore';
import type {
  GetPreflightDataResponse,
  PreflightDriverApprovalSummary,
  PreflightPendingPaymentsSummary,
  PreflightRechargeFundsSummary,
  PreflightRole,
  PreflightRouteConfig,
  PreflightRegionInfo,
  PreflightTermsSummary,
  ServiceAreaPoint,
} from '../../types/preflight';
import { fetchDriverProfile } from '../../services/driverProfilesService';
import proximityService, {
  isRegistrationUploadsInProgress,
  subscribeRegistrationUploadsInProgress,
} from '../../services/proximityService';
import ridesService from '../../services/ridesService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import TermsAndConditionsModal, { CURRENT_TERMS_VERSION } from '../../components/TermsAndConditionsModal';
import PermissionsExplanation from '../../components/permissions/PermissionsExplanation';
import type { User as FirebaseUser } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { isNativeFirebaseSupported, loadNativeFirebaseAuth } from '../../utils/nativeFirebase';
import preflightService from '../../services/preflightService';
import { waitForFirebaseAuthUser } from '../../utils/firebaseAuthReady';

type NavigationLike = {
  replace: (routeName: string, params?: any) => void;
  navigate: (routeName: string, params?: any) => void;
};

type NormalizedAccountStatus = 'active' | 'pending' | 'suspended' | 'rejected';
type NormalizedDocumentsStatus = 'verified' | 'pending' | 'suspended' | 'rejected';

type DriverApprovalResult = {
  allowed: boolean;
  accountStatus: NormalizedAccountStatus;
  documentsStatus: NormalizedDocumentsStatus;
  hasActiveVehicle: boolean;
};

const ACTIVE_DRIVER_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const ACTIVE_CLIENT_TRACK_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const CLIENT_WAITING_STATUSES = ['requested', 'searching', 'pending', 'pending_confirmation'];

const CRITICAL_CHECKS = ['auth', 'notifications', 'foregroundLocation', 'backgroundLocation', 'overlay'];

const DEFAULT_MANAGUA_POLYGON: ServiceAreaPoint[] = [
  { lat: 12.2, lng: -86.35 },
  { lat: 12.2, lng: -86.15 },
  { lat: 12.05, lng: -86.15 },
  { lat: 12.05, lng: -86.35 },
  { lat: 12.2, lng: -86.35 },
];

function isPointInPolygon(lat: number, lng: number, polygon: ServiceAreaPoint[]): boolean {
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

function getLocalRegionFallback(
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

const getCheckLabels = (t: (key: string, opts?: any) => string): Record<string, string> => ({
  auth: t('shared.preflight.checks.auth'),
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

function toDriverApprovalResult(
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

function buildPendingPaymentAction(
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

function buildRechargeFundsAction(
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

function buildActiveRideAction(
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

function buildProgrammedRideAction(
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

function buildActionsFromPreflightData(
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

const PreflightCheckScreen = ({ navigation, route }: any) => {
  const nav = navigation as NavigationLike;
  const params = (route?.params ?? {}) as PreflightRouteConfig;
  const { user, logout, userMode, setUserMode } = useAuth();
  const { colors } = useTheme();
  const { isFCMAvailable, configureFCM } = useFCM();
  const { t } = useTranslation();
  
  const role = useMemo<PreflightRole>(() => {
    const paramRole = params?.role;
    if (paramRole === 'driver' || paramRole === 'client') {
      return paramRole;
    }
    const rawRole = user?.role ?? 'client';
    return rawRole === 'driver' || rawRole === 'designated_driver' ? 'driver' : 'client';
  }, [params?.role, user?.role]);

  const successRoute = params?.successRoute ?? (role === 'driver' ? 'DriverHome' : 'ClientHome');
  const activeRideRoute = params?.activeRideRoute ?? (role === 'driver' ? 'ActiveRide' : 'RideTracking');
  const pendingPaymentsRoute = params?.pendingPaymentsRoute ?? 'PendingPayments';
  const rechargeFundsRoute = params?.rechargeFundsRoute ?? (role === 'driver' ? 'RechargeFunds' : undefined);
  const rideTrackingRoute = params?.rideTrackingRoute ?? 'RideTracking';
  const waitingRideRoute = params?.waitingRideRoute ?? 'HomeOffers';
  const pendingApprovalRoute = params?.pendingApprovalRoute;

  const [progress, setProgress] = useState(0);
  const [currentCheckLabel, setCurrentCheckLabel] = useState<string>(t('shared.preflight.checks.starting'));
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const actionsRef = useRef<PreflightAction[]>([]);
  const checksRunRef = useRef(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const animateProgress = useCallback((toValue: number) => {
    Animated.timing(progressAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  const navigateAfterChecks = useCallback(async (approvalOverride?: DriverApprovalResult | null) => {
    try {
      if (role === 'driver' && user?.id) {
        const approval = approvalOverride ?? (await checkDriverApprovalStatus(user.id));
        if (approval && !approval.allowed) {
          const targetRoute = pendingApprovalRoute || 'DriverPendingApproval';
          nav.replace(targetRoute as any, { approvalInfo: approval });
          return;
        }
      }

      nav.replace(successRoute as any);
    } catch (err) {
      console.error('❌ [Preflight] Error en navegación post-checks:', err);
      nav.replace(successRoute as any);
    }
  }, [role, user?.id, nav, successRoute, pendingApprovalRoute]);

  const handleTermsIfNeeded = useCallback(async (termsSummary?: PreflightTermsSummary | null): Promise<boolean> => {
    try {
      if (!user?.id) {
        return true;
      }

      const existingVersion = termsSummary?.acceptedVersion
        ? termsSummary.acceptedVersion
        : (await firebaseAuthService.getUserProfile(user.id) as any)?.termsVersion;

      if (existingVersion === CURRENT_TERMS_VERSION) {
        return true;
      }

      setShowTerms(true);
      setTermsChecked(false);
      return false;
    } catch (err: any) {
      console.error('❌ [Preflight] Error obteniendo perfil para términos:', err);

      const message = String(err?.message || '');
      const code = (err && (err as any).code) || '';

      if (
        message.includes('Missing or insufficient permissions') ||
        code === 'permission-denied' ||
        code === 'unauthenticated'
      ) {
        console.warn(
          '⚠️ [Preflight] Sin permisos para leer perfil/términos; permitiendo continuar sin bloqueo',
        );
        // No bloquear el flujo de navegación por falta de permisos en Firestore
        return true;
      }

      if (user?.id) {
        setShowTerms(true);
        setTermsChecked(false);
        return false;
      }
      return true;
    }
  }, [user?.id]);

  const runChecks = useCallback(async () => {
    if (checksRunRef.current) return;
    checksRunRef.current = true;

    console.log(`🔍 [Preflight] Iniciando verificaciones para rol=${role}`);
    
    setProgress(0);
    setError(null);
    setCompleted(false);
    setCanRetry(false);
    actionsRef.current = [];
    animateProgress(0);

    const labels = getCheckLabels(t);
    setCurrentCheckLabel(labels.auth || 'auth');
    const authOk = await checkAuth(user);
    if (!authOk) {
      console.warn('⚠️ [Preflight] Auth crítico falló, cerrando sesión y volviendo a Login');
      try {
        await logout();
      } catch (logoutError) {
        console.error('❌ [Preflight] Error durante logout tras fallo de auth:', logoutError);
      }
      checksRunRef.current = false;
      return;
    }

    const localTasks: Array<{
      id: string;
      critical: boolean;
      run: () => Promise<boolean>;
    }> = [
      {
        id: 'notifications',
        critical: true,
        run: () =>
          checkNotifications({
            isFCMAvailable,
            configureFCM,
          }),
      },
      {
        id: 'foregroundLocation',
        critical: role === 'driver',
        run: () => checkForegroundLocation(),
      },
      ...(role === 'driver'
        ? [
            {
              id: 'backgroundLocation',
              critical: true,
              run: () => checkBackgroundLocation(),
            },
          ]
        : []),
      ...(role === 'driver' && Platform.OS === 'android'
        ? [
            {
              id: 'overlay',
              critical: true,
              run: () => checkOverlay(),
            },
            {
              id: 'activity',
              critical: false,
              run: () => checkActivity(),
            },
          ]
        : []),
    ];

    let completedSteps = 0;
    const totalSteps = localTasks.length + 1; // + server preflight
    const updateProgress = () => {
      const value = Math.min(100, (completedSteps / totalSteps) * 100);
      setProgress(value);
      animateProgress(value);
    };

    let criticalFailureCheck: string | null = null;
    let criticalFailureError: any = null;

    const resolveBestEffortLocation = async (): Promise<{ lat: number; lng: number } | null> => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (lastKnown?.coords) {
          return {
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
          };
        }
      } catch (_error) {
        // noop
      }
      return null;
    };

    const locationPromise = resolveBestEffortLocation();

    const localChecksPromise = Promise.all(
      localTasks.map(async (task) => {
        setCurrentCheckLabel(labels[task.id] || task.id);
        console.log(`🔸 [Preflight] Verificando ${task.id}`);
        try {
          const success = await task.run();
          if (!success && task.critical && !criticalFailureCheck) {
            criticalFailureCheck = task.id;
          }
        } catch (err: any) {
          console.error(`❌ [Preflight] Error en check ${task.id}:`, err);
          if (task.critical && !criticalFailureCheck) {
            criticalFailureCheck = task.id;
            criticalFailureError = err;
          }
        } finally {
          completedSteps += 1;
          updateProgress();
        }
      }),
    );

    const serverPreflightPromise = (async (): Promise<GetPreflightDataResponse | null> => {
      setCurrentCheckLabel(labels.region || 'region');
      try {
        const location = await locationPromise;
        const response = await preflightService.fetchPreflightData({
          role,
          userId: user?.id,
          platform: Platform.OS,
          location: location || undefined,
        });
        return response;
      } catch (err) {
        console.warn('⚠️ [Preflight] No se pudo obtener getPreflightData:', err);
        return null;
      } finally {
        completedSteps += 1;
        updateProgress();
      }
    })();

    const [, preflightData] = await Promise.all([localChecksPromise, serverPreflightPromise]);

    if (criticalFailureCheck) {
      const defaultError = t('shared.preflight.errors.checkFailed', {
        label: labels[criticalFailureCheck] || criticalFailureCheck,
      });
      const unexpectedError = criticalFailureError
        ? t('shared.preflight.errors.unexpected', {
            message: criticalFailureError?.message || t('shared.preflight.errors.generic'),
          })
        : defaultError;
      setError(unexpectedError);
      setCanRetry(true);
      checksRunRef.current = false;
      return;
    }

    const resolvedLocation = await locationPromise;
    const regionInfo: PreflightRegionInfo | undefined =
      preflightData?.region ||
      (resolvedLocation
        ? getLocalRegionFallback(t, resolvedLocation.lat, resolvedLocation.lng)
        : undefined);

    actionsRef.current = buildActionsFromPreflightData(
      role,
      t,
      preflightData,
      pendingPaymentsRoute,
      rechargeFundsRoute,
      activeRideRoute,
      rideTrackingRoute,
      waitingRideRoute,
    );

    // ✅ Todos los checks completados
    setProgress(100);
    animateProgress(100);
    setCompleted(true);
    setCurrentCheckLabel(t('shared.preflight.progress.completedLabel'));

    // Guardar resultado en el store
    const summary: PreflightSummary = {
      role,
      timestamp: Date.now(),
      actions: actionsRef.current,
      region: regionInfo,
      preflightData: preflightData || undefined,
    };
    setPreflightResult(summary);

    console.log(`✅ [Preflight] Verificaciones completadas. Acciones: ${actionsRef.current.length}`);

    const programmedAction = actionsRef.current.find(
      (candidate) =>
        candidate.type === 'programmed_ride_client_confirm' ||
        candidate.type === 'programmed_ride_driver_confirm',
    );

    if (programmedAction) {
      const rideId = programmedAction.metadata?.rideId as string | undefined;
      const scheduledAt = programmedAction.metadata?.scheduledAt as number | undefined;

      if (rideId) {
        const scheduledText = scheduledAt ? new Date(scheduledAt).toLocaleString() : '';

        const title = t('shared.preflight.programmedRide.promptTitle');
        const body = scheduledText
          ? t('shared.preflight.programmedRide.promptBody', { date: scheduledText })
          : t('shared.preflight.programmedRide.promptBodyNoDate');
        const confirmLabel = t('shared.preflight.programmedRide.confirmButton');
        const cancelLabel = t('shared.preflight.programmedRide.notNowButton');

        const shouldConfirm = await new Promise<boolean>((resolve) => {
          alertService.showConfirmAlert(
            title,
            body,
            () => resolve(true),
            () => resolve(false),
            confirmLabel,
            cancelLabel,
          );
        });

        if (shouldConfirm) {
          try {
            let confirmedRidePayload: any = null;

            if (programmedAction.type === 'programmed_ride_client_confirm') {
              const confirmResult = await ridesService.confirmProgrammedRideClient(rideId);
              confirmedRidePayload = confirmResult?.ride ?? null;
            } else {
              await ridesService.confirmProgrammedRideDriver(rideId);
            }

            const nextActions = actionsRef.current.filter((action) => action !== programmedAction);
            let derivedActions = nextActions;

            if (programmedAction.type === 'programmed_ride_client_confirm' && confirmedRidePayload) {
              const hasDriverAssigned = Boolean(confirmedRidePayload.driverId);
              const scheduledDateText = confirmedRidePayload.scheduledAt
                ? new Date(confirmedRidePayload.scheduledAt).toLocaleString()
                : undefined;

              const followUpAction: PreflightAction = {
                type: 'active_ride',
                title: hasDriverAssigned
                  ? t('client.home.activeRide.driverOnRoute')
                  : t('client.home.activeRide.confirm'),
                subtitle: scheduledDateText
                  ? t('shared.preflight.programmedRide.actionSubtitle', { date: scheduledDateText })
                  : undefined,
                routeName: hasDriverAssigned ? rideTrackingRoute : waitingRideRoute,
                routeParams: {
                  rideId: confirmedRidePayload.id || rideId,
                  driverId: confirmedRidePayload.driverId ?? undefined,
                  driverName: confirmedRidePayload.driver?.name ?? undefined,
                  vehiclePlate:
                    confirmedRidePayload.vehicle?.plate ??
                    confirmedRidePayload.driver?.vehicle?.plate ??
                    undefined,
                },
                metadata: {
                  rideId: confirmedRidePayload.id || rideId,
                  status: confirmedRidePayload.status ?? 'client_confirmed',
                  driverId: confirmedRidePayload.driverId ?? null,
                  source: 'preflight_programmed_confirm',
                },
              };

              derivedActions = [followUpAction, ...nextActions];
            }

            actionsRef.current = derivedActions;
            const updatedSummary: PreflightSummary = {
              ...summary,
              actions: derivedActions,
            };
            setPreflightResult(updatedSummary);
          } catch (confirmErr: any) {
            console.error('❌ [Preflight] Error confirmando viaje programado:', confirmErr);
            alertService.showErrorAlert(
              confirmErr?.message || t('shared.preflight.programmedRide.confirmError'),
            );
          }
        }
      }
    }

    const shouldNavigate = await handleTermsIfNeeded(preflightData?.terms);
    if (shouldNavigate) {
      const approval = toDriverApprovalResult(preflightData?.driverApproval);
      setTimeout(() => {
        navigateAfterChecks(approval);
      }, 1000);
    }

  }, [
    role,
    user,
    nav,
    successRoute,
    activeRideRoute,
    pendingPaymentsRoute,
    rechargeFundsRoute,
    rideTrackingRoute,
    waitingRideRoute,
    animateProgress,
    handleTermsIfNeeded,
    navigateAfterChecks,
    isFCMAvailable,
    configureFCM,
    logout,
    t,
  ]);

  const handleRetry = useCallback(() => {
    checksRunRef.current = false;
    runChecks();
  }, [runChecks]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeUploads: (() => void) | null = null;

    const maybeRunChecks = async () => {
      const uploadsGate = await isRegistrationUploadsInProgress();
      if (uploadsGate) {
        console.log('⏸️ [Preflight] Uploads de registro activos; se esperan para iniciar checks');
        setCurrentCheckLabel(t('shared.preflight.checks.starting'));
        setProgress(0);
        setError(null);
        setCompleted(false);
        setCanRetry(false);
        checksRunRef.current = false;
        return;
      }
      if (!cancelled) {
        runChecks();
      }
    };

    maybeRunChecks();

    unsubscribeUploads = subscribeRegistrationUploadsInProgress((value) => {
      if (!value && !cancelled) {
        if (checksRunRef.current) {
          return;
        }
        console.log('▶️ [Preflight] Uploads de registro finalizados; iniciando checks');
        runChecks();
      }
    });

    return () => {
      cancelled = true;
      unsubscribeUploads?.();
    };
  }, [runChecks, t]);

  const handleSwitchToClientModeFromPreflight = useCallback(async () => {
    if (role !== 'driver') {
      return;
    }

    try {
      await setUserMode('client');
    } catch (err: any) {
      console.error('❌ [Preflight] Error cambiando a modo cliente desde preflight:', err);
    }
  }, [role]);

  const handleAcceptTerms = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    if (!termsChecked || savingTerms) {
      return;
    }

    try {
      setSavingTerms(true);
      await firebaseAuthService.updateUserProfile(user.id, {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      });
      setShowTerms(false);
      setTimeout(() => {
        navigateAfterChecks();
      }, 300);
    } catch (err: any) {
      console.error('❌ [Preflight] Error guardando aceptación de términos:', err);
      const message = String(err?.message || '');
      const code = err?.code;

      if (
        message.includes('Missing or insufficient permissions') ||
        code === 'permission-denied' ||
        code === 'unauthenticated'
      ) {
        console.warn(
          '⚠️ [Preflight] Sin permisos para guardar términos; continuando sin actualizar perfil',
        );
        setShowTerms(false);
        setTimeout(() => {
          navigateAfterChecks();
        }, 300);
      } else {
        alertService.showErrorAlert(t('shared.preflight.alerts.termsSaveError'));
      }
    } finally {
      setSavingTerms(false);
    }
  }, [user?.id, termsChecked, savingTerms, navigateAfterChecks]);

  const handleSkip = useCallback(() => {
    alertService.showInfoAlert(
      t('shared.preflight.alerts.cannotContinueTitle'),
      t('shared.preflight.alerts.cannotContinueMessage'),
    );
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('shared.preflight.title')}</Text>
        <Text style={styles.subtitle}>
          {completed
            ? t('shared.preflight.subtitle.completed')
            : error
            ? t('shared.preflight.subtitle.error')
            : t('shared.preflight.subtitle.default')}
        </Text>

        <PermissionsExplanation role={role} />

        {/* Barra de progreso */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressWidth,
                  backgroundColor: error ? '#EF4444' : completed ? '#22C55E' : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(progress)}%
          </Text>
        </View>

        {/* Label actual */}
        {!error && !completed && (
          <Text style={styles.currentCheck}>{currentCheckLabel}</Text>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Acciones detectadas */}
        {completed && actionsRef.current.length > 0 && (
          <View style={styles.actionsContainer}>
            <Text style={styles.actionsTitle}>{t('shared.preflight.actionsSummary.title')}</Text>
            {actionsRef.current.slice(0, 3).map((action, idx) => (
              <View key={idx} style={styles.actionItem}>
                <Text style={styles.actionBullet}>•</Text>
                <Text style={styles.actionText}>{action.title}</Text>
              </View>
            ))}
            {actionsRef.current.length > 3 && (
              <Text style={styles.actionsMore}>
                {t('shared.preflight.actionsSummary.more', { count: actionsRef.current.length - 3 })}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Botones */}
      <View style={styles.footer}>
        {canRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>{t('shared.preflight.buttons.retry')}</Text>
          </TouchableOpacity>
        )}
        {role === 'driver' && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleSwitchToClientModeFromPreflight}
          >
            <Text style={styles.secondaryButtonText}>
              {userMode === 'client'
                ? t('shared.preflight.buttons.continueAsClient')
                : t('shared.preflight.buttons.useAsClient')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TermsAndConditionsModal
        visible={showTerms}
        saving={savingTerms}
        requireCheck
        checked={termsChecked}
        acceptLabel={t('shared.preflight.terms.accept')}
        onToggleChecked={() => {
          if (!savingTerms) {
            setTermsChecked(!termsChecked);
          }
        }}
        onAccept={handleAcceptTerms}
      />
    </View>
  );
};

// ==================== CHECK FUNCTIONS ====================

async function checkAuth(user: any): Promise<boolean> {
  try {
    if (!user?.id) {
      console.warn('⚠️ [Preflight] Usuario no autenticado en AuthContext');
      return false;
    }

    // 1️⃣ Intentar validar sesión usando React Native Firebase Auth (teléfono SMS, etc.)
    try {
      // const { default: rnAuth } = await import('@react-native-firebase/auth');
      if (isNativeFirebaseSupported()) {
        const nativeAuthModule = await loadNativeFirebaseAuth();
        const rnAuth = nativeAuthModule?.default;

        if (rnAuth) {
          const rnUser = rnAuth().currentUser;

          if (rnUser) {
            if (rnUser.uid === user.id) {
              console.log(`✅ [Preflight] Usuario autenticado vía RN Firebase Auth: ${user.id}`);
            } else {
              console.warn(
                '⚠️ [Preflight] Inconsistencia entre AuthContext y RN Firebase Auth:',
                'contextId=',
                user.id,
                'rnUid=',
                rnUser.uid,
              );
            }
          }
        }
      }
    } catch (rnError) {
      console.warn('⚠️ [Preflight] No se pudo verificar sesión con RN Firebase Auth:', rnError);
    }

    // 2️⃣ Requisito definitivo: validar usando Firebase Web Auth (callable usa este token)
    const firebaseUser = await waitForFirebaseAuthUser(user.id, 6000);

    if (!firebaseUser) {
      console.warn('⚠️ [Preflight] No hay sesión Firebase Auth activa');
      return false;
    }

    if (firebaseUser.uid !== user.id) {
      console.warn(
        '⚠️ [Preflight] Inconsistencia entre AuthContext y Firebase Auth:',
        'contextId=',
        user.id,
        'firebaseUid=',
        firebaseUser.uid,
      );
      return false;
    }

    console.log(`✅ [Preflight] Usuario autenticado (context + Firebase web): ${user.id}`);
    return true;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando sesión Firebase Auth:', error);
    return false;
  }
}

async function checkNotifications(params?: {
  isFCMAvailable?: boolean;
  configureFCM?: () => Promise<void>;
}): Promise<boolean> {
  try {
    const { isFCMAvailable, configureFCM } = params || {};

    const permissions = await Notifications.getPermissionsAsync();
    let granted = permissions.status === 'granted';

    if (!granted) {
      const result = await Notifications.requestPermissionsAsync();
      granted = result.status === 'granted';
    }

    if (!granted) {
      return false;
    }

    // Si FCM está disponible, intentar configurar FCM también para que
    // el contexto de FCM refleje el estado real (hasPermission/isConfigured)
    if (isFCMAvailable && configureFCM) {
      try {
        await configureFCM();
      } catch (fcmError) {
        console.error('❌ [Preflight] Error configurando FCM tras conceder notificaciones:', fcmError);
        // No bloquear el preflight por fallo de FCM; las notificaciones del sistema sí están concedidas
      }
    }

    return true;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando notificaciones:', error);
    return false;
  }
}

async function checkRegionAvailabilityPreflight(
  t: (key: string, opts?: any) => string,
): Promise<PreflightRegionInfo | null> {
  let latitude: number | null = null;
  let longitude: number | null = null;

  try {
    // Intentar usar la última ubicación conocida para acelerar
    try {
      let position = await Location.getLastKnownPositionAsync();
      if (!position) {
        position = await Location.getCurrentPositionAsync({});
      }

      if (!position) {
        console.warn('⚠️ [Preflight] No se pudo obtener ubicación para verificación de región');
        return null;
      }

      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (locError: any) {
      console.warn(
        '⚠️ [Preflight] Ubicación actual no disponible. Verifica que los servicios de ubicación estén activos:',
        locError?.message || locError,
      );
      return null;
    }

    const { default: client } = await import('../../api/client');
    const { getFirebaseAuth } = await import('../../config/firebase');

    const auth = await getFirebaseAuth();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      console.warn('[Preflight] No hay sesión Firebase Auth; omitiendo checkRegionAvailability');
      return null;
    }

    try {
      await firebaseUser.getIdToken(true);
    } catch (tokenError) {
      console.warn('[Preflight] No se pudo refrescar token antes de checkRegionAvailability:', tokenError);
    }

    const response = await client.post('/checkRegionAvailabilityHttp', {
      latitude,
      longitude,
      platform: Platform.OS,
    });

    const data = response.data as any;

    const region: PreflightRegionInfo = {
      allowed: !!data?.allowed,
      serviceAreaId:
        typeof data?.serviceAreaId === 'string' && data.serviceAreaId.trim().length > 0
          ? data.serviceAreaId.trim()
          : null,
      areaName: typeof data?.areaName === 'string' ? data.areaName : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
      reasonCode: typeof data?.reasonCode === 'string' ? data.reasonCode : undefined,
      latitude,
      longitude,
    };

    console.log('[Preflight] Región detectada:', region);
    return region;
  } catch (error: any) {
    console.error('❌ [Preflight] Error verificando región (HTTP):', error?.response?.data ?? error);

    if (latitude != null && longitude != null) {
      const region = getLocalRegionFallback(t, latitude, longitude);
      console.log('[Preflight] Región fallback local:', region);
      return region;
    }

    return null;
  }
}

async function checkForegroundLocation(): Promise<boolean> {
  try {
    const permissions = await Location.getForegroundPermissionsAsync();
    console.log('[Preflight] Foreground permission current status:', {
      status: permissions.status,
      canAskAgain: (permissions as any).canAskAgain,
    });

    if (permissions.status === 'granted') {
      return true;
    }

    const result = await Location.requestForegroundPermissionsAsync();
    console.log('[Preflight] Foreground permission request result:', {
      status: result.status,
      canAskAgain: (result as any).canAskAgain,
    });
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando ubicación foreground:', error);
    return false;
  }
}

async function checkBackgroundLocation(): Promise<boolean> {
  try {
    const granted = await checkBackgroundLocationPermission();
    console.log('[Preflight] Background permission existing:', granted);

    if (granted) {
      return true;
    }

    const result = await Location.requestBackgroundPermissionsAsync();
    console.log('[Preflight] Background permission request result:', {
      status: result.status,
      canAskAgain: (result as any).canAskAgain,
    });
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando ubicación background:', error);
    return false;
  }
}

async function checkOverlay(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    if (typeof overlayManager?.hasPermission === 'function') {
      const granted = await overlayManager.hasPermission();
      if (granted) {
        return true;
      }
    }

    if (typeof overlayManager?.requestPermission === 'function') {
      const requested = await overlayManager.requestPermission();
      return !!requested;
    }

    return true;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando permiso de superposición:', error);
    return false;
  }
}

async function checkActivity(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    return await ensureActivityRecognitionPermission();
  } catch (error) {
    console.error('❌ [Preflight] Error verificando permiso de actividad:', error);
    return false;
  }
}

async function checkDriverApprovalStatus(driverId: string): Promise<DriverApprovalResult | null> {
  try {
    const profile = await fetchDriverProfile(driverId, { forceRefresh: true });
    if (!profile) {
      return null;
    }

    const rawAccountStatus = String(
      (profile as any)?.account_status || (profile as any)?.status || '',
    ).toLowerCase();

    let accountStatus: NormalizedAccountStatus;
    if (['active', 'verified', 'approved'].includes(rawAccountStatus)) {
      accountStatus = 'active';
    } else if (rawAccountStatus === 'suspended') {
      accountStatus = 'suspended';
    } else if (['rejected', 'disabled', 'denied'].includes(rawAccountStatus)) {
      accountStatus = 'rejected';
    } else {
      accountStatus = 'pending';
    }

    const rawDocumentsStatus = String((profile as any)?.documents_status || '').toLowerCase();
    let documentsStatus: NormalizedDocumentsStatus;
    if (rawDocumentsStatus === 'verified') {
      documentsStatus = 'verified';
    } else if (rawDocumentsStatus === 'suspended') {
      documentsStatus = 'suspended';
    } else if (rawDocumentsStatus === 'rejected') {
      documentsStatus = 'rejected';
    } else {
      documentsStatus = 'pending';
    }

    const vehicles: any[] | undefined = (profile as any)?.vehicles;
    const hasActiveVehicle = Array.isArray(vehicles)
      ? vehicles.some((v) => v && (v.isActive === true || (v as any).is_active === true))
      : false;

    const allowed = accountStatus === 'active' && documentsStatus === 'verified' && hasActiveVehicle;

    return {
      allowed,
      accountStatus,
      documentsStatus,
      hasActiveVehicle,
    };
  } catch (error) {
    console.error('❌ [Preflight] Error verificando aprobación de conductor:', error);
    // Si falla este check, no bloquear el flujo principal
    return null;
  }
}

// ==================== STYLES ====================

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 32,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary || 'rgba(255,255,255,0.7)',
      marginBottom: 48,
      textAlign: 'center',
      lineHeight: 22,
    },
    progressContainer: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 24,
    },
    progressBackground: {
      width: '100%',
      height: 8,
      backgroundColor: colors.card,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 12,
    },
    progressBar: {
      height: '100%',
      borderRadius: 4,
    },
    progressText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    currentCheck: {
      fontSize: 14,
      color: colors.textSecondary || 'rgba(255,255,255,0.65)',
      marginTop: 16,
      textAlign: 'center',
    },
    errorContainer: {
      marginTop: 24,
      padding: 20,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#EF4444',
      alignItems: 'center',
    },
    errorIcon: {
      fontSize: 32,
      marginBottom: 8,
    },
    errorText: {
      fontSize: 14,
      color: '#EF4444',
      textAlign: 'center',
      lineHeight: 20,
    },
    actionsContainer: {
      marginTop: 32,
      width: '100%',
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
    },
    actionsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    actionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    actionBullet: {
      fontSize: 14,
      color: colors.primary,
      marginRight: 8,
      marginTop: 2,
    },
    actionText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary || 'rgba(255,255,255,0.75)',
      lineHeight: 20,
    },
    actionsMore: {
      fontSize: 12,
      color: colors.textSecondary || 'rgba(255,255,255,0.5)',
      fontStyle: 'italic',
      marginTop: 4,
    },
    termsOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    termsCard: {
      width: '100%',
      maxHeight: '80%',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    termsTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    termsContent: {
      maxHeight: 260,
      marginBottom: 16,
    },
    termsText: {
      fontSize: 13,
      color: colors.textSecondary || 'rgba(255,255,255,0.75)',
      lineHeight: 18,
    },
    termsCheckboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    termsCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: colors.background,
    },
    termsCheckboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    termsCheckboxIcon: {
      fontSize: 14,
      color: '#0F172A',
      fontWeight: '700',
    },
    termsCheckboxLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    termsAcceptButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    termsAcceptButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#0F172A',
    },
    footer: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(148, 163, 184, 0.3)',
      backgroundColor: colors.background,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    retryButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#EF4444',
      backgroundColor: '#FEF2F2',
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#B91C1C',
    },
    secondaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });

export default PreflightCheckScreen;
