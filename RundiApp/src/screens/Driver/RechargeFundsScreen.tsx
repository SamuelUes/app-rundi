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
import Ionicons from '@expo/vector-icons/Ionicons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import rechargeFundsService, {
  DriverRechargeFundsSummary,
  DriverRechargeHistoryItem,
} from '../../services/payment/rechargeFundsService';
import BiometricService from '../../services/user/biometricService';
import { logBiometric } from '../../api/platform';
import { initializeFirebase, getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { FS_COL } from '../../constants/firestore';
import { useTranslation } from 'react-i18next';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';
import RechargeInvoiceModal from '../../components/shared/RechargeInvoiceModal';
import { RechargeFundsSummary } from '../../components/driver/RechargeFunds/RechargeFundsSummary';
import { RechargeFundsInput } from '../../components/driver/RechargeFunds/RechargeFundsInput';
import { RechargeFundsHistory } from '../../components/driver/RechargeFunds/RechargeFundsHistory';

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

const HISTORY_PAGE_SIZE = 5;

const asText = (value: unknown, fallback: string = '-') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const movementToHistoryItem = (id: string, d: any, uid: string): DriverRechargeHistoryItem => {
  const created = d?.createdAt;
  return {
    id,
    driverId: uid,
    rideId: null,
    rechargeType: asText(d?.type, 'recharge'),
    source: asText(d?.source),
    amount: Number(d?.amount) || 0,
    balanceBefore: 0,
    balanceAfter: 0,
    externalReference: d?.externalReference ?? null,
    externalTransactionId: null,
    status: asText(d?.status, 'confirmed'),
    metadata: null,
    createdAt:
      typeof created?.toDate === 'function'
        ? created.toDate().toISOString()
        : created instanceof Date
          ? created.toISOString()
          : asText(created, '') || null,
  };
};

const mergeLiveMovements = (
  prev: DriverRechargeFundsSummary,
  live: DriverRechargeHistoryItem[],
): DriverRechargeFundsSummary => {
  const byId = new Map(prev.history.map((h) => [h.id, h]));
  live.forEach((h) => byId.set(h.id, h));
  const toTime = (v: unknown) => {
    const t = Date.parse(String(v ?? ''));
    return Number.isNaN(t) ? 0 : t;
  };
  const history = [...byId.values()].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
  const recharged = history.filter((h) => h.amount > 0);
  const deducted = history.filter((h) => h.amount < 0);
  return {
    ...prev,
    history,
    totals: {
      totalRecharged: recharged.reduce((a, h) => a + h.amount, 0),
      totalDeducted: Math.abs(deducted.reduce((a, h) => a + h.amount, 0)),
      rechargeCount: recharged.length,
      deductionCount: deducted.length,
    },
  };
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
  const inputTexts = t('driver.rechargeFunds.input', { returnObjects: true }) as {
    amountLabel: string;
    amountPlaceholder: string;
    referenceLabel: string;
    placeholder: string;
  };
  const historyTexts = t('driver.rechargeFunds.history', { returnObjects: true }) as {
    title: string;
    totalLabel: string;
    empty: string;
    sourceLabel: string;
    previous: string;
    next: string;
    page: string;
    statusLabels?: Record<string, string>;
  };
  const alertsTexts = t('driver.rechargeFunds.alerts', {
    returnObjects: true,
  }) as Record<string, string>;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DriverRechargeFundsSummary>(EMPTY_SUMMARY);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedMovement, setSelectedMovement] = useState<DriverRechargeHistoryItem | null>(null);
  const [invoiceVisible, setInvoiceVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const summaryResponse = await rechargeFundsService.getSummary(30);

        setSummary(summaryResponse?.success ? summaryResponse : EMPTY_SUMMARY);
      } catch (e) {
        setSummary(EMPTY_SUMMARY);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Saldo + movimientos en vivo — REALTIME_driver_wallet/{uid} proyectado por
  // el consumer: la confirmación de operaciones llega sin recargar la pantalla.
  useEffect(() => {
    let cancelled = false;
    let unsubDoc: (() => void) | undefined;
    let unsubMovs: (() => void) | undefined;
    void (async () => {
      try {
        const auth = await getFirebaseAuth();
        const uid = auth.currentUser?.uid;
        if (!uid || cancelled) return;
        const db = await getFirebaseFirestore();
        if (cancelled) return;
        const walletRef = doc(db, FS_COL.driverWallet, uid);
        unsubDoc = onSnapshot(walletRef, (snap) => {
          if (!snap.exists()) return;
          const balance = Number(snap.data().balance) || 0;
          setSummary((prev) => ({ ...prev, availableBalance: balance, blocked: balance <= 0 }));
        });
        const movsQ = query(
          collection(walletRef, 'movements'),
          orderBy('createdAt', 'desc'),
          limit(30),
        );
        unsubMovs = onSnapshot(movsQ, (qs) => {
          const live = qs.docs.map((ds) => movementToHistoryItem(ds.id, ds.data(), uid));
          if (live.length === 0) return;
          setSummary((prev) => mergeLiveMovements(prev, live));
        });
      } catch (e) {
        console.warn('⚠️ [RechargeFunds] wallet listener:', e);
      }
    })();
    return () => {
      cancelled = true;
      unsubDoc?.();
      unsubMovs?.();
    };
  }, []);

  const handlePay = async () => {
    const parsedAmount = Number(String(amount || '').replace(',', '.'));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(alertsTexts.invalidAmountTitle || alertsTexts.paymentErrorTitle, alertsTexts.invalidAmountMessage || alertsTexts.paymentErrorMessage);
      return;
    }

    const trimmedReference = reference.trim();
    if (!trimmedReference) {
      Alert.alert(
        alertsTexts.referenceRequiredTitle || alertsTexts.paymentErrorTitle,
        alertsTexts.referenceRequiredMessage || alertsTexts.paymentErrorMessage,
      );
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
        const isNonBlockingBiometricError =
          biometricResult.errorCode === 'NOT_SUPPORTED' ||
          biometricResult.errorCode === 'NOT_ENROLLED';

        if (isNonBlockingBiometricError) {
          console.log('Biometría no disponible o no registrada. Continuando sin autenticación biométrica.');
        } else {
          Alert.alert(alertsTexts.biometricErrorTitle, biometricResult.error || alertsTexts.biometricErrorMessage);
          return;
        }
      } else {
        try {
          const { app } = await initializeFirebase();
          if (app) {
            await logBiometric({
              biometricType: biometricResult.biometryType || 'biometric',
              context: 'recharge_funds',
              userType: 'driver',
              success: true,
            });
          }
        } catch (logError) {
          console.error('❌ Error registrando autenticación biométrica (recharge funds) vía Cloud Function:', logError);
        }
      }

      setSubmitting(true);
      const res = await rechargeFundsService.createRecharge({
        amount: totalToPay,
        method: 'manual',
        reference: trimmedReference,
      });
      if (res?.success) {
        const refreshedSummary = await rechargeFundsService.getSummary(30);
        setSummary(refreshedSummary?.success ? refreshedSummary : EMPTY_SUMMARY);
        setAmount('');
        setReference('');
        setHistoryPage(1);

        const isPending = res.pending || res.status === 'pending';
        const successMessage = isPending
          ? t('driver.rechargeFunds.alerts.pendingSuccessMessage', {
              amount: formatCurrency(totalToPay),
              reference: trimmedReference,
            })
          : t('driver.rechargeFunds.alerts.paymentSuccessMessage', {
              amount: formatCurrency(totalToPay),
              balance: formatCurrency(Number(res.availableBalance ?? refreshedSummary?.availableBalance ?? 0)),
            });
        Alert.alert(
          isPending ? alertsTexts.pendingSuccessTitle : alertsTexts.paymentSuccessTitle,
          successMessage,
          [
            {
              text: alertsTexts.paymentSuccessButton,
            },
          ],
        );
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
  const formatDateLabel = (value?: string | null) => {
    const raw = asText(value, '-');
    if (raw === '-') return '-';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString();
  };

  const rechargeHistory = useMemo(
    () =>
      (summary?.history || []).filter(
        (item) => item && (item.rechargeType === 'recharge' || Number(item.amount) > 0),
      ),
    [summary?.history],
  );

  const totalHistoryPages = Math.max(1, Math.ceil(rechargeHistory.length / HISTORY_PAGE_SIZE));

  useEffect(() => {
    setHistoryPage((prev) => Math.min(Math.max(prev, 1), totalHistoryPages));
  }, [totalHistoryPages]);

  const historyItems = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return rechargeHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [rechargeHistory, historyPage]);

  const openInvoice = (item: DriverRechargeHistoryItem) => {
    setSelectedMovement(item);
    setInvoiceVisible(true);
  };

  const parsedRechargeAmount = Number(String(amount || '').replace(',', '.'));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <LoadingIcon size={32} color={colors.primary} />
          <Text style={styles.loadingText}>{loadingText}</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <RechargeFundsSummary
            summary={summary}
            summaryTexts={summaryTexts}
            formatCurrency={formatCurrency}
            styles={styles}
          />

          <RechargeFundsInput
            amount={amount}
            reference={reference}
            submitting={submitting}
            parsedRechargeAmount={parsedRechargeAmount}
            inputTexts={inputTexts}
            colors={colors}
            onSetAmount={setAmount}
            onSetReference={setReference}
            onPay={handlePay}
            t={t}
            styles={styles}
          />

          <RechargeFundsHistory
            historyItems={historyItems}
            rechargeHistory={rechargeHistory}
            historyPage={historyPage}
            totalHistoryPages={totalHistoryPages}
            historyTexts={historyTexts}
            formatCurrency={formatCurrency}
            formatDateLabel={formatDateLabel}
            asText={asText}
            onOpenInvoice={openInvoice}
            onPrevPage={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
            onNextPage={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))}
            t={t}
            styles={styles}
          />
        </ScrollView>
      )}

      <RechargeInvoiceModal
        visible={invoiceVisible}
        movement={selectedMovement}
        onClose={() => {
          setInvoiceVisible(false);
          setSelectedMovement(null);
        }}
      />
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
      borderWidth: 0,
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
      borderWidth: 0,
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
      borderRadius: 16,
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

    historyCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      marginTop: 4,
    },
    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    historyTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    historyCounter: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    historyEmptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    historyList: {
      gap: 8,
    },
    historyItem: {
      borderRadius: 12,
      borderWidth: 0,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 3,
    },
    historyItemTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    historyItemAmount: {
      fontSize: 14,
      fontWeight: '800',
      color: accentColor,
    },
    historyItemStatus: {
      fontSize: 11,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    historyItemMeta: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    paginationRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2,
    },
    paginationBtn: {
      minWidth: 76,
      borderRadius: 10,
      borderWidth: 0,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    paginationBtnDisabled: {
      opacity: 0.45,
    },
    paginationBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    paginationText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
