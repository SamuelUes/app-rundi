import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { liveTripDocId } from '../../live/tripIds';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { logBiometric } from '../../api/platform';
import { initializeFirebase } from '../../config/firebase';
import { validateAndSaveCard, getCardsList, formatCardNumber, formatExpiryDate, isValidExpiryFormat, isValidCVV, detectCardBrand } from '../../utils/format/cardUtils';
import alertService from '../../services/notification/alertService';
import sessionService from '../../services/user/sessionService';
import BiometricService from '../../services/user/biometricService';
import type { Card as SavedCard } from '../../services/payment/cardsService';
import { useTranslation } from 'react-i18next';
import { useRideDetails } from '../../hooks/shared/ride/useRideDetails';
import { useSavedCards } from '../../hooks/shared/payment/useSavedCards';
import { usePaymentMethodListener } from '../../hooks/shared/payment/usePaymentMethodListener';
import { PaymentSummaryCard } from '../../components/client/Payment/PaymentSummaryCard';
import { PaymentCostCard } from '../../components/client/Payment/PaymentCostCard';
import { PaymentTipCard } from '../../components/client/Payment/PaymentTipCard';
import { PaymentMethodCard } from '../../components/client/Payment/PaymentMethodCard';
import { PaymentPayButton } from '../../components/client/Payment/PaymentPayButton';

interface PaymentScreenProps {
  route: {
    params: {
      rideId: string;
      amount: number;
      driverId?: string;
      driverName?: string;
      vehiclePlate?: string;
      isPendingPayment?: boolean; // ✅ NUEVO: Flag para pagos pendientes
    };
  };
  navigation: any;
}

export default function PaymentScreen({ route, navigation }: PaymentScreenProps) {
  const { rideId, amount, driverId, driverName, isPendingPayment = false } = route.params;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const accentAlt = isDark ? colors.SecondBorder : colors.primary;
  const styles = useMemo(() => createStyles(colors, accentAlt), [colors, accentAlt]);
  const [tip, setTip] = useState(0);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  // Tarjetas desactivadas temporalmente: forzar efectivo
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('cash');
  const [selectedBank, setSelectedBank] = useState<'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz'>('bac');
  const [processing, setProcessing] = useState(false);

  // Hooks compartidos
  const { rideDetails, loading } = useRideDetails(rideId, amount);
  const { savedCards, selectedCard, setSelectedCard, useNewCard, setUseNewCard, reload: reloadCards } = useSavedCards();

  const handleMethodChange = useCallback((newMethod: string) => {
    setPaymentMethod(newMethod as 'card' | 'cash');

    if (newMethod === 'cash' && !isPendingPayment) {
      const finalAmount = rideDetails?.finalFare || amount;
      const driverDisplayName = rideDetails?.driver?.name || driverName;
      const driverPhoto = rideDetails?.driver?.photoURL;

      navigation.replace('CashPayment', {
        rideId,
        amount: finalAmount,
        driverName: driverDisplayName,
        driverPhoto,
      });
    }
  }, [rideDetails, amount, driverName, isPendingPayment, navigation, rideId]);

  const {
    currentPaymentMethod,
    currentPaymentMethodRef,
    isNavigatingRef,
    changingPaymentMethod,
    changePaymentMethod,
  } = usePaymentMethodListener({
    rideId,
    isPendingPayment,
    onMethodChange: handleMethodChange,
  });

  // Formulario de tarjeta nueva
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [saveCard, setSaveCard] = useState(false);

  const tipOptions = [10, 15, 20]; // Porcentajes de propina

  // Obtener el monto del viaje (de params o de rideDetails)
  const rideAmount = amount || rideDetails?.finalFare || rideDetails?.estimatedPrice || 0;
  const formatCurrency = useCallback(
    (value: number) => t('shared.payment.currencyAmount', { amount: value.toFixed(2) }),
    [t],
  );

  const handleSelectPaymentMethod = async (method: 'card' | 'cash') => {
    if (changingPaymentMethod || processing) return;

    if (method !== 'cash') return;
    if (isPendingPayment && method === 'cash') return;
    if (paymentMethod === method && currentPaymentMethodRef.current === method) return;

    if (currentPaymentMethodRef.current === method) {
      setPaymentMethod(method);
      return;
    }

    try {
      await changePaymentMethod(method);
    } catch (error: any) {
      alertService.showErrorAlert(
        error.message || t('shared.payment.alerts.changeMethodError'),
      );
    }
  };

  const handleTipSelection = (percent: number) => {
    setSelectedTipPercent(percent);
    setCustomTip('');
    setTip(Math.round(rideAmount * (percent / 100)));
  };

  const handleCustomTip = (value: string) => {
    setCustomTip(value);
    setSelectedTipPercent(null);
    const tipAmount = parseFloat(value) || 0;
    setTip(tipAmount);
  };

  const handlePayment = async () => {
    // Tarjetas desactivadas temporalmente
    // if (paymentMethod === 'card') {
    //   await processCardPayment();
    // } else {
    //   await processCashPayment();
    // }
    await processCashPayment();
  };

  const processCardPayment = async () => {
    try {
      const totalToPay = rideAmount + tip;

      const biometricResult = await BiometricService.authenticate(
        t('shared.payment.biometric.prompt', { amount: totalToPay.toFixed(2) })
      );

      if (!biometricResult.success) {
        if (
          biometricResult.error === 'Dispositivo no soporta biometría' ||
          biometricResult.error === 'No hay biometría registrada'
        ) {
          console.log('Biometría no disponible o no registrada. Continuando sin autenticación biométrica.');
        } else {
          alertService.showErrorAlert(
            biometricResult.error || t('shared.payment.biometric.error'),
          );
          return;
        }
      } else {
        try {
          await logBiometric({
            rideId,
            biometricType: biometricResult.biometryType || 'biometric',
            context: 'card_payment_confirmation',
            userType: 'client',
            success: true,
          });
        } catch (logError) {
          console.error('❌ Error registrando autenticación biométrica (card):', logError);
        }
      }

      setProcessing(true);

      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');
      
      const db = await getFirebaseFirestore();

      // v2: no hay endpoints de tarjeta/Stripe (solo efectivo) — pagos con
      // tarjeta quedan explícitamente no soportados hasta que el backend
      // exponga createPaymentIntent/capturePayment equivalentes.
      const paymentSnap = await getDoc(doc(db, FS_COL.paymentsLive, await liveTripDocId(rideId)));
      const paymentData = paymentSnap.data();

      throw new Error(t('shared.payment.alerts.cardError'));
      // eslint-disable-next-line no-unreachable
      void paymentData;

      alertService.showSuccessAlert(
        t('shared.payment.alerts.cardSuccessTitle'),
        t('shared.payment.alerts.cardSuccessMessage', { amount: totalAmount.toFixed(2) }),
        () => {
          navigation.replace('Rating', {
            rideId,
            driverId: driverId || rideDetails?.driverId,
            role: 'client',
          });
        }
      );
    } catch (error: any) {
      console.error('Error capturando pago:', error);
      alertService.showErrorAlert(error.message || t('shared.payment.alerts.cardError'));
    } finally {
      setProcessing(false);
    }
  };

  const processCashPayment = async () => {
    try {
      setProcessing(true);

      // NOTA: La actualización de paymentStatus se hace desde el backend (Cloud Functions)
      // El cliente NO tiene permisos para escribir en /paymentStatus en Firebase Realtime DB
      // Esto es por seguridad - solo el backend puede actualizar estados de pago

      alertService.showInfoAlert(
        t('shared.payment.alerts.cashInfoTitle'),
        t('shared.payment.alerts.cashInfoMessage', { amount: totalAmount.toFixed(2) }),
        () => {
          navigation.replace('Rating', {
            rideId,
            driverId: driverId || rideDetails?.driverId,
            role: 'client',
          });
        }
      );
    } catch (error: any) {
      console.error('Error procesando pago en efectivo:', error);
      alertService.showErrorAlert(error.message || 'Error al procesar el pago');
    } finally {
      setProcessing(false);
    }
  };

  /**
   * Guardar tarjeta nueva
   */
  const handleSaveCard = async () => {
    try {
      // Validar campos
      if (!cardNumber.trim()) {
        alertService.showErrorAlert(t('shared.payment.alerts.missingCardNumber'));
        return;
      }

      if (!cardHolder.trim()) {
        alertService.showErrorAlert(t('shared.payment.alerts.missingCardHolder'));
        return;
      }

      if (!expiryDate.trim() || !isValidExpiryFormat(expiryDate)) {
        alertService.showErrorAlert(t('shared.payment.alerts.invalidExpiry'));
        return;
      }

      if (!cvv.trim() || !isValidCVV(cvv)) {
        alertService.showErrorAlert(t('shared.payment.alerts.invalidCVV'));
        return;
      }

      if (!selectedBank) {
        alertService.showErrorAlert(t('shared.payment.alerts.missingBank'));
        return;
      }

      setProcessing(true);

      const { month, year } = formatExpiryDate(expiryDate);
      const fullYear = year.length === 2 ? `20${year}` : year;
      const cleanedNumber = cardNumber.replace(/\s/g, '');
      const brand = detectCardBrand(cleanedNumber);

      // Guardar tarjeta utilizando servicio centralizado
      const result = await validateAndSaveCard(
        {
          cardNumber: cleanedNumber,
          expMonth: month,
          expYear: fullYear,
          cvv: cvv,
          cardholderName: cardHolder,
          bank: selectedBank,
          brand,
        },
        saveCard
      );

      console.log(`✅ Tarjeta guardada exitosamente: ${result.card.id}`);

      alertService.showSuccessAlert(
        t('shared.payment.alerts.saveCardSuccessTitle'),
        t('shared.payment.alerts.saveCardSuccessMessage', {
          brand: result.card.brand.toUpperCase(),
          last4: result.card.last4,
        }),
        () => {
          // Limpiar formulario
          setCardNumber('');
          setCardHolder('');
          setExpiryDate('');
          setCvv('');
          setSaveCard(false);
          setUseNewCard(false);

          // Recargar tarjetas
          reloadCards();
        }
      );
    } catch (error: any) {
      console.error('❌ Error guardando tarjeta:', error);
      alertService.showErrorAlert(error.message || t('shared.payment.alerts.saveCardError'));
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color="#000" />
        <Text style={styles.loadingText}>{t('shared.payment.loading')}</Text>
      </View>
    );
  }

  const totalAmount = rideAmount + tip;
  const headerTitle = t(
    isPendingPayment ? 'shared.payment.header.titlePending' : 'shared.payment.header.titleDefault',
  );
  const headerSubtitle = t(
    isPendingPayment ? 'shared.payment.header.subtitlePending' : 'shared.payment.header.subtitleDefault',
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{headerTitle}</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>

        {/* Resumen del viaje */}
        <PaymentSummaryCard rideDetails={rideDetails} colors={colors} styles={styles} t={t} />

        {/* Desglose de costos */}
        <PaymentCostCard
          rideAmount={rideAmount}
          tip={tip}
          totalAmount={totalAmount}
          formatCurrency={formatCurrency}
          styles={styles}
          t={t}
        />

        {/* Propina */}
        <PaymentTipCard
          tipOptions={tipOptions}
          rideAmount={rideAmount}
          selectedTipPercent={selectedTipPercent}
          customTip={customTip}
          onSelectTip={handleTipSelection}
          onCustomTip={handleCustomTip}
          formatCurrency={formatCurrency}
          styles={styles}
          t={t}
        />

        {/* Método de pago */}
        <PaymentMethodCard
          paymentMethod={paymentMethod}
          changingPaymentMethod={changingPaymentMethod}
          onSelectMethod={handleSelectPaymentMethod}
          colors={colors}
          styles={styles}
          t={t}
        />

        {/* Tarjetas Guardadas desactivadas temporalmente */}
        {false && (
          <View style={styles.savedCardsCard}>
            <View style={styles.savedCardsHeader}>
              <Text style={styles.savedCardsTitle}>{t('shared.payment.savedCards.title')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SavedCards')}>
                <Text style={styles.manageCardsLink}>{t('shared.payment.savedCards.manageLink')}</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de tarjetas guardadas */}
            {savedCards.map((card) => (
              <TouchableOpacity
                key={card.id}
                style={[
                  styles.savedCardItem,
                  selectedCard?.id === card.id && !useNewCard && styles.savedCardItemActive,
                ]}
                onPress={() => {
                  setSelectedCard(card);
                  setUseNewCard(false);
                }}
              >
                <Text style={styles.providerIcon}>🏦</Text>
                <View style={styles.savedCardInfo}>
                  <Text style={styles.savedCardBrand}>{card.brand.toUpperCase()}</Text>
                  <Text style={styles.savedCardNumber}>•••• {card.last4}</Text>
                  {card.isDefault && (
                    <Text style={styles.savedCardDefault}>
                      {t('shared.payment.savedCards.defaultBadge')}
                    </Text>
                  )}
                </View>
                {selectedCard?.id === card.id && !useNewCard && (
                  <Text style={styles.savedCardCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Opción para usar nueva tarjeta */}
            <TouchableOpacity
              style={[
                styles.savedCardItem,
                useNewCard && styles.savedCardItemActive,
              ]}
              onPress={() => {
                setSelectedCard(null);
                setUseNewCard(true);
              }}
            >
              <Text style={styles.savedCardIcon}>➕</Text>
              <View style={styles.savedCardInfo}>
                <Text style={styles.savedCardBrand}>{t('shared.payment.savedCards.newCardTitle')}</Text>
                <Text style={styles.savedCardNumber}>
                  {t('shared.payment.savedCards.newCardSubtitle')}
                </Text>
              </View>
              {useNewCard && <Text style={styles.savedCardCheck}>✓</Text>}
            </TouchableOpacity>

            <SupportChatShortcut
              style={{ marginBottom: 24 }}
              rideId={rideId}
              initialCategory={isPendingPayment ? 'payment' : 'service'}
              initialTitle={
                isPendingPayment
                  ? t('shared.payment.support.supportPendingTitle', 'Tengo dudas sobre mi pago pendiente')
                  : t('shared.payment.support.supportTitle', 'Ayuda con el pago de mi viaje')
              }
              label={t('shared.payment.support.supportLabel', '¿Necesitas ayuda con este pago?')}
              description={t(
                'shared.payment.support.supportDescription',
                'Abre un chat con soporte para revisar cargos, reembolsos o problemas con tu tarjeta.',
              )}
            />
          </View>
        )}

        {/* Selector de Proveedor de Pago desactivado temporalmente */}
        {false && (
          <View style={styles.providerCard}>
            <Text style={styles.providerTitle}>{t('shared.payment.banks.title')}</Text>
            
            <View style={styles.bankSelectionContainer}>
              <Text style={[styles.bankLabel, { color: colors.text }]}>
                {t('shared.payment.banks.selectLabel')}
              </Text>
              <View style={styles.bankButtonsRow}>
                {(['bac', 'banpro', 'lafise', 'ficohsa', 'avanz'] as const).map((bank) => (
                  <TouchableOpacity
                    key={bank}
                    style={[
                      styles.bankButton,
                      selectedBank === bank && styles.bankButtonActive,
                      { backgroundColor: selectedBank === bank ? colors.primary : colors.surface }
                    ]}
                    onPress={() => setSelectedBank(bank)}
                  >
                    <Text style={[
                      styles.bankButtonText,
                      { color: selectedBank === bank ? '#FFF' : colors.text }
                    ]}>
                      {bank.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Botón de pago */}
        <PaymentPayButton
          isPendingPayment={isPendingPayment}
          processing={processing}
          onPay={handlePayment}
          colors={colors}
          styles={styles}
          t={t}
        />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any, accentAlt: string) => {
  const card = {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  };

  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  content: {
    padding: 20,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 22,
    marginTop: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  summaryCard: {
    ...card,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: accentAlt + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    width: 76,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    fontWeight: '600',
  },
  costCard: {
    ...card,
  },
  costTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  costLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  costValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 0,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginVertical: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  tipCard: {
    ...card,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  tipOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  tipButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  tipButtonActive: {
    backgroundColor: colors.primary + '14',
    borderColor: colors.primary,
  },
  tipButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 3,
  },
  tipButtonTextActive: {
    color: colors.primary,
  },
  tipButtonAmount: {
    fontSize: 12,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  tipButtonAmountActive: {
    color: colors.primary,
  },
  customTipLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 8,
  },
  customTipInput: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  paymentMethodCard: {
    ...card,
  },
  paymentMethodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  methodButtonActive: {
    backgroundColor: colors.primary + '0F',
    borderColor: colors.primary,
  },
  methodIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: accentAlt + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  methodIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  methodDescription: {
    fontSize: 12.5,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  methodButtonDisabled: {
    opacity: 0.5,
    backgroundColor: colors.surface,
  },
  methodDescriptionDisabled: {
    color: colors.error,
    fontWeight: '500',
  },
  methodCheck: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
  },
  providerCard: {
    ...card,
  },
  providerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  providerButtonActive: {
    backgroundColor: colors.primary + '0F',
    borderColor: colors.primary,
  },
  providerIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  providerDescription: {
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  providerCheck: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
  },
  savedCardsCard: {
    ...card,
  },
  savedCardsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  savedCardsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  manageCardsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  savedCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  savedCardItemActive: {
    backgroundColor: colors.primary + '0F',
    borderColor: colors.primary,
  },
  savedCardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  savedCardInfo: {
    flex: 1,
  },
  savedCardBrand: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  savedCardNumber: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  savedCardDefault: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  savedCardCheck: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '700',
  },
  payButton: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  payButtonPending: {
    backgroundColor: colors.warning,
    shadowColor: colors.warning,
  },
  payButtonDisabled: {
    opacity: 0.7,
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  securityIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  bankSelectionContainer: {
    marginTop: 16,
  },
  bankLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  bankButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bankButton: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  bankButtonActive: {
    borderColor: colors.primary,
  },
  bankButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardFormContainer: {
    ...card,
  },
  cardFormTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  cardFormInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  cardFormRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardFormRowItem: {
    flex: 1,
  },
  saveCardCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  });
};
