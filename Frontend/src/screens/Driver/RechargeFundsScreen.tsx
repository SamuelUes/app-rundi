import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import rechargeFundsService, { DriverRechargeFundsSummary } from '../../services/rechargeFundsService';
import cardsService, { Card } from '../../services/cardsService';
import { maskCardNumber } from '../../utils/cardUtils';
import BiometricService from '../../services/biometricService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../config/firebase';
import { useTranslation } from 'react-i18next';
import SupportChatShortcut from '../../components/SupportChatShortcut';

const EMPTY_SUMMARY: DriverRechargeFundsSummary = {
  success: false,
  driverId: '',
  availableBalance: 0,
  blocked: true,
  totals: {
    totalRecharged: 0,
    totalDeducted: 0,
    rechargeCount: 0,
    deductionCount: 0,
  },
  history: [],
};

export default function RechargeFundsScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const accentColor = isDark ? '#D8A15F' : '#B77734';
  const styles = useMemo(() => createStyles(colors, accentColor), [colors, accentColor]);
  const { t } = useTranslation();
  const headerTitle = t('driver.rechargeFunds.header.title');
  const loadingText = t('driver.rechargeFunds.loading');
  const summaryTexts = t('driver.rechargeFunds.summary', {
    returnObjects: true,
  }) as {
    title: string;
    currentBalanceLabel: string;
    totalRechargedLabel: string;
    totalDeductedLabel: string;
    hint: string;
  };
  const methodsTexts = t('driver.rechargeFunds.methods', {
    returnObjects: true,
  }) as {
    title: string;
    cardTitle: string;
    cardDescription: string;
    cardEmpty: string;
    cardManageLink: string;
    bankTitle: string;
    bankDescription: string;
  };
  const infoTexts = t('driver.rechargeFunds.info', { returnObjects: true }) as { title: string };
  const inputTexts = t('driver.rechargeFunds.input', { returnObjects: true }) as {
    amountLabel: string;
    amountPlaceholder: string;
    referenceLabel: string;
    placeholder: string;
  };
  const alertsTexts = t('driver.rechargeFunds.alerts', {
    returnObjects: true,
  }) as Record<string, string>;
  const cardsTexts = t('driver.rechargeFunds.cards', {
    returnObjects: true,
  }) as { defaultBadge?: string };
  const navigationTexts = t('driver.rechargeFunds.navigation', {
    returnObjects: true,
  }) as { goToPaymentMethods: string };

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DriverRechargeFundsSummary>(EMPTY_SUMMARY);
  const [submitting, setSubmitting] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'bank_transfer' | 'card'>('bank_transfer');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [summaryResponse, savedCards] = await Promise.all([
          rechargeFundsService.getSummary(30),
          cardsService.getCards(),
        ]);

        setSummary(summaryResponse?.success ? summaryResponse : EMPTY_SUMMARY);

        const activeCards = (savedCards || []).filter((card: Card) => card && card.isActive);
        setCards(activeCards);
        if (activeCards.length > 0) {
          setSelectedMethod('card');
          const defaultCard = activeCards.find((c: Card) => c.isDefault) || activeCards[0];
          setSelectedCardId(defaultCard.id);
        } else {
          setSelectedMethod('bank_transfer');
          setSelectedCardId(null);
        }
      } catch (e) {
        setSummary(EMPTY_SUMMARY);
        setCards([]);
        setSelectedMethod('bank_transfer');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handlePay = async () => {
    const parsedAmount = Number(String(amount || '').replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(alertsTexts.invalidAmountTitle || alertsTexts.paymentErrorTitle, alertsTexts.invalidAmountMessage || alertsTexts.paymentErrorMessage);
      return;
    }
    if (selectedMethod === 'card' && !selectedCardId) {
      Alert.alert(alertsTexts.selectCardTitle, alertsTexts.selectCardMessage);
      return;
    }
    try {
      const totalToPay = parsedAmount;

      const biometricResult = await BiometricService.authenticate(
        t('driver.rechargeFunds.alerts.biometricPrompt', {
          amount: formatCurrency(totalToPay),
        })
      );

      if (!biometricResult.success) {
        if (
          biometricResult.error === 'Dispositivo no soporta biometría' ||
          biometricResult.error === 'No hay biometría registrada'
        ) {
          console.log('Biometría no disponible o no registrada. Continuando sin autenticación biométrica.');
        } else {
          Alert.alert(alertsTexts.biometricErrorTitle, biometricResult.error || alertsTexts.biometricErrorMessage);
          return;
        }
      } else {
        try {
          const { app } = await initializeFirebase();
          if (app) {
            const functions = getFunctions(app);
            const createBiometricAuthFn = httpsCallable(functions, 'createBiometricAuthSeq');
            await createBiometricAuthFn({
              rideId: null,
              biometricType: biometricResult.biometryType || 'biometric',
              context: 'recharge_funds',
              userType: 'driver',
            });
          }
        } catch (logError) {
          console.error('❌ Error registrando autenticación biométrica (recharge funds) vía Cloud Function:', logError);
        }
      }

      setSubmitting(true);
      const res = await rechargeFundsService.createRecharge({
        amount: totalToPay,
        reference: reference || undefined,
        method: selectedMethod,
        cardId: selectedMethod === 'card' ? selectedCardId || undefined : undefined,
      });
      if (res?.success) {
        const refreshedSummary = await rechargeFundsService.getSummary(30);
        setSummary(refreshedSummary?.success ? refreshedSummary : EMPTY_SUMMARY);
        setAmount('');
        setReference('');

        const successMessage = t('driver.rechargeFunds.alerts.paymentSuccessMessage', {
          amount: formatCurrency(totalToPay),
          balance: formatCurrency(Number(res.availableBalance ?? refreshedSummary?.availableBalance ?? 0)),
        });
        Alert.alert(alertsTexts.paymentSuccessTitle, successMessage, [
          {
            text: alertsTexts.paymentSuccessButton,
          },
        ]);
      } else {
        Alert.alert(alertsTexts.paymentErrorTitle, alertsTexts.paymentErrorMessage);
      }
    } catch (e: any) {
      Alert.alert(alertsTexts.paymentErrorTitle, e?.message || alertsTexts.paymentErrorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (navigation?.canGoBack?.() && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Earnings');
    }
  };

  const formatCurrency = (n: number) => `C$${Number(n || 0).toFixed(2)}`;
  const parsedRechargeAmount = Number(String(amount || '').replace(',', '.'));

  const renderPaymentMethods = () => {
    const hasCards = cards.length > 0;

    return (
      <View style={styles.methodsContainer}>
        <Text style={styles.methodsTitle}>{methodsTexts.title}</Text>

        <TouchableOpacity
          style={[
            styles.methodOption,
            selectedMethod === 'card' && styles.methodOptionSelected,
          ]}
          onPress={() => setSelectedMethod('card')}
          activeOpacity={0.8}
        >
          <View style={styles.methodOptionHeader}>
            <View style={styles.methodOptionHeaderLeft}>
              <View style={styles.methodOptionIconBadge}>
                <Text style={styles.methodOptionIcon}>C</Text>
              </View>
              <Text style={styles.methodOptionLabel}>{methodsTexts.cardTitle}</Text>
            </View>
            <View style={[styles.radioDot, selectedMethod === 'card' && styles.radioDotActive]}>
              {selectedMethod === 'card' && <View style={styles.radioDotInner} />}
            </View>
          </View>
          <Text style={styles.methodOptionDescription}>
            {methodsTexts.cardDescription}
          </Text>

          {hasCards && selectedMethod === 'card' && (
            <View style={styles.cardsList}>
              {cards.map((card) => {
                const isSelected = selectedCardId === card.id;
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={[styles.cardItem, isSelected && styles.cardItemSelected]}
                    onPress={() => setSelectedCardId(card.id)}
                  >
                    <Text style={styles.cardItemLabel}>
                      {`${card.brand.toUpperCase()} ${maskCardNumber(card.last4)} · Exp ${card.expMonth}/${card.expYear}`}
                      {card.isDefault ? cardsTexts.defaultBadge ?? '' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!hasCards && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.methodOptionDescription}>
                {methodsTexts.cardEmpty}
              </Text>
              {/* Tarjetas desactivadas temporalmente
              <TouchableOpacity
                style={{ marginTop: 8 }}
                onPress={() => navigation.navigate('PaymentMethods')}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardItemLabel, { color: colors.primary }]}>
                  {navigationTexts.goToPaymentMethods}
                </Text>
              </TouchableOpacity>
              */}
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.methodOption,
            selectedMethod === 'bank_transfer' && styles.methodOptionSelected,
          ]}
          onPress={() => setSelectedMethod('bank_transfer')}
          activeOpacity={0.8}
        >
          <View style={styles.methodOptionHeader}>
            <View style={styles.methodOptionHeaderLeft}>
              <View style={styles.methodOptionIconBadge}>
                <Text style={styles.methodOptionIcon}>T</Text>
              </View>
              <Text style={styles.methodOptionLabel}>{methodsTexts.bankTitle}</Text>
            </View>
            <View style={[styles.radioDot, selectedMethod === 'bank_transfer' && styles.radioDotActive]}>
              {selectedMethod === 'bank_transfer' && <View style={styles.radioDotInner} />}
            </View>
          </View>
          <Text style={styles.methodOptionDescription}>
            {methodsTexts.bankDescription}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Image
            source={require('../../assets/icons/back_button/back_button.png')}
            style={[styles.backIcon, { tintColor: colors.text }]}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{summaryTexts.title}</Text>

            <View style={styles.summaryHighlight}>
              <Text style={styles.summaryHighlightAmount}>{formatCurrency(summary?.availableBalance ?? 0)}</Text>
              <Text style={styles.summaryHighlightLabel}>
                {summaryTexts.currentBalanceLabel}
              </Text>
            </View>

            <View style={styles.summaryBreakdown}>
              <View style={styles.summaryBreakdownItem}>
                <View style={styles.summaryBreakdownText}>
                  <Text style={styles.summaryBreakdownLabel}>{summaryTexts.totalRechargedLabel}</Text>
                </View>
                <Text style={styles.summaryBreakdownValue}>
                  {`${summary?.totals?.rechargeCount ?? 0} · ${formatCurrency(summary?.totals?.totalRecharged ?? 0)}`}
                </Text>
              </View>

              <View style={styles.summaryBreakdownItem}>
                <View style={styles.summaryBreakdownText}>
                  <Text style={styles.summaryBreakdownLabel}>{summaryTexts.totalDeductedLabel}</Text>
                </View>
                <Text style={styles.summaryBreakdownValue}>
                  {`${summary?.totals?.deductionCount ?? 0} · ${formatCurrency(summary?.totals?.totalDeducted ?? 0)}`}
                </Text>
              </View>
            </View>

            <Text style={styles.summaryHint}>{summaryTexts.hint}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>{infoTexts.title}</Text>
            {renderPaymentMethods()}
          </View>

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>{inputTexts.amountLabel}</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder={inputTexts.amountPlaceholder}
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              keyboardType="decimal-pad"
            />

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>{inputTexts.referenceLabel}</Text>
            <TextInput
              value={reference}
              onChangeText={setReference}
              placeholder={inputTexts.placeholder}
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.payButton,
              (submitting || parsedRechargeAmount <= 0 || (selectedMethod === 'card' && !selectedCardId)) &&
                styles.payButtonDisabled,
            ]}
            disabled={submitting || parsedRechargeAmount <= 0 || (selectedMethod === 'card' && !selectedCardId)}
            onPress={handlePay}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payButtonText}>
                {t('driver.rechargeFunds.button.pay', {
                  amount: formatCurrency(parsedRechargeAmount > 0 ? parsedRechargeAmount : 0),
                })}
              </Text>
            )}
          </TouchableOpacity>

          <SupportChatShortcut
            style={{ marginTop: 16 }}
            initialCategory="payment"
            initialTitle={t('driver.rechargeFunds.support.title')}
            label={t('driver.rechargeFunds.support.label')}
            description={t('driver.rechargeFunds.support.description')}
          />
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: any, accentColor: string) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingTop: 46,
      paddingBottom: 8,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backIcon: { width: 28, height: 28 },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    headerSpacer: { width: 40 },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { marginTop: 8, color: colors.textSecondary },

    content: { flex: 1 },
    contentContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 16 },

    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    summaryTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      paddingHorizontal: 20,
      paddingTop: 20,
      marginBottom: 10,
    },
    summaryHighlight: {
      marginHorizontal: 20,
      marginBottom: 14,
      paddingHorizontal: 18,
      paddingVertical: 16,
      borderRadius: 18,
      backgroundColor: 'rgba(183, 119, 52, 0.08)',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(183, 119, 52, 0.28)',
    },
    summaryHighlightAmount: {
      fontSize: 32,
      fontWeight: '800',
      color: accentColor,
    },
    summaryHighlightLabel: {
      marginTop: 4,
      fontSize: 13,
      color: colors.textSecondary,
    },
    summaryBreakdown: {
      gap: 12,
      paddingHorizontal: 20,
    },
    summaryBreakdownItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surface,
    },
    summaryBreakdownText: {
      flex: 1,
      paddingRight: 12,
      gap: 4,
    },
    summaryBreakdownLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    summaryBreakdownCaption: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    summaryBreakdownValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    summaryHint: {
      marginTop: 14,
      marginHorizontal: 20,
      marginBottom: 18,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },

    infoCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 10 },
    methodsContainer: { gap: 12 },
    methodsTitle: { fontSize: 14, color: colors.textSecondary },
    methodOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      backgroundColor: colors.surface,
    },
    methodOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    methodOptionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    methodOptionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      paddingRight: 10,
    },
    methodOptionIconBadge: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: 'rgba(183, 119, 52, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    methodOptionIcon: {
      fontSize: 12,
      fontWeight: '800',
      color: accentColor,
    },
    methodOptionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    radioDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDotActive: {
      borderColor: colors.primary,
    },
    radioDotInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    methodOptionDescription: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    cardsList: { marginTop: 8, gap: 8 },
    cardItem: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 10,
      backgroundColor: colors.background,
    },
    cardItemSelected: {
      borderColor: colors.primary,
    },
    cardItemLabel: { fontSize: 13, color: colors.text, fontWeight: '500' },

    inputCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 10 },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },

    payButton: {
      backgroundColor: '#2E7D32',
      paddingVertical: 16,
      alignItems: 'center',
      borderRadius: 999,
      shadowColor: '#2E7D32',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    payButtonDisabled: {
      backgroundColor: '#9E9E9E',
      shadowOpacity: 0,
      elevation: 0,
    },
    payButtonText: { fontSize: 15, color: '#fff', fontWeight: '800', letterSpacing: 0.2 },
  });
