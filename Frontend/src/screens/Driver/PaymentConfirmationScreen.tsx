/**
 * PaymentConfirmationScreen - Pantalla Unificada de Confirmación de Pago
 * 
 * Maneja ambos métodos de pago (cash y card) en una sola pantalla
 * Permite al conductor cambiar el método de pago si es necesario
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { AnimatedButton } from '../../components/ui/AnimatedButton';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';
import cardsService from '../../services/cardsService';
import alertService from '../../services/alertService';
import sessionService from '../../services/sessionService';
import { useTranslation } from 'react-i18next';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import { PaymentConfirmationHeader } from '../../components/driver/PaymentConfirmation/PaymentConfirmationHeader';
import { PaymentConfirmationBreakdown } from '../../components/driver/PaymentConfirmation/PaymentConfirmationBreakdown';
import { PaymentConfirmationCashStatus } from '../../components/driver/PaymentConfirmation/PaymentConfirmationCashStatus';
import { PaymentConfirmationCodeInput } from '../../components/driver/PaymentConfirmation/PaymentConfirmationCodeInput';
import { PaymentConfirmationActions } from '../../components/driver/PaymentConfirmation/PaymentConfirmationActions';

interface PaymentConfirmationScreenProps {
  route: {
    params: {
      rideId: string;
      pgRideId?: string;
      amount: number;
      tip?: number;
      clientName: string;
      paymentMethod: 'cash' | 'card';
      fromHome?: boolean;
    };
  };
  navigation: any;
}

export default function PaymentConfirmationScreen({ 
  route, 
  navigation 
}: PaymentConfirmationScreenProps) {
  const { rideId, pgRideId, amount, tip = 0, clientName, paymentMethod: initialMethod } = route.params;
  const { colors, isDark } = useTheme();
  const accentAlt = isDark ? colors.SecondBorder : colors.primary;
  const styles = useMemo(() => createStyles(colors, accentAlt), [colors, accentAlt]);
  const { t } = useTranslation();
  const loadingText = t('driver.paymentConfirmation.loading');
  const headerTexts = t('driver.paymentConfirmation.header', { returnObjects: true }) as {
    cashTitle: string;
    cardTitle: string;
    cashSubtitle: string;
    cardSubtitle: string;
  };
  const breakdownTexts = t('driver.paymentConfirmation.breakdown', { returnObjects: true }) as {
    title: string;
    fare: string;
    tip: string;
    total: string;
    methodLabel: string;
    methodCash: string;
    methodCard: string;
  };
  const cashStatusTexts = t('driver.paymentConfirmation.cashStatus', { returnObjects: true }) as {
    confirmedTitle: string;
    confirmedSubtitle: string;
    waitingTitle: string;
    waitingSubtitle: string;
  };
  const instructionsTexts = t('driver.paymentConfirmation.instructions', {
    returnObjects: true,
  }) as { title: string; text: string };
  const cardStatusTexts = t('driver.paymentConfirmation.cardStatus', { returnObjects: true }) as {
    processing: string;
    pending: string;
    verifying: string;
    description: string;
    infoMessage: string;
  };
  const buttonTexts = t('driver.paymentConfirmation.buttons', { returnObjects: true }) as {
    confirmCash: string;
    switchToCard: string;
    switchToCash: string;
    reportIssue: string;
    generateCode: string;
  };
  const methodBadgeTexts = t('driver.paymentConfirmation.methodBadge', { returnObjects: true }) as {
    label: string;
    cash: string;
    card: string;
  };
  const switchDisabledTexts = t('driver.paymentConfirmation.switchDisabled', {
    returnObjects: true,
  }) as { title: string; subtitle: string };
  const alertsTexts = t('driver.paymentConfirmation.alerts', { returnObjects: true }) as {
    waitTitle: string;
    waitMessage: string;
    cardRequiredTitle: string;
    cardRequiredMessage: string;
    cardRequiredAction: string;
    paymentCompletedTitle: string;
    paymentCompletedMessage: string;
    cashConfirmedTitle: string;
    cashConfirmedMessage: string;
    methodChangeTitle: string;
    methodChangeMessage: string;
    methodChangeSuccessTitle: string;
    methodChangeSuccessMessage: string;
    cancelSuccessTitle: string;
    cancelSuccessMessage: string;
    genericError: string;
    reportTitle: string;
    reportMessage: string;
    reportOptions: {
      noPay: string;
      wrongAmount: string;
      cardIssue: string;
      other: string;
      cancel: string;
    };
    codeRequiredTitle: string;
    codeRequiredMessage: string;
    codeSuccessTitle: string;
    codeSuccessMessage: string;
    codeErrorMessage: string;
  };
  const methodNames = t('driver.paymentConfirmation.methodNames', {
    returnObjects: true,
  }) as { cash: string; card: string; cashLower: string; cardLower: string };

  // Estados
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [hasCardOnFile, setHasCardOnFile] = useState<boolean | null>(null);

  // Código de confirmación (flujo "code")
  const [code, setCode] = useState<string | null>(null);
  const [codeDigits, setCodeDigits] = useState(['', '', '', '']);
  const [isCodeValidated, setIsCodeValidated] = useState(false);
  const completionHandledRef = useRef(false);
  const lastPaymentStatusRef = useRef<string | null>(null);

  // Convertir a números
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  const numericTip = typeof tip === 'string' ? parseFloat(tip) : (tip || 0);
  const totalAmount = numericAmount + numericTip;

  console.log('💳 [PaymentConfirmation] Params:', { 
    rideId, 
    amount: numericAmount, 
    tip: numericTip, 
    paymentMethod,
    clientName 
  });

  const validateCardsForCardPayment = async (): Promise<boolean> => {
    try {
      console.log('📋 [PaymentConfirmation] Verificando tarjetas guardadas...');
      const cards = await cardsService.getCards();
      const hasCards = Array.isArray(cards) && cards.length > 0;
      setHasCardOnFile(hasCards);

      if (!hasCards) {
        alertService.showConfirmAlert(
          alertsTexts.cardRequiredTitle,
          alertsTexts.cardRequiredMessage,
          () => {
            // navigation.navigate('PaymentMethods');
          },
          undefined,
          alertsTexts.cardRequiredAction
        );
      }

      return hasCards;
    } catch (error) {
      console.error('❌ [PaymentConfirmation] Error obteniendo tarjetas:', error);
      setHasCardOnFile(false);
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const runValidation = async () => {
      if (paymentMethod === 'card') {
        const hasCards = await validateCardsForCardPayment();
        if (!isMounted) {
          return;
        }
        setHasCardOnFile(hasCards);
      } else {
        setHasCardOnFile(null);
      }
    };

    runValidation();

    return () => {
      isMounted = false;
    };
  }, [paymentMethod]);

  useEffect(() => {
    const setupListener = async () => {
      try {
        const { app } = await initializeFirebase();
        if (!app) {
          console.error('❌ Firebase no inicializado');
          setLoading(false);
          return;
        }

        const db = getDatabase(app);
        const paymentRef = ref(db, `paymentStatus/${rideId}`);
        const rideRef = ref(db, `activeRides/${rideId}`);

        // Listener para paymentStatus
        const unsubscribePayment = onValue(paymentRef, (snapshot) => {
          const data = snapshot.val();
          console.log('📦 [PaymentConfirmation] paymentStatus:', data);

          if (data) {
            lastPaymentStatusRef.current = data.status ?? null;
            setPaymentStatus(data);
            
            // Actualizar método de pago si cambió
            if (data.method && data.method !== paymentMethod) {
              console.log(`🔄 Método actualizado: ${paymentMethod} → ${data.method}`);
              // Tarjetas desactivadas temporalmente: mantener efectivo
              setPaymentMethod('cash');
            }

            // Verificar confirmación del cliente
            setClientConfirmed(data.confirmedByClient === true || data.clientConfirmed === true);

            // Código generado por backend (flujo code)
            if (data.code && typeof data.code === 'string') {
              setCode(data.code);
            }

            // Si el pago fue completado (terminal canónico o legacy)
            if (
              ['completed', 'confirmed', 'payment_completed'].includes(data.status) &&
              !completionHandledRef.current
            ) {
              completionHandledRef.current = true;
              console.log('✅ Pago completado');
              alertService.showSuccessAlert(
              alertsTexts.paymentCompletedTitle,
              alertsTexts.paymentCompletedMessage,
              () => navigation.replace('AvailableRides')
            );
            }
          } else if (
            lastPaymentStatusRef.current &&
            ['completed', 'confirmed', 'payment_completed'].includes(lastPaymentStatusRef.current) &&
            !completionHandledRef.current
          ) {
            // El nodo se eliminó tras el archivado — el pago ya terminó.
            completionHandledRef.current = true;
            console.log('✅ Pago archivado, saliendo');
            navigation.replace('AvailableRides');
          }
          
          setLoading(false);
        });

        // Listener para activeRides (detectar cambios de método)
        const unsubscribeRide = onValue(rideRef, (snapshot) => {
          const data = snapshot.val();
          if (data?.paymentMethod && data.paymentMethod !== paymentMethod) {
            console.log(`🔄 Método de pago cambiado en ride: ${data.paymentMethod}`);
            // Tarjetas desactivadas temporalmente: mantener efectivo
            setPaymentMethod('cash');
          }
        });

        return () => {
          off(paymentRef);
          off(rideRef);
        };
      } catch (error) {
        console.error('❌ Error configurando listeners:', error);
        setLoading(false);
      }
    };

    setupListener();
  }, [rideId]);

  // Confirmar pago en efectivo
  const handleConfirmCashPayment = async () => {
    // Si no hay código, se mantiene la validación normal de confirmación del cliente
    if (!code && !clientConfirmed) {
      alertService.showInfoAlert(
        alertsTexts.waitTitle,
        alertsTexts.waitMessage
      );
      return;
    }

    // Si hay código, debe estar validado antes de confirmar
    if (code && !isCodeValidated) {
      alertService.showInfoAlert(
        alertsTexts.codeRequiredTitle,
        alertsTexts.codeRequiredMessage
      );
      return;
    }

    try {
      setConfirming(true);
      console.log('💵 Conductor confirmando pago en efectivo...');

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      // ✅ CORRECCIÓN: SIEMPRE usar rideId (Firebase ID), NO pgRideId
      // pgRideId es para PostgreSQL, confirmCashPayment necesita el Firebase rideId
      console.log(`💳 [PaymentConfirmation] Usando Firebase rideId: ${rideId} (pgRideId: ${pgRideId})`);

      const functions = getFunctions(app);
      const confirmCashPaymentFn = httpsCallable(functions, 'confirmCashPayment');
      
      const deviceId = await sessionService.getDeviceId();

      const authenticationMethod = code && isCodeValidated ? 'code' : undefined;
      const biometricType = code && isCodeValidated ? 'NOT_SUPPORTED' : undefined;
      const biometricAuthenticated = code && isCodeValidated ? false : undefined;

      const result = await confirmCashPaymentFn({ 
        rideId: rideId,  // ← SIEMPRE usar rideId (Firebase ID)
        amount: numericAmount,
        tip: numericTip,
        confirmedBy: 'driver',
        deviceId,
        authenticationMethod,
        biometricType,
        biometricAuthenticated,
      });
      
      const data = result.data as any;
      console.log('✅ Pago confirmado:', data);

      if (data.bothConfirmed) {
        alertService.showSuccessAlert(
          alertsTexts.cashConfirmedTitle,
          alertsTexts.cashConfirmedMessage,
          () => navigation.replace('AvailableRides')
        );
      }
    } catch (error: any) {
      console.error('❌ Error confirmando pago:', error);
      alertService.showErrorAlert(error.message || 'No se pudo confirmar el pago');
    } finally {
      setConfirming(false);
    }
  };

  // Cambiar método de pago
  const handleSwitchPaymentMethod = () => {
    // Tarjetas desactivadas temporalmente
    return;

    /*
    const newMethod = paymentMethod === 'cash' ? 'card' : 'cash';
    const methodName = newMethod === 'cash' ? methodNames.cash : methodNames.card;
    const methodLower = newMethod === 'cash' ? methodNames.cashLower : methodNames.cardLower;
    
    alertService.showConfirmAlert(
      t('driver.paymentConfirmation.alerts.methodChangeTitle', { method: methodName }),
      t('driver.paymentConfirmation.alerts.methodChangeMessage', { methodLower }),
      async () => {
        try {
          setSwitching(true);

          const { app } = await initializeFirebase();
          if (!app) throw new Error('Firebase no inicializado');

          const functions = getFunctions(app);
          const changePaymentMethodFn = httpsCallable(functions, 'changePaymentMethod');
          
          console.log(`🔄 Cambiando método de pago a ${newMethod}...`);
          console.log(`📍 Usando rideId: ${rideId} (pgRideId: ${pgRideId})`);
          const deviceId = await sessionService.getDeviceId();
          const result = await changePaymentMethodFn({
            rideId: pgRideId || rideId,  // ✅ Usar pgRideId si está disponible, sino rideId
            newPaymentMethod: newMethod,
            reason: paymentMethod === 'cash' ? 'no tiene efectivo' : 'prefiere pagar en efectivo',
            deviceId,
          });

          const data = result.data as any;
          console.log('✅ Método de pago cambiado:', data);

          // Actualizar estado local
          setPaymentMethod(newMethod);
          if (newMethod === 'card') {
            await validateCardsForCardPayment();
          }
          setClientConfirmed(false); // Reset confirmación

          alertService.showSuccessAlert(
            alertsTexts.methodChangeSuccessTitle,
            t('driver.paymentConfirmation.alerts.methodChangeSuccessMessage', { methodLower })
          );
        } catch (error: any) {
          console.error('❌ Error cambiando método de pago:', error);
          alertService.showErrorAlert(error.message || alertsTexts.genericError);
        } finally {
          setSwitching(false);
        }
      }
    );
    */
  };

  // Reportar problema
  const handleReportIssue = () => {
    alertService.showOptionsAlert(
      alertsTexts.reportTitle,
      alertsTexts.reportMessage,
      [
        {
          text: alertsTexts.reportOptions.noPay,
          onPress: () => handleCancelPayment('Cliente no pagó el monto acordado'),
        },
        {
          text: alertsTexts.reportOptions.wrongAmount,
          onPress: () => handleCancelPayment('Cliente pagó un monto diferente'),
        },
        {
          text: alertsTexts.reportOptions.cardIssue,
          onPress: () => handleCancelPayment('Problema procesando pago con tarjeta'),
        },
        {
          text: alertsTexts.reportOptions.other,
          onPress: () => handleCancelPayment('Otro problema con el pago'),
        },
        {
          text: alertsTexts.reportOptions.cancel,
          style: 'cancel',
        },
      ],
      true
    );
  };

  const handleCancelPayment = async (reason: string) => {
    try {
      setConfirming(true);

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      const functions = getFunctions(app);
      const cancelCashPayment = httpsCallable(functions, 'cancelCashPayment');
      
      console.log('🔄 Cancelando pago con razón:', reason);
      const deviceId = await sessionService.getDeviceId();
      await cancelCashPayment({ rideId, reason, deviceId });

      alertService.showInfoAlert(
        alertsTexts.cancelSuccessTitle,
        alertsTexts.cancelSuccessMessage,
        () => navigation.replace('AvailableRides')
      );
    } catch (error: any) {
      console.error('Error cancelando pago:', error);
      alertService.showErrorAlert(error.message || alertsTexts.genericError);
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{loadingText}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <PaymentConfirmationHeader
        paymentMethod={paymentMethod}
        headerTexts={headerTexts}
        clientName={clientName}
        colors={colors}
        t={t}
        styles={styles}
      />

      <PaymentConfirmationBreakdown
        breakdownTexts={breakdownTexts}
        numericAmount={numericAmount}
        numericTip={numericTip}
        totalAmount={totalAmount}
        styles={styles}
      />

      <View style={styles.methodBadge}>
        <MaterialIcons
          name={paymentMethod === 'cash' ? 'payments' : 'credit-card'}
          size={15}
          color={accentAlt}
        />
        <Text style={styles.methodBadgeText}>
          {t('driver.paymentConfirmation.methodBadge.label', {
            value: paymentMethod === 'cash' ? methodBadgeTexts.cash : methodBadgeTexts.card,
          })}
        </Text>
      </View>

      {paymentMethod === 'cash' && (
        <>
          <PaymentConfirmationCashStatus
            clientConfirmed={clientConfirmed}
            cashStatusTexts={cashStatusTexts}
            instructionsTexts={instructionsTexts}
            colors={colors}
            styles={styles}
          />

          <PaymentConfirmationCodeInput
            rideId={rideId}
            code={code}
            codeDigits={codeDigits}
            isCodeValidated={isCodeValidated}
            confirming={confirming}
            switching={switching}
            buttonTexts={buttonTexts}
            alertsTexts={alertsTexts}
            colors={colors}
            t={t}
            onSetCode={setCode}
            onSetCodeDigits={setCodeDigits}
            onSetIsCodeValidated={setIsCodeValidated}
            onSetConfirming={setConfirming}
            styles={styles}
          />

          <PaymentConfirmationActions
            rideId={rideId}
            buttonTexts={buttonTexts}
            confirming={confirming}
            switching={switching}
            onConfirmCash={handleConfirmCashPayment}
            onReportIssue={handleReportIssue}
            colors={colors}
            t={t}
            styles={styles}
          />
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (colors: any, accentAlt: string) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 28,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    marginTop: 44,
    marginBottom: 22,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: accentAlt + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  valueGreen: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 0,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginVertical: 14,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    backgroundColor: accentAlt + '14',
    borderWidth: 1,
    borderColor: accentAlt + '33',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  methodBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: accentAlt,
    letterSpacing: 0.1,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusCardSuccess: {
    backgroundColor: colors.success + '14',
    borderColor: colors.success + '40',
  },
  statusCardWarning: {
    backgroundColor: colors.warning + '14',
    borderColor: colors.warning + '40',
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconWrapSuccess: {
    backgroundColor: colors.success + '26',
  },
  statusIconWrapWarning: {
    backgroundColor: colors.warning + '26',
  },
  statusBody: {
    flex: 1,
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 15,
    color: colors.text,
    marginTop: 8,
  },
  statusTextSuccess: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  statusTextWarning: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  statusSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  statusDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 8,
  },
  instructionsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructionsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  instructionsText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 21,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 14,
  },
  codeBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  codeBox: {
    width: 58,
    height: 62,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.surface,
    fontVariant: ['tabular-nums'],
  },
  codeBoxValidated: {
    borderColor: colors.success,
    backgroundColor: colors.success + '14',
  },
  confirmButton: {
    marginBottom: 12,
  },
  switchButton: {
    marginBottom: 12,
  },
  disabledSwitchCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabledSwitchIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  disabledSwitchText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  disabledSwitchSubtext: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  reportButton: {
    marginBottom: 8,
  },
});
