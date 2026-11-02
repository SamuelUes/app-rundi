import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';
import { getRideServiceTypeLabel } from '../../../utils/ride/rideFeatureLabels';

interface RideDetailsInfoProps {
  ride: any;
  distanceKm: string;
  formatDuration: (seconds: any) => string;
  formatCurrency: (amount: number) => string;
  finalPrice: number;
  safeString: (value: any, fallback?: string) => string;
  t: TFunction;
  styles: any;
}

export function RideDetailsInfo({
  ride,
  distanceKm,
  formatDuration,
  formatCurrency,
  finalPrice,
  safeString,
  t,
  styles,
}: RideDetailsInfoProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.info.title')}</Text>
      <View style={styles.card}>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.distance')}</Text>
            <Text style={styles.infoValue}>
              {t('shared.rideDetail.labels.distanceKilometers', { value: distanceKm })}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.duration')}</Text>
            <Text style={styles.infoValue}>{formatDuration(ride.estimatedDuration)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.finalPrice')}</Text>
            <Text style={styles.infoValue}>{formatCurrency(finalPrice)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideDetail.sections.info.passengers')}</Text>
            <Text style={styles.infoValue}>{safeString(ride.passengers || 1)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('shared.rideHistory.labels.type')}</Text>
            <Text style={styles.infoValue}>{getRideServiceTypeLabel(ride, t)}</Text>
          </View>
        </View>

        {ride.notes && typeof ride.notes === 'string' && ride.notes.trim() !== '' ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>{t('shared.rideDetail.sections.info.notesLabel')}</Text>
            <Text style={styles.notesText}>{ride.notes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
