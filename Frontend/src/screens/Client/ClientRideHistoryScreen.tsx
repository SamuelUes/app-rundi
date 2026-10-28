import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import ridesService, { Ride } from '../../services/ridesService';
import { useRideHistory } from '../../hooks/shared/ride/useRideHistory';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/safeFormatters';
import { getRideServiceTypeLabel } from '../../utils/rideFeatureLabels';

export default function ClientRideHistoryScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { rides, loading, refreshing, filter, setFilter, handleRefresh, getStatusColor, formatDate } = useRideHistory(user?.id, 'client');

  const handleBackPress = () => {
    if (typeof navigation?.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    const parentNavigator =
      typeof navigation?.getParent === 'function' ? navigation.getParent() : null;

    if (
      parentNavigator &&
      typeof parentNavigator.canGoBack === 'function' &&
      parentNavigator.canGoBack()
    ) {
      parentNavigator.goBack();
      return;
    }

    navigation.goBack?.();
  };

  const getStatusText = (status: string): string => {
    const key = `client.rideHistory.statuses.${status}`;
    return t(key, { defaultValue: t('client.rideHistory.statuses.other', { status }) });
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
    const serviceTypeLabel = getRideServiceTypeLabel(item, t);

    const statusColor = getStatusColor(item.status);
    const paymentStatusColor =
      paymentStatus === 'completed'
        ? colors.success
        : paymentStatus === 'pending'
        ? colors.warning
        : colors.textSecondary;

    const addresses: string[] =
      item.hasMultipleStops && item.allAddresses && item.allAddresses.length > 0
        ? item.allAddresses
        : [
            typeof item.originAddress === 'string' && item.originAddress.trim().length > 0
              ? item.originAddress
              : t('client.rideHistory.labels.originFallback'),
            typeof item.destinationAddress === 'string' && item.destinationAddress.trim().length > 0
              ? item.destinationAddress
              : t('client.rideHistory.labels.destinationFallback'),
          ];

    const renderRouteMarker = (idx: number, total: number) => {
      if (idx === 0) {
        return <View style={styles.routeRing} />;
      }
      if (idx === total - 1) {
        return <View style={[styles.routeRing, { borderColor: colors.error }]} />;
      }
      return <View style={styles.routeStopDot} />;
    };

    return (
      <TouchableOpacity
        style={styles.rideCard}
        onPress={() => navigation.navigate('RideDetails', { rideId: item.id })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(updatedAt, t('client.rideHistory.labels.noDate'))}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '26' }]}>
            <View style={[styles.statusPillDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {getStatusText(item.status)}
            </Text>
          </View>
        </View>

        {/* Ruta - timeline con paradas */}
        <View style={styles.routeContainer}>
          {addresses.map((address: string, idx: number) => (
            <View key={`${item.id}-addr-${idx}`}>
              <View style={styles.routeRow}>
                <View style={styles.routeMarkerCol}>{renderRouteMarker(idx, addresses.length)}</View>
                <Text
                  style={[styles.locationText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {address || t('client.rideHistory.labels.unknownAddress')}
                </Text>
              </View>
              {idx < addresses.length - 1 && <View style={styles.routeConnector} />}
            </View>
          ))}
        </View>

        {/* Stats + ledger de pago */}
        <View style={styles.statsBand}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {t('client.rideHistory.labels.distance')}
              </Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {t('client.rideHistory.distanceValue', {
                  value: (distanceMeters / 1000).toFixed(1),
                })}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {t('client.rideHistory.labels.total')}
              </Text>
              <Text style={[styles.statValue, styles.statFare, { color: colors.text }]}>
                {formatCurrency(price)}
              </Text>
            </View>
          </View>
          <View style={styles.paymentRow}>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
              {t('client.rideHistory.labels.service')}
            </Text>
            <Text style={[styles.paymentValue, { color: colors.text }]}>
              {serviceTypeLabel}
            </Text>
          </View>

          {showPaymentInfo && (
            <>
              <View style={styles.ledgerDivider} />
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
                <View style={[styles.statusPill, { backgroundColor: paymentStatusColor + '26' }]}>
                  <View style={[styles.statusPillDot, { backgroundColor: paymentStatusColor }]} />
                  <Text style={[styles.statusPillText, { color: paymentStatusColor }]}>
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
                  <Text style={[styles.paymentValue, { color: colors.error }]}>
                    -{formatCurrency(commission)}
                  </Text>
                </View>
              )}

              {tip > 0 && (
                <View style={styles.paymentRow}>
                  <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                    {t('client.rideHistory.labels.tip')}
                  </Text>
                  <Text style={[styles.paymentValue, { color: colors.success }]}>
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
            </>
          )}
        </View>

        {/* Driver */}
        {driverName && (
          <View style={styles.personRow}>
            <MaterialIcons name="drive-eta" size={15} color={colors.textSecondary} />
            <Text style={[styles.personLabel, { color: colors.textSecondary }]}>
              {t('client.rideHistory.labels.driver')}
            </Text>
            <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>
              {driverName}
            </Text>
            {driverRating && (
              <View style={styles.ratingChip}>
                <MaterialIcons name="star" size={13} color="#FFC107" />
                <Text style={[styles.ratingChipText, { color: colors.text }]}>
                  {driverRating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LoadingIcon icon="refresh" size={32} color={colors.primary} animation="spin" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topActionsRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.segRail}>
          <TouchableOpacity
            style={[styles.segItem, filter === 'all' && styles.segItemActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.segText, filter === 'all' && styles.segTextActive]}>
              {t('client.rideHistory.filters.all')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segItem, filter === 'completed' && styles.segItemActive]}
            onPress={() => setFilter('completed')}
          >
            <Text style={[styles.segText, filter === 'completed' && styles.segTextActive]}>
              {t('client.rideHistory.filters.completed')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segItem, filter === 'canceled' && styles.segItemActive]}
            onPress={() => setFilter('canceled')}
          >
            <Text style={[styles.segText, filter === 'canceled' && styles.segTextActive]}>
              {t('client.rideHistory.filters.canceled')}
            </Text>
          </TouchableOpacity>
        </View>
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
            <View style={styles.emptyIconWrap}>
              <MaterialIcons name="assignment" size={30} color={colors.textSecondary} />
            </View>
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

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topActionsRow: {
      marginTop: 40,
      marginHorizontal: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      zIndex: 5,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface || colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segRail: {
      flex: 1,
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 11,
    },
    segItemActive: {
      backgroundColor: colors.primary,
    },
    segText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    segTextActive: {
      color: '#1A1206',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 20,
    },
    rideCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    dateText: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
    },
    statusPillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    routeContainer: {
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
    routeStopDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2.5,
      borderColor: colors.warning,
    },
    routeConnector: {
      width: 2,
      height: 14,
      borderRadius: 1,
      backgroundColor: colors.border,
      marginLeft: 8,
      marginVertical: 3,
    },
    locationText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
    },
    statsBand: {
      backgroundColor: colors.surface || colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statItem: {
      flex: 1,
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    statFare: {
      fontSize: 15,
      fontWeight: '700',
    },
    ledgerDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 10,
    },
    paymentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 3,
    },
    paymentLabel: {
      fontSize: 12,
    },
    paymentValue: {
      fontSize: 13,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },
    paymentValueNet: {
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    personLabel: {
      fontSize: 13,
    },
    personName: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    ratingChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginLeft: 'auto',
    },
    ratingChipText: {
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 34,
      marginHorizontal: 16,
      paddingVertical: 40,
      paddingHorizontal: 20,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface || colors.background,
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
    },
  });
