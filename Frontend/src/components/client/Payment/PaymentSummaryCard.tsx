import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface PaymentSummaryCardProps {
  rideDetails: {
    originAddress?: string | null;
    destinationAddress?: string | null;
    estimatedDistance: number;
  } | null;
  styles: any;
  t: TFunction;
}

export function PaymentSummaryCard({ rideDetails, styles, t }: PaymentSummaryCardProps) {
  if (!rideDetails) return null;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{t('shared.payment.summary.title')}</Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t('shared.payment.summary.origin')}:</Text>
        <Text style={styles.summaryValue} numberOfLines={1}>
          {rideDetails.originAddress || t('shared.payment.summary.notAvailable')}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t('shared.payment.summary.destination')}:</Text>
        <Text style={styles.summaryValue} numberOfLines={1}>
          {rideDetails.destinationAddress || t('shared.payment.summary.notAvailable')}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{t('shared.payment.summary.distance')}:</Text>
        <Text style={styles.summaryValue}>
          {(rideDetails.estimatedDistance / 1000).toFixed(1)} km
        </Text>
      </View>
    </View>
  );
}
