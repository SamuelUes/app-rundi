import React, { useEffect, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LoadingIcon } from '../ui/LoadingIcon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import alertService from '../../services/alertService';
import ridesService from '../../services/ridesService';
import { useProgrammedRidePrompt, ProgrammedRidePrompt, buildActiveRideAction } from '../../hooks/shared/programmed/useProgrammedRidePrompt';
import { useAuth } from '../../context/AuthContext';
import { subscribePreflightResult, getPreflightResult, setPreflightResult, PreflightAction } from '../../stores/preflightStore';
import { useNavigation } from '@react-navigation/native';

type Props = {
  role: 'client' | 'driver';
};

const ProgrammedRidePromptOverlay: React.FC<Props> = ({ role }) => {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [processing, setProcessing] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<ProgrammedRidePrompt | null>(null);
  const [preflightActions, setPreflightActions] = useState<PreflightAction[]>(() => getPreflightResult()?.actions ?? []);

  const { prompt, snoozePrompt, markHandled } = useProgrammedRidePrompt({
    userId: user?.id,
    listenForClient: role === 'client',
    listenForDriver: role === 'driver',
  });

  useEffect(() => {
    setCurrentPrompt(prompt);
  }, [prompt]);

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
    if (currentPrompt) {
      snoozePrompt(currentPrompt);
    }
    setCurrentPrompt(null);
  }, [currentPrompt, snoozePrompt]);

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

  if (!visible || !currentPrompt) {
    return null;
  }

  const scheduledText = currentPrompt.scheduledAt
    ? new Date(currentPrompt.scheduledAt).toLocaleString()
    : null;

  const isClientPrompt = currentPrompt.type === 'client';

  const title = isClientPrompt
    ? t('shared.preflight.programmedRide.promptTitle')
    : t('shared.preflight.programmedRide.driverPromptTitle');

  const body = scheduledText
    ? t(
        isClientPrompt
          ? 'shared.preflight.programmedRide.promptBody'
          : 'shared.preflight.programmedRide.driverPromptBody',
        { date: scheduledText },
      )
    : t(
        isClientPrompt
          ? 'shared.preflight.programmedRide.promptBodyNoDate'
          : 'shared.preflight.programmedRide.driverPromptBodyNoDate',
      );

  const confirmLabel = t('shared.preflight.programmedRide.confirmButton');
  const cancelLabel = t('shared.preflight.programmedRide.notNowButton');

  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
          {processing ? (
            <LoadingIcon size={24} color={colors.primary} style={styles.spinner} />
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleDismiss}>
                <Text style={[styles.buttonText, styles.secondaryText]}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleContinue}>
                <Text style={[styles.buttonText, styles.primaryText]}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  spinner: {
    marginTop: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#22C55E',
  },
  secondaryButton: {
    backgroundColor: 'rgba(148,163,184,0.2)',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryText: {
    color: '#0F172A',
  },
  secondaryText: {
    color: '#0F172A',
  },
});

export default ProgrammedRidePromptOverlay;
