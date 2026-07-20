import React, { useState, useEffect, useMemo } from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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

const backButtonIcon = require('../../assets/icons/back_button/back_button.png');
const arrowWhiteUpIcon = require('../../assets/icons/arrow/arrowwhiteup2x.png');
const arrowBlackDownIcon = require('../../assets/icons/arrow/arrrowblackup2x.png');

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
        <TouchableOpacity style={styles.headerBackButton} onPress={() => navigation.goBack()}>
          <Image source={backButtonIcon} style={[styles.backIcon, { tintColor: colors.text }]} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('driver.earnings.header.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.balanceSection}>
        <Text style={styles.sectionTitle}>{t('driver.earnings.section.balance')}</Text>
        <View style={styles.periodSelector}>
          <TouchableOpacity
            style={[styles.periodButton, selectedPeriod === 'today' && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod('today')}
          >
            <Text style={[styles.periodButtonText, selectedPeriod === 'today' && styles.periodButtonTextActive]}>
              {t('driver.earnings.period.today')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, selectedPeriod === 'week' && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod('week')}
          >
            <Text style={[styles.periodButtonText, selectedPeriod === 'week' && styles.periodButtonTextActive]}>
              {t('driver.earnings.period.week')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodButton, selectedPeriod === 'month' && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod('month')}
          >
            <Text style={[styles.periodButtonText, selectedPeriod === 'month' && styles.periodButtonTextActive]}>
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
          <Image source={arrowWhiteUpIcon} style={[styles.navIcon, styles.navIconWhite]} resizeMode="contain" />
          <Text style={styles.primaryNavText}>{t('driver.earnings.nav.commissions')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryNavButton}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('RideHistory')}
        >
          <Image source={arrowBlackDownIcon} style={[styles.navIcon, styles.navIconDark]} resizeMode="contain" />
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
          styles={styles}
          t={t}
        />
      )}

      {/* Lista de viajes */}
      <EarningsRideList
        rides={rides}
        formatDate={formatDate}
        formatCurrency={formatCurrency}
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
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    width: 28,
    height: 28,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  balanceSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: accentColor,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: accentColor,
    borderColor: accentColor,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: accentColor,
  },
  periodButtonTextActive: {
    color: colors.background,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 24,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  summaryValues: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 12,
  },
  summaryValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryValueLabel: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  summaryValueText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summaryCommissionText: {
    color: '#E53935',
  },
  summaryNetRow: {
    backgroundColor: accentColor,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryNetLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  summaryNetValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.background,
  },
  statsSection: {
    paddingHorizontal: 20,
    marginTop: 14,
  },
  statsGridChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statChip: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  statChipLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  statChipValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingVertical: 20,
    marginTop: 5,
    marginBottom: 8,
    gap: 12,
  },
  primaryNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingVertical: 14,
    gap: 8,
  },
  primaryNavText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  secondaryNavText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  navIcon: {
    width: 14,
    height: 14,
  },
  navIconWhite: {
    tintColor: colors.background,
  },
  navIconDark: {
    tintColor: colors.text,
    transform: [{ rotate: '90deg' }],
  },
  commissionCard: {
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
  commissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  commissionSection: {
    marginBottom: 16,
    paddingBottom: 16,
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
    marginBottom: 12,
  },
  commissionIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  commissionLabel: {
    fontSize: 16,
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
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  commissionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF5252',
  },
  commissionAmountHighlight: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E53935',
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
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  commissionTotalAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF5252',
  },
  commissionGrandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  commissionGrandTotalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  commissionGrandTotalAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FF5252',
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
    padding: 16,
    paddingTop: 0,
  },
  ridesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  rideCard: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  paymentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  rideLocations: {
    marginBottom: 12,
  },
  rideLocation: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  rideDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  rideDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rideEarnings: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rideEarningRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rideEarningLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rideEarningValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  rideEarningRowTotal: {
    marginTop: 6,
    paddingTop: 8,
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
    fontWeight: '700',
    color: '#4CAF50',
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
