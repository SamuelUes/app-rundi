import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { getFirebaseAuth } from '../../config/firebase';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useFCM } from '../../context/FCMContext';
import alertService from '../../services/alertService';
import { clearPreflightResult, setPreflightResult, getPreflightResult, PreflightAction, PreflightSummary } from '../../stores/preflightStore';
import type {
  PreflightRole,
  PreflightRouteConfig,
  PreflightRegionInfo,
  PreflightTermsSummary,
  GetPreflightDataResponse,
  TermsDocumentType,
} from '../../types/preflight';
import proximityService, {
  isRegistrationUploadsInProgress,
  subscribeRegistrationUploadsInProgress,
} from '../../services/proximityService';
import ridesService from '../../services/ridesService';
import PreflightBiometricPrompt from '../../components/shared/PreflightBiometricPrompt';
import TermsAndConditionsModal, { CURRENT_TERMS_VERSION } from '../../components/shared/TermsAndConditionsModal';
import PermissionsExplanation from '../../components/permissions/PermissionsExplanation';
import { useTranslation } from 'react-i18next';
import preflightService from '../../services/preflightService';
import {
  DRIVER_BIOMETRIC_MAX_ATTEMPTS,
  TERMS_DOCUMENTS,
  buildInitialTermsCheckedState,
  buildActionsFromPreflightData,
  getCheckLabels,
  getLocalRegionFallback,
  hasAcceptedAllCurrentTerms,
  shouldRequireDriverBiometricCheck,
  toDriverApprovalResult,
  type DriverApprovalResult,
} from '../../utils/preflightHelpers';
import {
  checkAuth,
  checkNotifications,
  checkForegroundLocation,
  checkBackgroundLocation,
  checkOverlay,
  checkActivity,
  checkDriverBiometricAccess,
} from '../../utils/preflightChecks';
import { PreflightProgressBar } from '../../components/shared/Preflight/PreflightProgressBar';
import { PreflightErrorDisplay } from '../../components/shared/Preflight/PreflightErrorDisplay';
import { PreflightActionsSummary } from '../../components/shared/Preflight/PreflightActionsSummary';
import { PreflightFooter } from '../../components/shared/Preflight/PreflightFooter';

type NavigationLike = {
  replace: (routeName: string, params?: any) => void;
  navigate: (routeName: string, params?: any) => void;
};

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
  const [termsCheckedDocuments, setTermsCheckedDocuments] = useState<Record<TermsDocumentType, boolean>>(
    () => buildInitialTermsCheckedState(),
  );
  const [savingTerms, setSavingTerms] = useState(false);
  const [biometricPromptVisible, setBiometricPromptVisible] = useState(false);
  const [biometricPromptPhase, setBiometricPromptPhase] = useState<'scanning' | 'pin_fallback' | 'apple_signin' | 'success' | 'failed'>('scanning');
  const [biometricPromptAttempt, setBiometricPromptAttempt] = useState(1);
  const [biometricPromptMaxAttempts, setBiometricPromptMaxAttempts] = useState(DRIVER_BIOMETRIC_MAX_ATTEMPTS);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const actionsRef = useRef<PreflightAction[]>([]);
  const driverApprovalRef = useRef<DriverApprovalResult | null>(null);
  const checksRunRef = useRef(false);
  const modeSwitchRequestedRef = useRef(false);

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
      if (modeSwitchRequestedRef.current) {
        return;
      }

      const currentAuth = await getFirebaseAuth().catch(() => null);
      if (modeSwitchRequestedRef.current) {
        return;
      }
      if (!currentAuth) {
        setError(t('shared.preflight.errors.generic'));
        setCanRetry(true);
        checksRunRef.current = false;
        return;
      }
      if (!user?.id || currentAuth.currentUser?.uid !== user.id) {
        preflightService.clearCache();
        clearPreflightResult();
        return;
      }

      if (role === 'driver' && user?.id) {
        const approval = approvalOverride ?? driverApprovalRef.current;
        if (!approval) {
          setError(t('shared.preflight.errors.generic'));
          setCanRetry(true);
          checksRunRef.current = false;
          return;
        }
        if (!approval.allowed) {
          const targetRoute = pendingApprovalRoute || 'DriverPendingApproval';
          nav.replace(targetRoute as keyof typeof nav.replace, { approvalInfo: approval });
          return;
        }
      }

      nav.replace(successRoute as keyof typeof nav.replace);
    } catch (navError) {
      // Fail-safe: el preflight nunca debe quedar atascado tras completar checks.
      console.error('❌ [Preflight] Error en navegación post-checks:', navError);
      setError(t('shared.preflight.errors.generic'));
      setCanRetry(true);
      checksRunRef.current = false;
    }
  }, [role, user?.id, nav, successRoute, pendingApprovalRoute, t]);

  const handleTermsIfNeeded = useCallback(async (termsSummary?: PreflightTermsSummary | null): Promise<boolean> => {
    if (!user?.id) {
      return true;
    }

    if (hasAcceptedAllCurrentTerms(termsSummary || null)) {
      return true;
    }

    setShowTerms(true);
    setTermsCheckedDocuments(buildInitialTermsCheckedState());
    return false;
  }, [user?.id]);

  // Confirma el viaje programado sin bloquear: actualiza acciones y el store
  // cuando responde, aunque el usuario ya haya navegado fuera del preflight.
  const confirmProgrammedRideAction = useCallback(async (programmedAction: PreflightAction) => {
    const rideId = programmedAction.metadata?.rideId as string | undefined;
    if (!rideId) {
      return;
    }

    try {
      let confirmedRidePayload: any = null;

      if (programmedAction.type === 'programmed_ride_client_confirm') {
        const confirmResult = await ridesService.confirmProgrammedRideClient(rideId);
        confirmedRidePayload = confirmResult?.ride ?? null;
      } else {
        await ridesService.confirmProgrammedRideDriver(rideId);
      }

      if (modeSwitchRequestedRef.current) {
        return;
      }

      const currentSummary = getPreflightResult();
      const baseActions = currentSummary?.actions ?? actionsRef.current;
      const nextActions = baseActions.filter(
        (action) =>
          action !== programmedAction &&
          !(
            action.metadata?.rideId === rideId &&
            (action.type === 'programmed_ride_client_confirm' ||
              action.type === 'programmed_ride_driver_confirm')
          ),
      );
      let derivedActions = nextActions;

      if (programmedAction.type === 'programmed_ride_client_confirm' && confirmedRidePayload) {
        const hasDriverAssigned = Boolean(confirmedRidePayload.driverId);
        const scheduledDateText = confirmedRidePayload.scheduledAt
          ? new Date(confirmedRidePayload.scheduledAt).toLocaleString()
          : undefined;
        // Si el backend pospuso el viaje (usuario en otro viaje), sigue en
        // programmedRides hasta el nuevo horario → HomeOffers espera la
        // promoción y navega a tracking solo.
        const wasPostponed =
          Boolean(confirmedRidePayload.postponedReason) ||
          (typeof confirmedRidePayload.scheduledAt === 'number' &&
            confirmedRidePayload.scheduledAt > Date.now() + 60 * 1000 &&
            confirmedRidePayload.scheduledAt !== programmedAction.metadata?.scheduledAt);

        const followUpAction: PreflightAction = {
          type: 'active_ride',
          title: hasDriverAssigned
            ? t('client.home.activeRide.driverOnRoute')
            : t('client.home.activeRide.confirm'),
          subtitle: scheduledDateText
            ? t('shared.preflight.programmedRide.actionSubtitle', { date: scheduledDateText })
            : undefined,
          routeName: hasDriverAssigned && !wasPostponed ? rideTrackingRoute : waitingRideRoute,
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

        if (wasPostponed) {
          alertService.showInfoAlert(
            t('shared.preflight.programmedRide.postponedTitle'),
            t('shared.preflight.programmedRide.postponedBody'),
          );
        }
      }

      actionsRef.current = derivedActions;
      setPreflightResult({
        role: currentSummary?.role ?? role,
        timestamp: Date.now(),
        actions: derivedActions,
        region: currentSummary?.region,
        preflightData: currentSummary?.preflightData,
      });
    } catch (confirmErr: any) {
      console.error('❌ [Preflight] Error confirmando viaje programado:', confirmErr);
      alertService.showErrorAlert(
        confirmErr?.message || t('shared.preflight.programmedRide.confirmError'),
      );
    }
  }, [role, rideTrackingRoute, waitingRideRoute, t]);

  // Muestra el prompt de confirmación del viaje programado SIN bloquear el
  // preflight: el toast global persiste tras la navegación hasta que el
  // usuario responda (o lo descarte).
  const promptProgrammedRideConfirmation = useCallback(
    (programmedAction: PreflightAction) => {
      const rideId = programmedAction.metadata?.rideId as string | undefined;
      if (!rideId) {
        return;
      }
      const scheduledAt = programmedAction.metadata?.scheduledAt as number | undefined;
      const scheduledText = scheduledAt ? new Date(scheduledAt).toLocaleString() : '';
      const isDriverPrompt = programmedAction.type === 'programmed_ride_driver_confirm';

      const title = t(
        isDriverPrompt
          ? 'shared.preflight.programmedRide.driverPromptTitle'
          : 'shared.preflight.programmedRide.promptTitle',
      );
      const body = scheduledText
        ? t(
            isDriverPrompt
              ? 'shared.preflight.programmedRide.driverPromptBody'
              : 'shared.preflight.programmedRide.promptBody',
            { date: scheduledText },
          )
        : t(
            isDriverPrompt
              ? 'shared.preflight.programmedRide.driverPromptBodyNoDate'
              : 'shared.preflight.programmedRide.promptBodyNoDate',
          );
      const confirmLabel = t('shared.preflight.programmedRide.confirmButton');
      const cancelLabel = t('shared.preflight.programmedRide.notNowButton');

      alertService.showConfirmAlert(
        title,
        body,
        () => {
          void confirmProgrammedRideAction(programmedAction);
        },
        undefined,
        confirmLabel,
        cancelLabel,
      );
    },
    [confirmProgrammedRideAction, t],
  );

  const executeChecks = useCallback(async () => {
    console.log(`🔍 [Preflight] Iniciando verificaciones para rol=${role}`);
    
    setProgress(0);
    setError(null);
    setCompleted(false);
    setCanRetry(false);
    actionsRef.current = [];
    driverApprovalRef.current = null;
    setPreflightResult(null);
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

    const shouldRunDriverBiometricCheck = await shouldRequireDriverBiometricCheck(user, role);

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
    const totalSteps = localTasks.length + 1 + (shouldRunDriverBiometricCheck ? 1 : 0); // + server preflight (+ driver biometric if needed)
    const updateProgress = () => {
      const value = Math.min(100, (completedSteps / totalSteps) * 100);
      setProgress(value);
      animateProgress(value);
    };

    if (shouldRunDriverBiometricCheck) {
      setCurrentCheckLabel(labels.driverBiometric || 'driverBiometric');
      setBiometricPromptVisible(true);
      const biometricResult = await checkDriverBiometricAccess(user, role, t, ({ phase, attempt, maxAttempts }) => {
        setBiometricPromptPhase(phase);
        setBiometricPromptAttempt(attempt);
        setBiometricPromptMaxAttempts(maxAttempts);
      });
      completedSteps += 1;
      updateProgress();

      await new Promise((resolve) => setTimeout(resolve, 250));
      setBiometricPromptVisible(false);

      if (!biometricResult.success) {
        setError(
          biometricResult.message ||
            t('shared.preflight.biometric.required'),
        );
        setCanRetry(true);
        checksRunRef.current = false;
        return;
      }
    }

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
        const responseData = (err as any)?.response?.data;
        const errorCode = String((err as any)?.code || responseData?.code || '');
        console.warn('⚠️ [Preflight] No se pudo obtener getPreflightData:', {
          status: (err as any)?.response?.status,
          code: errorCode,
          reason: errorCode.includes('permission-denied')
            ? (err as any)?.message || responseData?.error
            : undefined,
        });
        return null;
      } finally {
        completedSteps += 1;
        updateProgress();
      }
    })();

    const [, preflightData] = await Promise.all([localChecksPromise, serverPreflightPromise]);
    if (modeSwitchRequestedRef.current) {
      return;
    }

    const currentAuth = await getFirebaseAuth();
    if (modeSwitchRequestedRef.current) {
      return;
    }
    if (!user?.id || currentAuth.currentUser?.uid !== user.id) {
      checksRunRef.current = false;
      return;
    }

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

    if (!preflightData?.success || preflightData.userId !== user?.id || preflightData.role !== role) {
      setProgress(0);
      animateProgress(0);
      setError(t('shared.preflight.errors.generic'));
      setCanRetry(true);
      checksRunRef.current = false;
      return;
    }

    const serverDriverApproval = role === 'driver'
      ? toDriverApprovalResult(preflightData.driverApproval)
      : null;
    if (role === 'driver' && !serverDriverApproval) {
      setProgress(0);
      animateProgress(0);
      setError(t('shared.preflight.errors.generic'));
      setCanRetry(true);
      checksRunRef.current = false;
      return;
    }
    driverApprovalRef.current = serverDriverApproval;

    const resolvedLocation = await locationPromise;
    if (modeSwitchRequestedRef.current) {
      return;
    }

    const authBeforeCommit = await getFirebaseAuth().catch(() => null);
    if (modeSwitchRequestedRef.current) {
      return;
    }
    if (!user?.id || authBeforeCommit?.currentUser?.uid !== user.id) {
      preflightService.clearCache();
      clearPreflightResult();
      checksRunRef.current = false;
      return;
    }

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
      try {
        promptProgrammedRideConfirmation(programmedAction);
      } catch (promptError) {
        console.warn('⚠️ [Preflight] No se pudo mostrar el prompt de viaje programado:', promptError);
      }
    }

    const shouldNavigate = await handleTermsIfNeeded(preflightData?.terms);
    if (shouldNavigate) {
      const approval = serverDriverApproval;
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
    promptProgrammedRideConfirmation,
    t,
  ]);

  const runChecks = useCallback(async () => {
    if (checksRunRef.current || modeSwitchRequestedRef.current) return;
    checksRunRef.current = true;

    // Fail-safe: ningún error inesperado debe dejar el preflight atascado.
    try {
      await executeChecks();
    } catch (unexpectedErr: any) {
      console.error('❌ [Preflight] Error inesperado durante verificaciones:', unexpectedErr);
      setError(t('shared.preflight.errors.generic'));
      setCanRetry(true);
      checksRunRef.current = false;
    }
  }, [executeChecks, t]);

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
    if (role !== 'driver' || modeSwitchRequestedRef.current) {
      return;
    }

    modeSwitchRequestedRef.current = true;
    checksRunRef.current = false;
    try {
      await setUserMode('client');
    } catch (err: any) {
      modeSwitchRequestedRef.current = false;
      console.error('❌ [Preflight] Error cambiando a modo cliente desde preflight:', err);
    }
  }, [role, setUserMode]);

  const handleAcceptTerms = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    const hasCheckedAllDocuments = TERMS_DOCUMENTS.every((documentType) => termsCheckedDocuments[documentType]);
    if (!hasCheckedAllDocuments || savingTerms) {
      return;
    }

    try {
      setSavingTerms(true);
      await preflightService.acceptTerms(user.id, CURRENT_TERMS_VERSION, {
        general: true,
        users: true,
        designated_driver: true,
      });
      preflightService.clearCache();
      setShowTerms(false);
      setTimeout(() => {
        navigateAfterChecks(driverApprovalRef.current);
      }, 300);
    } catch (err: any) {
      console.error('❌ [Preflight] Error guardando aceptación de términos:', err);
      alertService.showErrorAlert(t('shared.preflight.alerts.termsSaveError'));
    } finally {
      setSavingTerms(false);
    }
  }, [user?.id, termsCheckedDocuments, savingTerms, navigateAfterChecks, t]);

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
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
      >
        <View style={styles.heading}>
          <Text style={styles.title}>{t('shared.preflight.title')}</Text>
          <Text style={styles.subtitle}>
            {completed
              ? t('shared.preflight.subtitle.completed')
              : error
                ? t('shared.preflight.subtitle.error')
                : t('shared.preflight.subtitle.default')}
          </Text>
        </View>

        <PreflightProgressBar
          progress={progress}
          progressWidth={progressWidth}
          error={error}
          completed={completed}
          currentCheckLabel={currentCheckLabel}
          colors={colors}
          styles={styles}
        />

        {error && (
          <PreflightErrorDisplay error={error} styles={styles} />
        )}

        {completed && (
          <PreflightActionsSummary
            actions={actionsRef.current}
            styles={styles}
            t={t}
          />
        )}

        <PermissionsExplanation role={role} />
      </ScrollView>

      <PreflightFooter
        canRetry={canRetry}
        role={role}
        userMode={userMode}
        onRetry={handleRetry}
        onSwitchMode={handleSwitchToClientModeFromPreflight}
        styles={styles}
        t={t}
      />

      <TermsAndConditionsModal
        visible={showTerms}
        saving={savingTerms}
        requireCheck
        showDocumentSelector
        requireAllDocumentsCheck
        defaultDocumentType="general"
        checkedDocuments={termsCheckedDocuments}
        acceptLabel={t('shared.preflight.terms.accept')}
        onToggleDocumentChecked={(documentType) => {
          if (!savingTerms) {
            setTermsCheckedDocuments((prev) => ({
              ...prev,
              [documentType]: !prev[documentType],
            }));
          }
        }}
        onAccept={handleAcceptTerms}
      />

      <PreflightBiometricPrompt
        visible={biometricPromptVisible}
        title={t('shared.preflight.biometric.modal.title')}
        subtitle={
          biometricPromptPhase === 'apple_signin'
            ? t('shared.preflight.biometric.modal.appleSignIn')
            : biometricPromptPhase === 'pin_fallback'
            ? t('shared.preflight.biometric.modal.pinFallback')
            : biometricPromptPhase === 'success'
            ? t('shared.preflight.biometric.modal.success')
            : biometricPromptPhase === 'failed'
            ? t('shared.preflight.biometric.modal.retry')
            : t('shared.preflight.biometric.modal.scanning')
        }
        attemptText={t('shared.preflight.biometric.modal.attempt', {
          current: biometricPromptAttempt,
          max: biometricPromptMaxAttempts,
        })}
        phase={biometricPromptPhase}
      />
    </SafeAreaView>
  );
};

// ==================== STYLES ====================

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 20,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      paddingTop: 20,
      paddingBottom: 24,
    },
    heading: {
      alignItems: 'center',
      marginBottom: 20,
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
      marginTop: 4,
      textAlign: 'center',
      lineHeight: 22,
    },
    progressContainer: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 16,
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
      marginTop: 10,
      textAlign: 'center',
    },
    errorContainer: {
      marginTop: 8,
      marginBottom: 16,
      padding: 16,
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
      marginTop: 8,
      marginBottom: 8,
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
      paddingHorizontal: 4,
      paddingTop: 12,
      paddingBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(148, 163, 184, 0.3)',
      backgroundColor: colors.background,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 10,
    },
    retryButton: {
      minWidth: 128,
      minHeight: 48,
      flexGrow: 1,
      flexBasis: 128,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgb(239, 68, 68)',
      backgroundColor: 'rgba(239, 68, 68, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#B91C1C',
      textAlign: 'center',
    },
    secondaryButton: {
      minWidth: 150,
      minHeight: 48,
      flexGrow: 1,
      flexBasis: 150,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 0,
      borderColor: colors.primary,
      backgroundColor: 'rgba(179, 135, 55, 0.8)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    buttonPressed: {
      opacity: 0.78,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });

export default PreflightCheckScreen;
