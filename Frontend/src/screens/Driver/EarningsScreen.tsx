import React, { useState, useEffect, useMemo } from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';
import { SkeletonLoader, RideListSkeleton } from '../../components/ui/SkeletonLoader';
import { NoHistoryEmptyState } from '../../components/ui/EmptyState';
import earningsService, { EarningsSummary, RideEarning, DriverStats } from '../../services/earningsService';
import {
  formatCurrency as fmtCurrency,
  formatDate as fmtDate,
  formatDistance as fmtDistance,
  formatDurationMinutes as fmtDuration,
  formatStatNumber as fmtStatNum,
  formatStatCurrency as fmtStatCur,
  formatStatDuration as fmtStatDur,
  formatStatDistance as fmtStatDist,
  DATE_LOCALE_MAP,
} from '../../utils/earningsFormatters';
import { useEarningsScreenData } from '../../hooks/driver/EarningsScreen/useEarningsScreenData';
import { EarningsSummaryCard } from '../../components/driver/Earnings/EarningsSummaryCard';
import { EarningsCommissionBreakdown } from '../../components/driver/Earnings/EarningsCommissionBreakdown';
import { EarningsStatsSection } from '../../components/driver/Earnings/EarningsStatsSection';
import { EarningsRideList } from '../../components/driver/Earnings/EarningsRideList';

type Period = 'today' | 'week' | 'month';

export default function EarningsScreen() {
  const { colors, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const accentColor = isDark ? '#D8A15F' : '#B77734';
  const styles = useMemo(() => createStyles(colors, accentColor), [colors, accentColor]);
  const dateLocale = useMemo(
    () => DATE_LOCALE_MAP[i18n.language as keyof typeof DATE_LOCALE_MAP] ?? DATE_LOCALE_MAP.en,
    [i18n.language],
  );
  const navigation = useNavigation<any>();

  const [selectedPeriod, setSelectedPeriod] = useState<Period>('today');
  const { loading, refreshing, summary, rides, stats, onRefresh } = useEarningsScreenData(selectedPeriod);
  const [commissionBreakdown, setCommissionBreakdown] = useState<any>(null);
  const COMMISSION_NORMAL_PERCENT = '15%';
  const COMMISSION_DESIGNATED_PERCENT = '25%';
  const statPlaceholder = t('driver.earnings.stats.placeholder');

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      const actionType = e?.data?.action?.type;
      if (actionType !== 'GO_BACK' && actionType !== 'POP') {
        return;
      }

      e.preventDefault();
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'DriverHome' }],
        }),
      );
    });

    return unsubscribe;
  }, [navigation]);

  const formatCurrency = useMemo(() => (amount?: number | null) => fmtCurrency(t, amount), [t]);
  const formatDate = useMemo(() => (dateString: string) => fmtDate(dateString, dateLocale), [dateLocale]);
  const formatStatNumber = useMemo(() => (value?: number | null) => fmtStatNum(value, statPlaceholder), [statPlaceholder]);
  const formatStatCurrency = useMemo(() => (value?: number | null) => fmtStatCur(t, value, statPlaceholder), [t, statPlaceholder]);
  const formatStatDuration = useMemo(() => (value?: number | null) => fmtStatDur(t, value, statPlaceholder), [t, statPlaceholder]);
  const formatStatDistance = useMemo(() => (value?: number | null) => fmtStatDist(t, value, statPlaceholder), [t, statPlaceholder]);

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <LoadingIcon size={32} color={colors.primary} style={{ marginTop: 50 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('driver.earnings.header.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.balanceSection}>
        <Text style={styles.sectionTitle}>{t('driver.earnings.section.balance')}</Text>
        <View style={styles.segRail}>
          <TouchableOpacity
            style={[styles.segItem, selectedPeriod === 'today' && styles.segItemActive]}
            activeOpacity={0.85}
            onPress={() => setSelectedPeriod('today')}
          >
            <Text style={[styles.segText, selectedPeriod === 'today' && styles.segTextActive]}>
              {t('driver.earnings.period.today')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segItem, selectedPeriod === 'week' && styles.segItemActive]}
            activeOpacity={0.85}
            onPress={() => setSelectedPeriod('week')}
          >
            <Text style={[styles.segText, selectedPeriod === 'week' && styles.segTextActive]}>
              {t('driver.earnings.period.week')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segItem, selectedPeriod === 'month' && styles.segItemActive]}
            activeOpacity={0.85}
            onPress={() => setSelectedPeriod('month')}
          >
            <Text style={[styles.segText, selectedPeriod === 'month' && styles.segTextActive]}>
              {t('driver.earnings.period.month')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Card Resumen */}
      {summary && (
        <EarningsSummaryCard
          summary={summary}
          formatCurrency={formatCurrency}
          styles={styles}
          t={t}
        />
      )}

      <View style={styles.navigationButtons}>
        <TouchableOpacity
          style={styles.primaryNavButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('RechargeFunds')}
        >
          <MaterialIcons name="arrow-upward" size={16} color="#1A1206" />
          <Text style={styles.primaryNavText}>{t('driver.earnings.nav.commissions')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryNavButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('RideHistory')}
        >
          <MaterialIcons name="receipt-long" size={16} color={colors.text} />
          <Text style={styles.secondaryNavText}>{t('driver.earnings.nav.history')}</Text>
        </TouchableOpacity>
      </View>

      {/* Desglose de Comisiones */}
      {commissionBreakdown && (
        <EarningsCommissionBreakdown
          commissionBreakdown={commissionBreakdown}
          commissionNormalPercent={COMMISSION_NORMAL_PERCENT}
          commissionDesignatedPercent={COMMISSION_DESIGNATED_PERCENT}
          colors={colors}
          formatCurrency={formatCurrency}
          styles={styles}
          t={t}
        />
      )}

      {/* Estadísticas */}
      {stats && (
        <EarningsStatsSection
          stats={stats}
          formatStatNumber={formatStatNumber}
          formatStatCurrency={formatStatCurrency}
          formatStatDuration={formatStatDuration}
          formatStatDistance={formatStatDistance}
          colors={colors}
          styles={styles}
          t={t}
        />
      )}

      {/* Lista de viajes */}
      <EarningsRideList
        rides={rides}
        formatDate={formatDate}
        formatCurrency={formatCurrency}
        colors={colors}
        styles={styles}
        t={t}
      />

    </ScrollView>
  );
}

const createStyles = (colors: any, accentColor: string) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 46,
    paddingBottom: 8,
  },
  headerBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface || colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 42,
  },
  balanceSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  segRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface || colors.background,
  },
  segItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 11,
  },
  segItemActive: {
    backgroundColor: accentColor,
  },
  segText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  segTextActive: {
    color: '#1A1206',
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  summaryValues: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  summaryValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryValueLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  summaryValueText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  summaryCommissionText: {
    color: colors.error,
  },
  summaryNetRow: {
    backgroundColor: accentColor,
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryNetLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1206',
  },
  summaryNetValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1206',
    fontVariant: ['tabular-nums'],
  },
  splitRow: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  splitLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  splitValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  crewRoleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.primary + '1F',
    marginLeft: 6,
  },
  crewRoleChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  statsSection: {
    paddingHorizontal: 20,
    marginTop: 14,
  },
  statsGridChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statChip: {
    width: '48.5%',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  statChipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  statChipLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statChipValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 2,
    marginBottom: 4,
    gap: 10,
  },
  primaryNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentColor,
    borderRadius: 14,
    paddingVertical: 12,
    gap: 7,
  },
  primaryNavText: {
    color: '#1A1206',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface || colors.background,
  },
  secondaryNavText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },

  commissionCard: {
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 12,
    padding: 18,
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  commissionSection: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commissionBreakdown: {
    marginTop: 4,
    gap: 4,
    paddingLeft: 28,
  },
  commissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  commissionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingLeft: 28,
  },
  commissionDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  commissionAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
    fontVariant: ['tabular-nums'],
  },
  commissionAmountHighlight: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.error,
  },
  commissionRowTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingLeft: 28,
  },
  commissionSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 10,
    paddingLeft: 4,
  },
  commissionPaymentList: {
    marginTop: 6,
    gap: 8,
  },
  commissionPaymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commissionPaymentLeft: {
    flex: 1,
    gap: 2,
  },
  commissionPaymentRight: {
    alignItems: 'flex-end',
    minWidth: 70,
    gap: 2,
  },
  commissionPaymentMethod: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  commissionPaymentDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  commissionPaymentRide: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  commissionRateText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  commissionMoreText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  commissionTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  commissionTotalAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.error,
    fontVariant: ['tabular-nums'],
  },
  commissionGrandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commissionGrandTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  commissionGrandTotalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.error,
    fontVariant: ['tabular-nums'],
  },
  statsCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    backgroundColor: colors.card,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statsGridItem: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    alignItems: 'center',
  },
  statsGridValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  statsGridLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  ridesSection: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  ridesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  emptyState: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface || colors.background,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  rideCard: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideDate: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  paymentBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  paymentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rideLocations: {
    marginBottom: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 20,
  },
  routeMarkerCol: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.secondary,
  },
  routeConnector: {
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: colors.border,
    marginLeft: 8,
    marginVertical: 3,
  },
  rideLocation: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  rideDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  rideDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rideDetail: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rideEarnings: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rideEarningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rideEarningLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rideEarningValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  rideEarningRowTotal: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rideEarningLabelTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  rideEarningValueTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.success,
    fontVariant: ['tabular-nums'],
  },
  // Estilos para sistema de recargas
  cashSystemCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    backgroundColor: colors.card,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cashSystemTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  retentionAlert: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  retentionAlertIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  retentionAlertContent: {
    flex: 1,
  },
  retentionAlertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 4,
  },
  retentionAlertText: {
    fontSize: 12,
    color: '#E65100',
    lineHeight: 18,
  },
  pendingCashSection: {
    marginBottom: 12,
  },
  pendingCashHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingCashTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  rechargeButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rechargeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  pendingCashSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  pendingRidesList: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
  },
  pendingRideItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pendingRideDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  pendingRideCommission: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF5252',
  },
  moreRidesText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  noPendingCash: {
    padding: 20,
    alignItems: 'center',
  },
  noPendingCashText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  // Estilos del modal de recarga
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  modalClose: {
    fontSize: 28,
    color: colors.textSecondary,
    fontWeight: '300',
  },
  modalBody: {
    padding: 20,
  },
  pendingAmountCard: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  pendingAmountLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  pendingAmountValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF5252',
    marginBottom: 4,
  },
  pendingAmountNote: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTextArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  formHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  methodButton: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  methodButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  methodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  methodButtonTextActive: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  modalButtonSubmit: {
    flex: 1,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  modalButtonSubmitDisabled: {
    opacity: 0.6,
  },
  modalButtonSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
