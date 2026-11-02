import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import alertService from '../../services/notification/alertService';
import ridesService from '../../services/ride/ridesService';
import { useProgrammedRidePrompt, ProgrammedRidePrompt, buildActiveRideAction } from '../../hooks/shared/programmed/useProgrammedRidePrompt';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { initializeFirebase } from '../../config/firebase';
import { isSameDay } from '../../utils/format/schedule';
import { subscribePreflightResult, getPreflightResult, setPreflightResult, PreflightAction } from '../../stores/preflightStore';
import { useNavigation } from '@react-navigation/native';

type Props = {
  role: 'client' | 'driver';
};

const ProgrammedRidePromptOverlay: React.FC<Props> = ({ role }) => {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [processing, setProcessing] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<ProgrammedRidePrompt | null>(null);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [preflightActions, setPreflightActions] = useState<PreflightAction[]>(() => getPreflightResult()?.actions ?? []);

  const { prompt, snoozePrompt, markHandled } = useProgrammedRidePrompt({
    userId: user?.id,
    listenForClient: role === 'client',
    listenForDriver: role === 'driver',
  });

  useEffect(() => {
    setCurrentPrompt(prompt);
  }, [prompt]);

  // Mientras el viaje programado siga sin conductor, mostrar el código que el
  // cliente puede compartir para que un conductor se auto-asigne.
  useEffect(() => {
    if (!currentPrompt || currentPrompt.type !== 'client' || currentPrompt.driverId) {
      setClaimCode(null);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { getFirebaseFirestore } = await import('../../config/firebase');
        const { FS_COL } = await import('../../constants/firestore');
        const db = await getFirebaseFirestore();
        const snap = await getDoc(doc(db, FS_COL.programmed, currentPrompt.rideId));
        if (mounted) {
          setClaimCode(snap.data()?.shareCode ?? null);
        }
      } catch {
        if (mounted) setClaimCode(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentPrompt]);

  useEffect(() => {
    const unsubscribe = subscribePreflightResult((summary) => {
      setPreflightActions(summary?.actions ?? []);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const navigateToAction = useCallback(
    (action: PreflightAction) => {
      if (!action.routeName) {
        return;
      }
      try {
        const params = action.routeParams ?? {};
        navigation.navigate(action.routeName as never, params as never);
      } catch (error) {
        console.error('[ProgrammedRidePromptOverlay] Error al navegar:', error);
      }
    },
    [navigation],
  );

  const handleConfirmClient = useCallback(
    async (promptData: ProgrammedRidePrompt) => {
      setProcessing(true);
      try {
        const result = await ridesService.confirmProgrammedRideClient(promptData.rideId);
        const ridePayload = result?.ride;
        markHandled(promptData);

        if (ridePayload) {
          const hasDriverAssigned = Boolean(ridePayload.driverId);
          const action = buildActiveRideAction(
            'client',
            {
              rideId: ridePayload.id || promptData.rideId,
              hasDriverAssigned,
              driverId: ridePayload.driverId,
              driverName: ridePayload.driver?.name,
              vehiclePlate: ridePayload.vehicle?.plate ?? ridePayload.driver?.vehicle?.plate,
              scheduledAt: ridePayload.scheduledAt,
            },
            t,
          );
          const baseSummary = getPreflightResult();
          setPreflightResult({
            role: baseSummary?.role ?? 'client',
            timestamp: Date.now(),
            actions: [action, ...preflightActions],
            region: baseSummary?.region,
          });
          navigateToAction(action);
        }
      } catch (error: any) {
        console.error('[ProgrammedRidePromptOverlay] Error confirmando cliente:', error);
        alertService.showErrorAlert(
          error?.message || t('shared.preflight.programmedRide.confirmError'),
        );
      } finally {
        setProcessing(false);
        setCurrentPrompt(null);
      }
    },
    [markHandled, t, preflightActions, navigateToAction],
  );

  const handleConfirmDriver = useCallback(
    async (promptData: ProgrammedRidePrompt) => {
      setProcessing(true);
      try {
        await ridesService.confirmProgrammedRideDriver(promptData.rideId);
        markHandled(promptData);
        const action = buildActiveRideAction(
          'driver',
          {
            rideId: promptData.rideId,
            hasDriverAssigned: true,
            driverId: user?.id ?? promptData.driverId,
            scheduledAt: promptData.scheduledAt,
          },
          t,
        );
        const baseSummary = getPreflightResult();
        setPreflightResult({
          role: baseSummary?.role ?? 'driver',
          timestamp: Date.now(),
          actions: [action, ...preflightActions],
          region: baseSummary?.region,
        });
        navigateToAction(action);
      } catch (error: any) {
        console.error('[ProgrammedRidePromptOverlay] Error confirmando conductor:', error);
        alertService.showErrorAlert(
          error?.message || t('shared.preflight.programmedRide.confirmError'),
        );
      } finally {
        setProcessing(false);
        setCurrentPrompt(null);
      }
    },
    [markHandled, t, user?.id, preflightActions, navigateToAction],
  );

  const handleDismiss = useCallback(() => {
    if (!currentPrompt) {
      return;
    }
    const dismissed = currentPrompt;
    snoozePrompt(dismissed);
    setCurrentPrompt(null);

    // Fallback persistente: el viaje sigue esperando confirmación y el toast
    // queda como vía para confirmarlo sin reabrir el modal (no se solapa con
    // el overlay — solo aparece al descartarlo).
    const isClient = dismissed.type === 'client';
    alertService.showConfirmAlert(
      isClient
        ? t('shared.preflight.programmedRide.promptTitle')
        : t('shared.preflight.programmedRide.driverPromptTitle'),
      t('shared.preflight.programmedRide.toastFallbackBody'),
      () => {
        if (dismissed.type === 'client') {
          handleConfirmClient(dismissed);
        } else {
          handleConfirmDriver(dismissed);
        }
      },
      undefined,
      t('shared.preflight.programmedRide.confirmButton'),
      t('shared.preflight.programmedRide.notNowButton'),
    );
  }, [currentPrompt, snoozePrompt, t, handleConfirmClient, handleConfirmDriver]);

  const handleContinue = useCallback(() => {
    if (!currentPrompt) {
      return;
    }
    if (currentPrompt.type === 'client') {
      handleConfirmClient(currentPrompt);
    } else {
      handleConfirmDriver(currentPrompt);
    }
  }, [currentPrompt, handleConfirmClient, handleConfirmDriver]);

  const visible = Boolean(currentPrompt);
  const isClientPrompt = currentPrompt?.type === 'client';
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 260,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, entrance, currentPrompt?.rideId]);

  const scheduledLabel = useMemo(() => {
    if (!currentPrompt?.scheduledAt) {
      return null;
    }
    const date = new Date(currentPrompt.scheduledAt);
    const now = new Date();
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (isSameDay(date, now)) {
      return t('shared.preflight.programmedRide.timeLabelToday', { time });
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (isSameDay(date, tomorrow)) {
      return t('shared.preflight.programmedRide.timeLabelTomorrow', { time });
    }
    const shortDate = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return t('shared.preflight.programmedRide.timeLabelDate', { date: shortDate, time });
  }, [currentPrompt?.scheduledAt, t]);

  if (!visible || !currentPrompt) {
    return null;
  }

  const title = isClientPrompt
    ? t('shared.preflight.programmedRide.promptTitle')
    : t('shared.preflight.programmedRide.driverPromptTitle');

  const body = t(
    isClientPrompt
      ? 'shared.preflight.programmedRide.promptBodyNoDate'
      : 'shared.preflight.programmedRide.driverPromptBodyNoDate',
  );

  const confirmLabel = t('shared.preflight.programmedRide.confirmButton');
  const dismissLabel = t('shared.preflight.programmedRide.notNowButton');
  const iconTintBg = isDark ? 'rgba(179,135,55,0.2)' : 'rgba(179,135,55,0.1)';

  return (
    <Modal transparent visible animationType="none">
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
          },
        ]}
      >
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
            {
              opacity: entrance,
              transform: [
                { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            },
          ]}
        >
          <View style={[styles.iconDisc, { backgroundColor: iconTintBg }]}>
            <MaterialIcons
              name={isClientPrompt ? 'schedule' : 'directions-car'}
              size={32}
              color={colors.primary}
            />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {scheduledLabel ? (
            <View style={[styles.timePill, { backgroundColor: iconTintBg }]}>
              <MaterialIcons name="access-time" size={16} color={colors.primary} />
              <Text style={[styles.timePillText, { color: colors.primary }]}>{scheduledLabel}</Text>
            </View>
          ) : null}

          <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>

          {isClientPrompt && claimCode ? (
            <View style={[styles.codeChip, { borderColor: colors.primary }]}>
              <Text style={[styles.codeChipLabel, { color: colors.textSecondary }]}>
                {t('shared.preflight.programmedRide.claimCodeLabel')}
              </Text>
              <Text style={[styles.codeChipValue, { color: colors.primary }]} selectable>
                {claimCode}
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={processing}
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: processing ? 0.7 : 1 },
              pressed && !processing && styles.pressed,
            ]}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>{confirmLabel}</Text>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={processing}
            onPress={handleDismiss}
            hitSlop={8}
            style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.5 }]}
          >
            <Text style={[styles.ghostText, { color: colors.textSecondary }]}>{dismissLabel}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  iconDisc: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  timePillText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
  codeChip: {
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 2,
    alignSelf: 'stretch',
  },
  codeChipLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  codeChipValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
  },
  primaryButton: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  ghostButton: {
    alignSelf: 'stretch',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ProgrammedRidePromptOverlay;
