/**
 * PaymentConfirmationScreen - Pantalla Unificada de Confirmación de Pago
 * 
 * Maneja ambos métodos de pago (cash y card) en una sola pantalla
 * Permite al conductor cambiar el método de pago si es necesario
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { AnimatedButton } from '../../components/AnimatedButton';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDatabase, ref, onValue, off } from 'firebase/database';
import { initializeFirebase } from '../../config/firebase';
import cardsService from '../../services/cardsService';
import alertService from '../../services/alertService';
import sessionService from '../../services/sessionService';
import { useTranslation } from 'react-i18next';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  };
  const methodNames = t('driver.paymentConfirmation.methodNames', {
    returnObjects: true,
  }) as { cash: string; card: string; cashLower: string; cardLower: string };

  // Estados
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>(initialMethod);
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [hasCardOnFile, setHasCardOnFile] = useState<boolean | null>(null);

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
          () => navigation.navigate('PaymentMethods'),
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
            setPaymentStatus(data);
            
            // Actualizar método de pago si cambió
            if (data.method && data.method !== paymentMethod) {
              console.log(`🔄 Método actualizado: ${paymentMethod} → ${data.method}`);
              setPaymentMethod(data.method);
            }

            // Verificar confirmación del cliente
            setClientConfirmed(data.confirmedByClient === true || data.clientConfirmed === true);

            // Si el pago fue completado
            if (data.status === 'completed' || data.status === 'confirmed') {
              console.log('✅ Pago completado');
              alertService.showSuccessAlert(
              alertsTexts.paymentCompletedTitle,
              alertsTexts.paymentCompletedMessage,
              () => navigation.replace('AvailableRides')
            );
            }
          }
          
          setLoading(false);
        });

        // Listener para activeRides (detectar cambios de método)
        const unsubscribeRide = onValue(rideRef, (snapshot) => {
          const data = snapshot.val();
          if (data?.paymentMethod && data.paymentMethod !== paymentMethod) {
            console.log(`🔄 Método de pago cambiado en ride: ${data.paymentMethod}`);
            setPaymentMethod(data.paymentMethod);
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
    if (!clientConfirmed) {
      alertService.showInfoAlert(
        alertsTexts.waitTitle,
        alertsTexts.waitMessage
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
      const result = await confirmCashPaymentFn({ 
        rideId: rideId,  // ← SIEMPRE usar rideId (Firebase ID)
        amount: numericAmount,
        tip: numericTip,
        confirmedBy: 'driver',
        deviceId,
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
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{loadingText}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.icon}>
          {paymentMethod === 'cash' ? '💵' : '💳'}
        </Text>
        <Text style={styles.title}>
          {paymentMethod === 'cash' ? headerTexts.cashTitle : headerTexts.cardTitle}
        </Text>
        <Text style={styles.subtitle}>
          {paymentMethod === 'cash'
            ? t('driver.paymentConfirmation.header.cashSubtitle', { name: clientName })
            : t('driver.paymentConfirmation.header.cardSubtitle', { name: clientName })}
        </Text>
      </View>

      {/* Amount Breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{breakdownTexts.title}</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>{breakdownTexts.fare}</Text>
          <Text style={styles.value}>C${numericAmount.toFixed(2)}</Text>
        </View>

        {numericTip > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>{breakdownTexts.tip}</Text>
            <Text style={styles.valueGreen}>+C${numericTip.toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.totalLabel}>{breakdownTexts.total}</Text>
          <Text style={styles.totalValue}>C${totalAmount.toFixed(2)}</Text>
        </View>
      </View>

      {/* Payment Method Badge */}
      <View style={styles.methodBadge}>
        <Text style={styles.methodBadgeText}>
          {t('driver.paymentConfirmation.methodBadge.label', {
            value: paymentMethod === 'cash' ? methodBadgeTexts.cash : methodBadgeTexts.card,
          })}
        </Text>
      </View>

      {/* CASH PAYMENT FLOW */}
      {paymentMethod === 'cash' && (
        <>
          {/* Estado de confirmación del cliente */}
          {clientConfirmed ? (
            <View style={[styles.statusCard, styles.statusCardSuccess]}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusTextSuccess}>{cashStatusTexts.confirmedTitle}</Text>
              <Text style={styles.statusSubtext}>{cashStatusTexts.confirmedSubtitle}</Text>
            </View>
          ) : (
            <View style={[styles.statusCard, styles.statusCardWarning]}>
              <Text style={styles.statusIcon}>⏳</Text>
              <Text style={styles.statusTextWarning}>{cashStatusTexts.waitingTitle}</Text>
              <Text style={styles.statusSubtext}>{cashStatusTexts.waitingSubtitle}</Text>
            </View>
          )}

          {/* Instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>{instructionsTexts.title}</Text>
            <Text style={styles.instructionsText}>{instructionsTexts.text}</Text>
          </View>

          {/* Confirm Button */}
          <AnimatedButton
            title={buttonTexts.confirmCash}
            onPress={handleConfirmCashPayment}
            loading={confirming}
            disabled={confirming || switching}
            style={styles.confirmButton}
          />
        </>
      )}

      {/* CARD PAYMENT FLOW */}
      {paymentMethod === 'card' && (
        <>
          {/* Status */}
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                {paymentStatus?.status === 'processing'
                  ? cardStatusTexts.processing
                  : paymentStatus?.status === 'pending'
                  ? cardStatusTexts.pending
                  : cardStatusTexts.verifying}
              </Text>
            </View>
            <Text style={styles.statusDescription}>
              {cardStatusTexts.description}
            </Text>
          </View>

          {/* Info */}
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <Text style={styles.infoText}>{cardStatusTexts.infoMessage}</Text>
          </View>
        </>
      )}

      {/* Switch Payment Method Button */}
      {!clientConfirmed ? (
        <AnimatedButton
          title={paymentMethod === 'cash' ? buttonTexts.switchToCard : buttonTexts.switchToCash}
          onPress={handleSwitchPaymentMethod}
          variant="secondary"
          loading={switching}
          disabled={confirming || switching}
          style={styles.switchButton}
        />
      ) : (
        <View style={styles.disabledSwitchCard}>
          <Text style={styles.disabledSwitchIcon}>🔒</Text>
          <Text style={styles.disabledSwitchText}>
            {switchDisabledTexts.title}
          </Text>
          <Text style={styles.disabledSwitchSubtext}>
            {switchDisabledTexts.subtitle}
          </Text>
        </View>
      )}

      {/* Report Problem Button */}
      <AnimatedButton
        title={buttonTexts.reportIssue}
        onPress={handleReportIssue}
        variant="outline"
        disabled={confirming || switching}
        style={styles.reportButton}
      />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
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
    marginTop: 20,
    marginBottom: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...colors.shadow,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  valueGreen: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  methodBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  methodBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  statusCardSuccess: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  statusCardWarning: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  statusTextSuccess: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E7D32',
    textAlign: 'center',
  },
  statusTextWarning: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F57C00',
    textAlign: 'center',
  },
  statusSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
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
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  instructionsCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#1565C0',
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  infoIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
  confirmButton: {
    marginBottom: 12,
  },
  switchButton: {
    marginBottom: 12,
  },
  disabledSwitchCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  disabledSwitchIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  disabledSwitchText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#757575',
    textAlign: 'center',
    marginBottom: 4,
  },
  disabledSwitchSubtext: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  reportButton: {
    marginBottom: 20,
  },
});
