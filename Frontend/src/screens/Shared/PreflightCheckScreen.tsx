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
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFCM } from '../../context/FCMContext';
import alertService from '../../services/alertService';
import { setPreflightResult, PreflightAction, PreflightSummary } from '../../stores/preflightStore';
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
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import PreflightBiometricPrompt from '../../components/PreflightBiometricPrompt';
import TermsAndConditionsModal, { CURRENT_TERMS_VERSION } from '../../components/TermsAndConditionsModal';
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
  checkDriverApprovalStatus,
  checkDriverBiometricAccess,
} from '../../utils/preflightChecks';

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
  const [biometricPromptPhase, setBiometricPromptPhase] = useState<'scanning' | 'pin_fallback' | 'success' | 'failed'>('scanning');
  const [biometricPromptAttempt, setBiometricPromptAttempt] = useState(1);
  const [biometricPromptMaxAttempts, setBiometricPromptMaxAttempts] = useState(DRIVER_BIOMETRIC_MAX_ATTEMPTS);
  
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
          nav.replace(targetRoute as keyof typeof nav.replace, { approvalInfo: approval });
          return;
        }
      }

      nav.replace(successRoute as keyof typeof nav.replace);
    } catch (err) {
      console.error('❌ [Preflight] Error en navegación post-checks:', err);
      nav.replace(successRoute as keyof typeof nav.replace);
    }
  }, [role, user?.id, nav, successRoute, pendingApprovalRoute]);

  const handleTermsIfNeeded = useCallback(async (termsSummary?: PreflightTermsSummary | null): Promise<boolean> => {
    try {
      if (!user?.id) {
        return true;
      }

      const profile = await firebaseAuthService.getUserProfile(user.id) as Record<string, unknown>;

      if (hasAcceptedAllCurrentTerms(termsSummary || null, profile || null)) {
        return true;
      }

      setShowTerms(true);
      setTermsCheckedDocuments(buildInitialTermsCheckedState());
      return false;
    } catch (err: any) {
      console.error('❌ [Preflight] Error obteniendo perfil para términos:', err);

      const message = String(err?.message || '');
      const code = (err && (err as Record<string, unknown>).code) || '';

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
        setTermsCheckedDocuments(buildInitialTermsCheckedState());
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

    const shouldRunDriverBiometricCheck = shouldRequireDriverBiometricCheck(user, role);

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
    const hasCheckedAllDocuments = TERMS_DOCUMENTS.every((documentType) => termsCheckedDocuments[documentType]);
    if (!hasCheckedAllDocuments || savingTerms) {
      return;
    }

    try {
      setSavingTerms(true);
      const now = new Date();
      await firebaseAuthService.updateUserProfile(user.id, {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: now,
        termsAcceptance: {
          type: 'by_document',
          version: CURRENT_TERMS_VERSION,
          acceptedAt: now,
          documents: {
            general: {
              accepted: true,
              version: CURRENT_TERMS_VERSION,
              acceptedAt: now,
            },
            users: {
              accepted: true,
              version: CURRENT_TERMS_VERSION,
              acceptedAt: now,
            },
            designated_driver: {
              accepted: true,
              version: CURRENT_TERMS_VERSION,
              acceptedAt: now,
            },
          },
        },
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
  }, [user?.id, termsCheckedDocuments, savingTerms, navigateAfterChecks]);

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
            <MaterialIcons name="warning" size={48} color="#FF9800" />
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
          biometricPromptPhase === 'pin_fallback'
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
    </View>
  );
};

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
