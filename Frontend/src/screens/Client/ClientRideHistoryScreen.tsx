import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ridesService, { Ride } from '../../services/ridesService';
import { formatNicaraguaRelativeDate } from '../../utils/dateUtils';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/formatters';

export default function ClientRideHistoryScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'completed' | 'canceled'>('all');

  useEffect(() => {
    loadRides();
  }, [filter]);

  const loadRides = async () => {
    try {
      if (!user?.id) return;

      setLoading(true);
      const data = await ridesService.getMyRides(user.id);

      if (data && Array.isArray(data)) {
        let filtered = data;

        if (filter === 'completed') {
          filtered = data.filter((r: any) => r.status === 'completed');
        } else if (filter === 'canceled') {
          filtered = data.filter((r: any) => r.status === 'canceled');
        }

        setRides(filtered);
      }
    } catch (error) {
      console.error('Error loading rides:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRides();
  };

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) {
      return t('client.rideHistory.labels.noDate');
    }
    return formatNicaraguaRelativeDate(dateString);
  };

  const getStatusText = (status: string): string => {
    const key = `client.rideHistory.statuses.${status}`;
    return t(key, { defaultValue: t('client.rideHistory.statuses.other', { status }) });
  };

  const getStatusColor = (status: string): string => {
    const colorMap: { [key: string]: string } = {
      completed: '#4CAF50',
      canceled: '#F44336',
      requested: '#FF9800',
      accepted: '#2196F3',
      started: '#9C27B0',
    };
    return colorMap[status] || '#757575';
  };

  const renderRideItem = ({ item }: { item: Ride }) => {
    const distanceMeters = item.distance ?? item.estimatedDistance ?? 0;
    const price =
      item.finalFare ??
      item.primaryPayment?.amount ??
      item.estimatedPrice ??
      0;
    const commission = item.commission ?? item.primaryPayment?.commission ?? 0;
    const tip = item.primaryPayment?.tip ?? 0;
    const netAmount = price - commission;
    const paymentStatus =
      item.primaryPayment?.status ?? item.paymentType ?? t('client.rideHistory.labels.paymentMissing');
    const paymentMethodRaw =
      item.primaryPayment?.paymentMethod ?? item.paymentType;
    const paymentMethod =
      typeof paymentMethodRaw === 'string' && paymentMethodRaw.trim().length > 0
        ? paymentMethodRaw.toUpperCase()
        : t('client.rideHistory.labels.paymentMethodMissing');
    const updatedAt =
      item.updatedAt || item.completedAt || item.createdAt || '';
    const driver = item.driver;
    const driverName =
      typeof driver?.name === 'string' && driver.name.trim().length > 0
        ? driver.name
        : null;
    const driverRating =
      typeof driver?.rating === 'number' && driver.rating > 0
        ? driver.rating
        : null;
    const showPaymentInfo = Boolean(
      paymentMethodRaw || commission > 0 || tip > 0 || item.primaryPayment
    );

    return (
      <TouchableOpacity
        style={[styles.rideCard, { backgroundColor: colors.surface }]}
        onPress={() => navigation.navigate('RideDetails', { rideId: item.id })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(updatedAt)}
          </Text>
          <View
            style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
          >
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
        </View>

        {/* Locations */}
        <View style={styles.locations}>
          {item.hasMultipleStops && item.allAddresses && item.allAddresses.length > 0 ? (
            item.allAddresses.map((address: string, idx: number) => {
              const totalStops = item.allAddresses?.length ?? 0;
              return (
                <View key={`${item.id}-addr-${idx}`}>
                  <View style={styles.locationRow}>
                    <Text style={styles.locationIcon}>
                      {idx === 0
                        ? '🔵'
                        : idx === totalStops - 1
                        ? '🔴'
                        : '📍'}
                    </Text>
                    <Text
                      style={[styles.locationText, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {address || t('client.rideHistory.labels.unknownAddress')}
                    </Text>
                  </View>
                  {idx < totalStops - 1 && <View style={styles.locationDivider} />}
                </View>
              );
            })
          ) : (
            <>
              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>🔵</Text>
                <Text
                  style={[styles.locationText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {typeof item.originAddress === 'string' &&
                  item.originAddress.trim().length > 0
                    ? item.originAddress
                    : t('client.rideHistory.labels.originFallback')}
                </Text>
              </View>
              <View style={styles.locationDivider} />
              <View style={styles.locationRow}>
                <Text style={styles.locationIcon}>🔴</Text>
                <Text
                  style={[styles.locationText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {typeof item.destinationAddress === 'string' &&
                  item.destinationAddress.trim().length > 0
                    ? item.destinationAddress
                    : t('client.rideHistory.labels.destinationFallback')}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('client.rideHistory.labels.distance')}
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {t('client.rideHistory.distanceValue', {
                value: (distanceMeters / 1000).toFixed(1),
              })}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
              {t('client.rideHistory.labels.total')}
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {formatCurrency(price)}
            </Text>
          </View>
        </View>

        {/* Payment */}
        {showPaymentInfo && (
          <View style={styles.paymentInfo}>
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                {t('client.rideHistory.labels.method')}
              </Text>
              <Text style={[styles.paymentValue, { color: colors.text }]}>
                {paymentMethod}
              </Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                {t('client.rideHistory.labels.status')}
              </Text>
              <View
                style={[
                  styles.paymentStatusBadge,
                  {
                    backgroundColor:
                      paymentStatus === 'completed' ? '#4CAF50' : '#FFA726',
                  },
                ]}
              >
                <Text style={styles.paymentStatusText}>
                  {paymentStatus === 'completed'
                    ? t('client.rideHistory.paymentStatus.paid')
                    : paymentStatus === 'pending'
                    ? t('client.rideHistory.paymentStatus.pending')
                    : t('client.rideHistory.paymentStatus.other', { status: paymentStatus })}
                </Text>
              </View>
            </View>

            {commission > 0 && (
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                  {t('client.rideHistory.labels.commission')}
                </Text>
                <Text style={[styles.paymentValue, { color: colors.text }]}>
                  -{formatCurrency(commission)}
                </Text>
              </View>
            )}

            {tip > 0 && (
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                  {t('client.rideHistory.labels.tip')}
                </Text>
                <Text style={[styles.paymentValue, { color: colors.text }]}>
                  +{formatCurrency(tip)}
                </Text>
              </View>
            )}

            {commission > 0 && (
              <View style={styles.paymentRow}>
                <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                  {t('client.rideHistory.labels.net')}
                </Text>
                <Text style={[styles.paymentValueNet, { color: colors.text }]}>
                  {formatCurrency(netAmount)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Driver */}
        {driverName && (
          <View style={styles.driverInfo}>
            <Text style={[styles.driverLabel, { color: colors.textSecondary }]}>
              {t('client.rideHistory.labels.driver')}
            </Text>
            <View style={styles.driverDetails}>
              <Text style={[styles.driverName, { color: colors.text }]}>
                {driverName}
              </Text>
              {driverRating && (
                <Text style={[styles.driverRating, { color: colors.textSecondary }]}>
                  ⭐ {driverRating.toFixed(1)}
                </Text>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Filters */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'all' && { backgroundColor: '#996224ff' },
          ]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'all' ? '#FFF' : colors.text },
            ]}
          >
            {t('client.rideHistory.filters.all')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'completed' && { backgroundColor: '#996224ff' },
          ]}
          onPress={() => setFilter('completed')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'completed' ? '#FFF' : colors.text },
            ]}
          >
            {t('client.rideHistory.filters.completed')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.filterButton,
            filter === 'canceled' && { backgroundColor: '#996224ff' },
          ]}
          onPress={() => setFilter('canceled')}
        >
          <Text
            style={[
              styles.filterText,
              { color: filter === 'canceled' ? '#FFF' : colors.text },
            ]}
          >
            {t('client.rideHistory.filters.canceled')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={rides}
        renderItem={renderRideItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {t('client.rideHistory.empty.title')}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? t('client.rideHistory.empty.subtitle.all')
                : filter === 'completed'
                ? t('client.rideHistory.empty.subtitle.completed')
                : t('client.rideHistory.empty.subtitle.canceled')}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterContainer: { flexDirection: 'row', padding: 16, gap: 8, paddingTop: 60 },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#8080808a',
    alignItems: 'center',
  },
  filterText: { fontSize: 14, fontWeight: '600' },
  listContent: { padding: 16, paddingTop: 0 },
  rideCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateText: { fontSize: 14, fontWeight: '500' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  locations: { marginBottom: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationIcon: { fontSize: 16 },
  locationText: { flex: 1, fontSize: 14 },
  locationDivider: {
    width: 2,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginLeft: 7,
    marginVertical: 4,
  },
  info: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  infoItem: { flex: 1 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 16, fontWeight: '600' },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  driverLabel: { fontSize: 14 },
  driverName: { fontSize: 14, fontWeight: '600' },
  driverDetails: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  driverRating: { fontSize: 12, fontWeight: '600' },
  paymentInfo: {
    marginTop: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E0E0E0',
    gap: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentLabel: { fontSize: 12 },
  paymentValue: { fontSize: 13, fontWeight: '500' },
  paymentValueNet: { fontSize: 14, fontWeight: '700' },
  paymentStatusBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  paymentStatusText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
