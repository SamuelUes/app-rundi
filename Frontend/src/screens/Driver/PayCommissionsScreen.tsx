import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import penaltiesService, { DriverPenaltySummary, PayAllPenaltiesResult } from '../../services/penaltiesService';
import cardsService, { Card } from '../../services/cardsService';
import { maskCardNumber } from '../../utils/cardUtils';
import BiometricService from '../../services/biometricService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../config/firebase';
import { useTranslation } from 'react-i18next';

const EMPTY_SUMMARY: DriverPenaltySummary = {
  success: false,
  driverId: '',
  pendingCount: 0,
  pendingAmount: 0,
  penalties: { count: 0, amount: 0 },
  payments: { count: 0, amount: 0 },
  paymentDetails: [],
};

export default function PayCommissionsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { t } = useTranslation();
  const headerTitle = t('driver.payComission.header.title');
  const loadingText = t('driver.payComission.loading');
  const summaryTexts = t('driver.payComission.summary', {
    returnObjects: true,
  }) as {
    title: string;
    paymentsTitle: string;
    paymentsCaption: string;
    penaltiesTitle: string;
    penaltiesCaption: string;
    hint: string;
  };
  const methodsTexts = t('driver.payComission.methods', {
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
  const infoTexts = t('driver.payComission.info', { returnObjects: true }) as { title: string };
  const inputTexts = t('driver.payComission.input', { returnObjects: true }) as {
    label: string;
    placeholder: string;
  };
  const buttonTexts = t('driver.payComission.button', { returnObjects: true }) as { pay: string };
  const alertsTexts = t('driver.payComission.alerts', {
    returnObjects: true,
  }) as Record<string, string>;
  const cardsTexts = t('driver.payComission.cards', {
    returnObjects: true,
  }) as { defaultBadge?: string };
  const navigationTexts = t('driver.payComission.navigation', {
    returnObjects: true,
  }) as { goToPaymentMethods: string };

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DriverPenaltySummary>(EMPTY_SUMMARY);
  const [submitting, setSubmitting] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<'bank_transfer' | 'card'>('bank_transfer');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [summaryResponse, savedCards] = await Promise.all([
          penaltiesService.getDriverPenaltySummary(),
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
    if (!summary || summary.pendingAmount <= 0) {
      Alert.alert(alertsTexts.noCommissionsTitle, alertsTexts.noCommissionsMessage);
      return;
    }
    if (selectedMethod === 'card' && !selectedCardId) {
      Alert.alert(alertsTexts.selectCardTitle, alertsTexts.selectCardMessage);
      return;
    }
    try {
      const totalToPay = summary.pendingAmount || 0;

      const biometricResult = await BiometricService.authenticate(
        t('driver.payComission.alerts.biometricPrompt', {
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
              context: 'commission_payment',
              userType: 'driver',
            });
          }
        } catch (logError) {
          console.error('❌ Error registrando autenticación biométrica (commissions) vía Cloud Function:', logError);
        }
      }

      setSubmitting(true);
      const res: PayAllPenaltiesResult = await penaltiesService.payAllPenalties({
        reference: reference || undefined,
        method: selectedMethod,
        cardId: selectedMethod === 'card' ? selectedCardId || undefined : undefined,
      });
      if (res?.success) {
        const penaltiesPaid = res.breakdown?.penaltiesPaid ?? 0;
        const paymentsPaid = res.breakdown?.paymentCommissionsPaid ?? 0;
        const detailMessage = t('driver.payComission.alerts.detailTemplate', {
          penaltiesCount: penaltiesPaid,
          penaltiesAmount: formatCurrency(res.breakdown?.penaltiesAmount ?? 0),
          commissionsCount: paymentsPaid,
          commissionsAmount: formatCurrency(res.breakdown?.paymentCommissionsAmount ?? 0),
        });
        const successMessage = t('driver.payComission.alerts.paymentSuccessMessage', {
          amount: formatCurrency(res.totalPaid ?? 0),
          concepts: res.changed ?? 0,
          details: detailMessage,
        });
        Alert.alert(alertsTexts.paymentSuccessTitle, successMessage, [
          {
            text: alertsTexts.paymentSuccessButton,
            onPress: () => navigation.replace('Earnings'),
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

  const renderPaymentMethods = () => {
    const hasCards = cards.length > 0;

    return (
      <View style={styles.methodsContainer}>
        <Text style={styles.methodsTitle}>{methodsTexts.title}</Text>

        {/* Método principal: Tarjeta guardada */}
        <TouchableOpacity
          style={[
            styles.methodOption,
            selectedMethod === 'card' && styles.methodOptionSelected,
          ]}
          onPress={() => setSelectedMethod('card')}
          activeOpacity={0.8}
        >
          <View style={styles.methodOptionHeader}>
            <Text style={styles.methodOptionLabel}>{methodsTexts.cardTitle}</Text>
            {selectedMethod === 'card' && <MaterialIcons name="check" size={20} color={colors.primary} />}
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
              <TouchableOpacity
                style={{ marginTop: 8 }}
                onPress={() => navigation.navigate('PaymentMethods')}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardItemLabel, { color: colors.primary }]}>
                  {navigationTexts.goToPaymentMethods}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* Método secundario: Transferencia bancaria */}
        <TouchableOpacity
          style={[
            styles.methodOption,
            selectedMethod === 'bank_transfer' && styles.methodOptionSelected,
          ]}
          onPress={() => setSelectedMethod('bank_transfer')}
          activeOpacity={0.8}
        >
          <View style={styles.methodOptionHeader}>
            <Text style={styles.methodOptionLabel}>{methodsTexts.bankTitle}</Text>
            {selectedMethod === 'bank_transfer' && <MaterialIcons name="check" size={20} color={colors.primary} />}
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
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <LoadingIcon size={32} color={colors.primary} />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{summaryTexts.title}</Text>

            <View style={styles.summaryHighlight}>
              <Text style={styles.summaryHighlightAmount}>{formatCurrency(summary?.pendingAmount ?? 0)}</Text>
              <Text style={styles.summaryHighlightLabel}>
                {t('driver.payComission.summary.highlightLabel', {
                  count: summary?.pendingCount ?? 0,
                })}
              </Text>
            </View>

            <View style={styles.summaryBreakdown}>
              <View style={styles.summaryBreakdownItem}>
                <View style={styles.summaryBreakdownText}>
                  <Text style={styles.summaryBreakdownLabel}>{summaryTexts.paymentsTitle}</Text>
                  <Text style={styles.summaryBreakdownCaption}>{summaryTexts.paymentsCaption}</Text>
                </View>
                <Text style={styles.summaryBreakdownValue}>
                  {`${summary?.payments.count ?? 0} · ${formatCurrency(summary?.payments.amount ?? 0)}`}
                </Text>
              </View>

              <View style={styles.summaryBreakdownItem}>
                <View style={styles.summaryBreakdownText}>
                  <Text style={styles.summaryBreakdownLabel}>{summaryTexts.penaltiesTitle}</Text>
                  <Text style={styles.summaryBreakdownCaption}>{summaryTexts.penaltiesCaption}</Text>
                </View>
                <Text style={styles.summaryBreakdownValue}>
                  {`${summary?.penalties.count ?? 0} · ${formatCurrency(summary?.penalties.amount ?? 0)}`}
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
            <Text style={styles.inputLabel}>{inputTexts.label}</Text>
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
              (submitting || (summary?.pendingAmount ?? 0) <= 0 || (selectedMethod === 'card' && !selectedCardId)) &&
                styles.payButtonDisabled,
            ]}
            disabled={submitting || (summary?.pendingAmount ?? 0) <= 0 || (selectedMethod === 'card' && !selectedCardId)}
            onPress={handlePay}
            activeOpacity={0.85}
          >
            {submitting ? (
              <LoadingIcon size={20} color="#fff" />
            ) : (
              <Text style={styles.payButtonText}>
                {t('driver.payComission.button.pay', {
                  amount: formatCurrency(summary?.pendingAmount ?? 0),
                })}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.surface,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backButtonText: { fontSize: 24, color: colors.text },
    headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { marginTop: 8, color: colors.textSecondary },

    content: { flex: 1 },

    summaryCard: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 16,
    },
    summaryTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
    summaryHighlight: {
      marginTop: 8,
      marginBottom: 12,
      padding: 16,
      borderRadius: 12,
      backgroundColor: '#FFF5F5',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#FFCDD2',
    },
    summaryHighlightAmount: {
      fontSize: 24,
      fontWeight: '800',
      color: '#D84315',
    },
    summaryHighlightLabel: {
      marginTop: 4,
      fontSize: 13,
      color: '#BF360C',
    },
    summaryBreakdown: {
      gap: 12,
    },
    summaryBreakdownItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 4,
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
      marginTop: 16,
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },

    infoCard: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 16,
    },
    infoTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
    methodsContainer: { gap: 12 },
    methodsTitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
    methodOption: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      backgroundColor: colors.background,
    },
    methodOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.background,
    },
    methodOptionDisabled: {
      opacity: 0.45,
    },
    methodOptionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    methodOptionLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    methodOptionCheck: { fontSize: 18, color: colors.primary },
    methodOptionDescription: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
    cardsList: { marginTop: 8, gap: 8 },
    cardItem: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.surface,
    },
    cardItemSelected: {
      borderColor: colors.primary,
    },
    cardItemLabel: { fontSize: 13, color: colors.text, fontWeight: '500' },

    inputCard: {
      backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border,
      marginBottom: 24,
    },
    inputLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
    input: {
      backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 10, color: colors.text,
    },

    payButton: {
      backgroundColor: '#2E7D32', paddingVertical: 14, alignItems: 'center', borderRadius: 12,
    },
    payButtonDisabled: {
      backgroundColor: '#9E9E9E',
    },
    payButtonText: { fontSize: 15, color: '#fff', fontWeight: '800' },
  });
