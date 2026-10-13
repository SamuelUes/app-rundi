import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { RideEarning } from '../../../services/earningsService';
import type { TFunction } from 'i18next';

interface EarningsRideListProps {
  rides: RideEarning[];
  formatDate: (dateString: string) => string;
  formatCurrency: (amount?: number | null) => string;
  colors: any;
  styles: any;
  t: TFunction;
}

export function EarningsRideList({
  rides,
  formatDate,
  formatCurrency,
  colors,
  styles,
  t,
}: EarningsRideListProps) {
  return (
    <View style={styles.ridesSection}>
      <Text style={styles.ridesTitle}>{t('driver.earnings.rides.title')}</Text>

      {!rides || rides.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="receipt-long" size={26} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyStateText}>{t('driver.earnings.rides.empty')}</Text>
        </View>
      ) : (
        rides.map((ride) => {
          const paymentColor =
            ride.paymentStatus === 'completed' ? colors.success : colors.warning;

          return (
            <View key={ride.id} style={styles.rideCard}>
              <View style={styles.rideHeader}>
                <Text style={styles.rideDate}>{formatDate(ride.completedAt)}</Text>
                <View style={[styles.paymentBadge, { backgroundColor: paymentColor + '26' }]}>
                  <View style={[styles.paymentBadgeDot, { backgroundColor: paymentColor }]} />
                  <Text style={[styles.paymentBadgeText, { color: paymentColor }]}>
                    {ride.paymentStatus === 'completed'
                      ? t('driver.earnings.rides.status.paid')
                      : t('driver.earnings.rides.status.pending')}
                  </Text>
                </View>
              </View>

              <View style={styles.rideLocations}>
                <View style={styles.routeRow}>
                  <View style={styles.routeMarkerCol}>
                    <View style={styles.routeRing} />
                  </View>
                  <Text style={styles.rideLocation} numberOfLines={1}>
                    {ride.origin || t('driver.earnings.rides.unknownLocation')}
                  </Text>
                </View>
                <View style={styles.routeConnector} />
                <View style={styles.routeRow}>
                  <View style={styles.routeMarkerCol}>
                    <View style={[styles.routeRing, { borderColor: colors.error }]} />
                  </View>
                  <Text style={styles.rideLocation} numberOfLines={1}>
                    {ride.destination || t('driver.earnings.rides.unknownLocation')}
                  </Text>
                </View>
              </View>

              <View style={styles.rideDetails}>
                <View style={styles.rideDetailItem}>
                  <MaterialIcons name="straighten" size={13} color={colors.textSecondary} />
                  <Text style={styles.rideDetail}>
                    {t('driver.earnings.rides.distance', {
                      value: (ride.distance / 1000).toFixed(1),
                    })}
                  </Text>
                </View>
                <View style={styles.rideDetailItem}>
                  <MaterialIcons name="schedule" size={13} color={colors.textSecondary} />
                  <Text style={styles.rideDetail}>
                    {t('driver.earnings.rides.duration', {
                      value: Math.max(0, Math.round(ride.duration / 60)),
                    })}
                  </Text>
                </View>
              </View>

              <View style={styles.rideEarnings}>
                <View style={styles.rideEarningRow}>
                  <Text style={styles.rideEarningLabel}>{t('driver.earnings.rides.fare')}</Text>
                  <Text style={styles.rideEarningValue}>{formatCurrency(ride.fare)}</Text>
                </View>
                <View style={styles.rideEarningRow}>
                  <Text style={styles.rideEarningLabel}>{t('driver.earnings.rides.commission')}</Text>
                  <Text style={[styles.rideEarningValue, { color: colors.error }]}>
                    -{formatCurrency(ride.commission)}
                  </Text>
                </View>
                <View style={[styles.rideEarningRow, styles.rideEarningRowTotal]}>
                  <Text style={styles.rideEarningLabelTotal}>{t('driver.earnings.rides.net')}</Text>
                  <Text style={styles.rideEarningValueTotal}>{formatCurrency(ride.netEarning)}</Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
