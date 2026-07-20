import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import ridesService, { Ride } from '../../services/ridesService';
import { useRideHistory } from '../../hooks/shared/ride/useRideHistory';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/safeFormatters';

const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button2x.png');

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

    return (
      <TouchableOpacity
        style={[styles.rideCard, { borderLeftColor: getStatusColor(item.status) }]}
        onPress={() => navigation.navigate('RideDetails', { rideId: item.id })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>
            {formatDate(updatedAt, t('client.rideHistory.labels.noDate'))}
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
                    <MaterialIcons
                      name={idx === 0 ? 'circle' : idx === totalStops - 1 ? 'circle' : 'place'}
                      size={16}
                      color={idx === 0 ? '#2196F3' : idx === totalStops - 1 ? '#F44336' : colors.textSecondary}
                    />
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
                <MaterialIcons name="circle" size={16} color="#2196F3" />
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
                <MaterialIcons name="circle" size={16} color="#F44336" />
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
                  <MaterialIcons name="star" size={14} color="#FFD700" /> {driverRating.toFixed(1)}
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
        <LoadingIcon icon="refresh" size={32} color={colors.primary} animation="spin" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.backgroundGlow} pointerEvents="none" />

      <View style={styles.topActionsRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
          activeOpacity={0.8}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Image source={BACK_BUTTON_ICON} style={styles.backIcon} resizeMode="contain" />
        </TouchableOpacity>

        <View style={styles.filterRail}>
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
                {t('client.rideHistory.filters.all')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterButton, filter === 'completed' && styles.filterButtonActive]}
              onPress={() => setFilter('completed')}
            >
              <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
                {t('client.rideHistory.filters.completed')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterButton, filter === 'canceled' && styles.filterButtonActive]}
              onPress={() => setFilter('canceled')}
            >
              <Text style={[styles.filterText, filter === 'canceled' && styles.filterTextActive]}>
                {t('client.rideHistory.filters.canceled')}
              </Text>
            </TouchableOpacity>
          </View>
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
            <MaterialIcons name="assignment" size={64} color={colors.textSecondary} />
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
    backgroundGlow: {
      position: 'absolute',
      top: -80,
      left: -40,
      right: -40,
      height: 240,
      borderRadius: 140,
      backgroundColor: colors.primary + '18',
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
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface || colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 0,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 3,
      marginTop: 0,
    },
    backIcon: {
      width: 26,
      height: 26,
    },
    filterRail: {
      flex: 1,
      borderRadius: 16,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface || colors.background,
    },
    filterContainer: {
      flexDirection: 'row',
      padding: 2,
      gap: 6,
      backgroundColor: 'transparent',
    },
    filterButton: {
      flex: 1,
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 4,
    },
    filterText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    filterTextActive: {
      color: '#fff',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 20,
    },
    rideCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      borderLeftColor: 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 6,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    dateText: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 2,
    },
    statusText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight: '700',
    },
    locations: {
      marginBottom: 10,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    locationIcon: {
      fontSize: 16,
    },
    locationText: {
      flex: 1,
      fontSize: 13,
    },
    locationDivider: {
      width: 2,
      height: 20,
      backgroundColor: colors.border,
      marginLeft: 7,
      marginVertical: 4,
    },
    info: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 8,
      paddingTop: 2,
    },
    infoItem: {
      flex: 1,
    },
    infoLabel: {
      fontSize: 11,
      marginBottom: 2,
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '600',
    },
    driverInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 10,
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    driverLabel: {
      fontSize: 13,
    },
    driverName: {
      fontSize: 13,
      fontWeight: '600',
    },
    driverDetails: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    driverRating: {
      fontSize: 12,
      fontWeight: '600',
    },
    paymentInfo: {
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface || colors.background,
      borderRadius: 12,
      gap: 6,
    },
    paymentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    paymentLabel: {
      fontSize: 12,
    },
    paymentValue: {
      fontSize: 13,
      fontWeight: '500',
    },
    paymentValueNet: {
      fontSize: 14,
      fontWeight: '700',
    },
    paymentStatusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 12,
    },
    paymentStatusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFF',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 34,
      marginHorizontal: 16,
      paddingVertical: 48,
      paddingHorizontal: 20,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 4,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      textAlign: 'center',
    },
  });
