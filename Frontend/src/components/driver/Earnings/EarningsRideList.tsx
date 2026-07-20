import React from 'react';
import { View, Text } from 'react-native';
import type { RideEarning } from '../../../services/earningsService';
import type { TFunction } from 'i18next';

interface EarningsRideListProps {
  rides: RideEarning[];
  formatDate: (dateString: string) => string;
  formatCurrency: (amount?: number | null) => string;
  styles: any;
  t: TFunction;
}

export function EarningsRideList({
  rides,
  formatDate,
  formatCurrency,
  styles,
  t,
}: EarningsRideListProps) {
  return (
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
              <View
                style={[
                  styles.paymentBadge,
                  { backgroundColor: ride.paymentStatus === 'completed' ? '#4CAF50' : '#FFA726' },
                ]}
              >
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
  );
}
