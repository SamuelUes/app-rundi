import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigation, CommonActions } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { SkeletonLoader, RideListSkeleton } from '../../components/SkeletonLoader';
import { NoHistoryEmptyState } from '../../components/EmptyState';
import earningsService, { EarningsSummary, RideEarning, DriverStats } from '../../services/earningsService';

const backButtonIcon = require('../../assets/icons/back_button/back_button.png');
const arrowWhiteUpIcon = require('../../assets/icons/arrow/arrowwhiteup2x.png');
const arrowBlackDownIcon = require('../../assets/icons/arrow/arrrowblackup2x.png');

type Period = 'today' | 'week' | 'month';

const DATE_LOCALE_MAP: Record<string, string> = {
  es: 'es-NI',
  en: 'en-US',
  zh: 'zh-CN',
};

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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('today');
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [rides, setRides] = useState<RideEarning[]>([]);
  const [stats, setStats] = useState<DriverStats | null>(null);
  const [commissionBreakdown, setCommissionBreakdown] = useState<any>(null);
  const COMMISSION_NORMAL_PERCENT = '15%';
  const COMMISSION_DESIGNATED_PERCENT = '25%';
  const statPlaceholder = t('driver.earnings.stats.placeholder');

  useEffect(() => {
    loadEarnings();
    loadStats();
    // loadCommissionBreakdown(); // Deshabilitado - función eliminada
  }, [selectedPeriod]);

  const loadEarnings = async () => {
    try {
      setLoading(true);
      const data = await earningsService.getDriverEarnings(selectedPeriod);
      setSummary(data.summary);
      setRides(data.rides || []); // ✅ Asegurar que rides es un array
    } catch (error: any) {
      console.error('Error cargando ganancias:', error);
      // Establecer valores por defecto en caso de error
      setSummary(null);
      setRides([]);
    } finally {
      setLoading(false);
    }
  };


  const loadStats = async () => {
    try {
      const statsData = await earningsService.getDriverStats();
      setStats(statsData);
    } catch (error: any) {
      console.error('Error cargando estadísticas:', error);
    }
  };

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

  const loadCommissionBreakdown = async () => {
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { initializeFirebase } = await import('../../config/firebase');
      
      const { app } = await initializeFirebase();
      if (!app) return;

      const functions = getFunctions(app);
      const getBreakdown = httpsCallable(functions, 'getCommissionBreakdown');
      
      const result = await getBreakdown({ period: selectedPeriod });
      const data = result.data as any;
      
      if (data.success) {
        setCommissionBreakdown(data.breakdown);
      }
    } catch (error: any) {
      console.error('Error cargando desglose de comisiones:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEarnings();
    await loadStats();
    // await loadCommissionBreakdown(); // Deshabilitado - función eliminada
    setRefreshing(false);
  };

  const formatCurrency = useCallback(
    (amount?: number | null) =>
      t('driver.earnings.labels.currency', {
        amount: Number(amount ?? 0).toFixed(2),
      }),
    [t],
  );

  const formatDate = useCallback(
    (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString(dateLocale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [dateLocale],
  );

  const formatDistance = useCallback(
    (meters?: number | null) =>
      t('driver.earnings.stats.kilometers', {
        value: (Number(meters ?? 0) / 1000).toFixed(1),
      }),
    [t],
  );

  const formatDurationMinutes = useCallback(
    (seconds?: number | null) =>
      t('driver.earnings.stats.minutes', {
        value: Math.max(0, Math.round((seconds ?? 0) / 60)),
      }),
    [t],
  );

  const formatStatNumber = useCallback(
    (value?: number | null) => (value === null || value === undefined ? statPlaceholder : value.toString()),
    [statPlaceholder],
  );

  const formatStatCurrency = useCallback(
    (value?: number | null) => (value === null || value === undefined ? statPlaceholder : formatCurrency(value)),
    [formatCurrency, statPlaceholder],
  );

  const formatStatDuration = useCallback(
    (value?: number | null) => (value === null || value === undefined ? statPlaceholder : formatDurationMinutes(value)),
    [formatDurationMinutes, statPlaceholder],
  );

  const formatStatDistance = useCallback(
    (value?: number | null) => (value === null || value === undefined ? statPlaceholder : formatDistance(value)),
    [formatDistance, statPlaceholder],
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
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
        <View style={styles.summaryCard}>
          <View style={styles.summaryValues}>
            <View style={styles.summaryValueRow}>
              <Text style={styles.summaryValueLabel}>{t('driver.earnings.summary.totalGross')}</Text>
              <Text style={styles.summaryValueText}>{formatCurrency(summary.totalEarnings)}</Text>
            </View>
            <View style={styles.summaryValueRow}>
              <Text style={styles.summaryValueLabel}>{t('driver.earnings.summary.commission')}</Text>
              <Text style={[styles.summaryValueText, styles.summaryCommissionText]}>
                -{formatCurrency(summary.commission)}
              </Text>
            </View>
          </View>
          <View style={styles.summaryNetRow}>
            <Text style={styles.summaryNetLabel}>{t('driver.earnings.summary.net')}</Text>
            <Text style={styles.summaryNetValue}>{formatCurrency(summary.netEarnings)}</Text>
          </View>
        </View>
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
      {commissionBreakdown && (commissionBreakdown.cash.total.commission > 0 || commissionBreakdown.card.total.commission > 0) && (
        <View style={styles.commissionCard}>
          <Text style={styles.commissionTitle}>{t('driver.earnings.commission.title')}</Text>
          
          {/* Comisiones en Efectivo */}
          {commissionBreakdown.cash.total.rides > 0 && (
            <View style={styles.commissionSection}>
              <View style={styles.commissionHeader}>
                <Text style={styles.commissionIcon}>💵</Text>
                <Text style={styles.commissionLabel}>{t('driver.earnings.commission.cashLabel')}</Text>
              </View>
              
              {commissionBreakdown.cash.normal.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {t('driver.earnings.commission.normalTrips', {
                      count: commissionBreakdown.cash.normal.rides,
                      rate: COMMISSION_NORMAL_PERCENT,
                    })}
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.cash.normal.commission)}
                  </Text>
                </View>
              )}
              
              {commissionBreakdown.cash.designated.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {t('driver.earnings.commission.designatedTrips', {
                      count: commissionBreakdown.cash.designated.rides,
                      rate: COMMISSION_DESIGNATED_PERCENT,
                    })}
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.cash.designated.commission)}
                  </Text>
                </View>
              )}
              
              <View style={[styles.commissionRow, styles.commissionRowTotal]}>
                <Text style={styles.commissionTotalLabel}>{t('driver.earnings.commission.subtotalCash')}</Text>
                <Text style={styles.commissionTotalAmount}>
                  {formatCurrency(commissionBreakdown.cash.total.commission)}
                </Text>
              </View>
            </View>
          )}

          {/* Comisiones con Tarjeta/Banco */}
          {commissionBreakdown.card.total.rides > 0 && (
            <View style={styles.commissionSection}>
              <View style={styles.commissionHeader}>
                <Text style={styles.commissionIcon}>💳</Text>
                <Text style={styles.commissionLabel}>{t('driver.earnings.commission.cardLabel')}</Text>
              </View>
              
              {commissionBreakdown.card.normal.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {t('driver.earnings.commission.normalTrips', {
                      count: commissionBreakdown.card.normal.rides,
                      rate: COMMISSION_NORMAL_PERCENT,
                    })}
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.card.normal.commission)}
                  </Text>
                </View>
              )}
              
              {commissionBreakdown.card.designated.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {t('driver.earnings.commission.designatedTrips', {
                      count: commissionBreakdown.card.designated.rides,
                      rate: COMMISSION_DESIGNATED_PERCENT,
                    })}
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.card.designated.commission)}
                  </Text>
                </View>
              )}
              
              <View style={[styles.commissionRow, styles.commissionRowTotal]}>
                <Text style={styles.commissionTotalLabel}>{t('driver.earnings.commission.subtotalCard')}</Text>
                <Text style={styles.commissionTotalAmount}>
                  {formatCurrency(commissionBreakdown.card.total.commission)}
                </Text>
              </View>
            </View>
          )}

          {/* Total General */}
          <View style={styles.commissionGrandTotal}>
            <Text style={styles.commissionGrandTotalLabel}>{t('driver.earnings.commission.totalLabel')}</Text>
            <Text style={styles.commissionGrandTotalAmount}>
              {formatCurrency(commissionBreakdown.totals.commission)}
            </Text>
          </View>
        </View>
      )}

      {/* Estadísticas */}
      {stats && (
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>{t('driver.earnings.section.stats')}</Text>
          <View style={styles.statsGridChips}>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>{t('driver.earnings.stats.ridesToday')}</Text>
              <Text style={styles.statChipValue}>{formatStatNumber(stats.ridesToday)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalRides')}</Text>
              <Text style={styles.statChipValue}>{formatStatNumber(stats.totalRides)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalTime')}</Text>
              <Text style={styles.statChipValue}>{formatStatDuration(stats.totalDuration)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>{t('driver.earnings.stats.avgEarnings')}</Text>
              <Text style={styles.statChipValue}>{formatStatCurrency(stats.averageFare)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalNet')}</Text>
              <Text style={styles.statChipValue}>{formatStatCurrency(stats.totalNetEarnings)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalDistance')}</Text>
              <Text style={styles.statChipValue}>{formatStatDistance(stats.totalDistance)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Lista de viajes */}
      <View style={styles.ridesSection}>
        <Text style={styles.ridesTitle}>{t('driver.earnings.rides.title')}</Text>
        
        {!rides || rides.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{t('driver.earnings.rides.empty')}</Text>
          </View>
        ) : (
          rides.map((ride) => (
            <View key={ride.id} style={styles.rideCard}>
              <View style={styles.rideHeader}>
                <Text style={styles.rideDate}>{formatDate(ride.completedAt)}</Text>
                <View style={[
                  styles.paymentBadge,
                  { backgroundColor: ride.paymentStatus === 'completed' ? '#4CAF50' : '#FFA726' }
                ]}>
                  <Text style={styles.paymentBadgeText}>
                    {ride.paymentStatus === 'completed'
                      ? t('driver.earnings.rides.status.paid')
                      : t('driver.earnings.rides.status.pending')}
                  </Text>
                </View>
              </View>

              <View style={styles.rideLocations}>
                <Text style={styles.rideLocation} numberOfLines={1}>
                  {t('driver.earnings.rides.origin', {
                    value: ride.origin || t('driver.earnings.rides.unknownLocation'),
                  })}
                </Text>
                <Text style={styles.rideLocation} numberOfLines={1}>
                  {t('driver.earnings.rides.destination', {
                    value: ride.destination || t('driver.earnings.rides.unknownLocation'),
                  })}
                </Text>
              </View>

              <View style={styles.rideDetails}>
                <Text style={styles.rideDetail}>
                  {t('driver.earnings.rides.distance', {
                    value: (ride.distance / 1000).toFixed(1),
                  })}
                </Text>
                <Text style={styles.rideDetail}>
                  {t('driver.earnings.rides.duration', {
                    value: Math.max(0, Math.round(ride.duration / 60)),
                  })}
                </Text>
              </View>

              <View style={styles.rideEarnings}>
                <View style={styles.rideEarningRow}>
                  <Text style={styles.rideEarningLabel}>{t('driver.earnings.rides.fare')}</Text>
                  <Text style={styles.rideEarningValue}>{formatCurrency(ride.fare)}</Text>
                </View>
                <View style={styles.rideEarningRow}>
                  <Text style={styles.rideEarningLabel}>{t('driver.earnings.rides.commission')}</Text>
                  <Text style={[styles.rideEarningValue, { color: '#FF5252' }]}>
                    -{formatCurrency(ride.commission)}
                  </Text>
                </View>
                <View style={[styles.rideEarningRow, styles.rideEarningRowTotal]}>
                  <Text style={styles.rideEarningLabelTotal}>{t('driver.earnings.rides.net')}</Text>
                  <Text style={styles.rideEarningValueTotal}>{formatCurrency(ride.netEarning)}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

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
