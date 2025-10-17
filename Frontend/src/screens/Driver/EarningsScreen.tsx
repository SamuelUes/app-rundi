import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { SkeletonLoader, RideListSkeleton } from '../../components/SkeletonLoader';
import { NoHistoryEmptyState } from '../../components/EmptyState';
import earningsService, { EarningsSummary, RideEarning, DriverStats } from '../../services/earningsService';

type Period = 'today' | 'week' | 'month';

export default function EarningsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('today');
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [rides, setRides] = useState<RideEarning[]>([]);
  const [stats, setStats] = useState<DriverStats | null>(null);
  const [commissionBreakdown, setCommissionBreakdown] = useState<any>(null);

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
      setRides(data.rides);
    } catch (error: any) {
      console.error('Error cargando ganancias:', error);
      Alert.alert('Error', 'No se pudieron cargar las ganancias');
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

  const formatCurrency = (amount: number) => {
    return `C$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-NI', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Selector de período */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'today' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('today')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'today' && styles.periodButtonTextActive]}>
            Hoy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'week' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('week')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'week' && styles.periodButtonTextActive]}>
            Semana
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'month' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('month')}
        >
          <Text style={[styles.periodButtonText, selectedPeriod === 'month' && styles.periodButtonTextActive]}>
            Mes
          </Text>
        </TouchableOpacity>
      </View>

      {/* Resumen de ganancias */}
      {summary && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>💰 Resumen de Ganancias</Text>
          
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Bruto:</Text>
            <Text style={styles.summaryValue}>{formatCurrency(summary.totalEarnings)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Comisión:</Text>
            <Text style={[styles.summaryValue, { color: '#FF5252' }]}>
              -{formatCurrency(summary.commission)}
            </Text>
          </View>

          <View style={[styles.summaryRow, styles.summaryRowTotal]}>
            <Text style={styles.summaryLabelTotal}>Ganancia Neta:</Text>
            <Text style={styles.summaryValueTotal}>{formatCurrency(summary.netEarnings)}</Text>
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.totalRides}</Text>
              <Text style={styles.statLabel}>Viajes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCurrency(summary.averagePerRide)}</Text>
              <Text style={styles.statLabel}>Promedio</Text>
            </View>
          </View>
        </View>
      )}

      {/* Desglose de Comisiones */}
      {commissionBreakdown && (commissionBreakdown.cash.total.commission > 0 || commissionBreakdown.card.total.commission > 0) && (
        <View style={styles.commissionCard}>
          <Text style={styles.commissionTitle}>💰 Desglose de Comisiones</Text>
          
          {/* Comisiones en Efectivo */}
          {commissionBreakdown.cash.total.rides > 0 && (
            <View style={styles.commissionSection}>
              <View style={styles.commissionHeader}>
                <Text style={styles.commissionIcon}>💵</Text>
                <Text style={styles.commissionLabel}>Efectivo</Text>
              </View>
              
              {commissionBreakdown.cash.normal.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {commissionBreakdown.cash.normal.rides} viajes normales (10%)
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.cash.normal.commission)}
                  </Text>
                </View>
              )}
              
              {commissionBreakdown.cash.designated.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {commissionBreakdown.cash.designated.rides} viajes designado (15%)
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.cash.designated.commission)}
                  </Text>
                </View>
              )}
              
              <View style={[styles.commissionRow, styles.commissionRowTotal]}>
                <Text style={styles.commissionTotalLabel}>Subtotal Efectivo:</Text>
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
                <Text style={styles.commissionLabel}>Tarjeta/Banco</Text>
              </View>
              
              {commissionBreakdown.card.normal.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {commissionBreakdown.card.normal.rides} viajes normales (10%)
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.card.normal.commission)}
                  </Text>
                </View>
              )}
              
              {commissionBreakdown.card.designated.rides > 0 && (
                <View style={styles.commissionRow}>
                  <Text style={styles.commissionDetail}>
                    {commissionBreakdown.card.designated.rides} viajes designado (15%)
                  </Text>
                  <Text style={styles.commissionAmount}>
                    {formatCurrency(commissionBreakdown.card.designated.commission)}
                  </Text>
                </View>
              )}
              
              <View style={[styles.commissionRow, styles.commissionRowTotal]}>
                <Text style={styles.commissionTotalLabel}>Subtotal Tarjeta:</Text>
                <Text style={styles.commissionTotalAmount}>
                  {formatCurrency(commissionBreakdown.card.total.commission)}
                </Text>
              </View>
            </View>
          )}

          {/* Total General */}
          <View style={styles.commissionGrandTotal}>
            <Text style={styles.commissionGrandTotalLabel}>Total Comisiones:</Text>
            <Text style={styles.commissionGrandTotalAmount}>
              {formatCurrency(commissionBreakdown.totals.commission)}
            </Text>
          </View>
        </View>
      )}

      {/* Estadísticas generales */}
      {stats && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 Estadísticas Generales</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statsGridItem}>
              <Text style={styles.statsGridValue}>{stats.totalRides}</Text>
              <Text style={styles.statsGridLabel}>Total Viajes</Text>
            </View>
            <View style={styles.statsGridItem}>
              <Text style={styles.statsGridValue}>{formatCurrency(stats.totalNetEarnings)}</Text>
              <Text style={styles.statsGridLabel}>Total Ganado</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statsGridItem}>
              <Text style={styles.statsGridValue}>{(stats.totalDistance / 1000).toFixed(1)} km</Text>
              <Text style={styles.statsGridLabel}>Distancia Total</Text>
            </View>
            <View style={styles.statsGridItem}>
              <Text style={styles.statsGridValue}>{(stats.totalDuration / 60).toFixed(0)} min</Text>
              <Text style={styles.statsGridLabel}>Tiempo Total</Text>
            </View>
          </View>
        </View>
      )}

      {/* Lista de viajes */}
      <View style={styles.ridesSection}>
        <Text style={styles.ridesTitle}>📋 Historial de Viajes</Text>
        
        {rides.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No hay viajes en este período</Text>
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
                    {ride.paymentStatus === 'completed' ? 'Pagado' : 'Pendiente'}
                  </Text>
                </View>
              </View>

              <View style={styles.rideLocations}>
                <Text style={styles.rideLocation} numberOfLines={1}>
                  📍 {ride.origin}
                </Text>
                <Text style={styles.rideLocation} numberOfLines={1}>
                  🎯 {ride.destination}
                </Text>
              </View>

              <View style={styles.rideDetails}>
                <Text style={styles.rideDetail}>
                  📏 {(ride.distance / 1000).toFixed(1)} km
                </Text>
                <Text style={styles.rideDetail}>
                  ⏱️ {(ride.duration / 60).toFixed(0)} min
                </Text>
              </View>

              <View style={styles.rideEarnings}>
                <View style={styles.rideEarningRow}>
                  <Text style={styles.rideEarningLabel}>Tarifa:</Text>
                  <Text style={styles.rideEarningValue}>{formatCurrency(ride.fare)}</Text>
                </View>
                <View style={styles.rideEarningRow}>
                  <Text style={styles.rideEarningLabel}>Comisión:</Text>
                  <Text style={[styles.rideEarningValue, { color: '#FF5252' }]}>
                    -{formatCurrency(ride.commission)}
                  </Text>
                </View>
                <View style={[styles.rideEarningRow, styles.rideEarningRowTotal]}>
                  <Text style={styles.rideEarningLabelTotal}>Tu ganancia:</Text>
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

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  summaryCard: {
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
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  summaryRowTotal: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryLabelTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summaryValueTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
  },
  summaryStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
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
  commissionRowTotal: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingLeft: 28,
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
