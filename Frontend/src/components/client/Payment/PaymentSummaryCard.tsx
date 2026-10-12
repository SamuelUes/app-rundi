import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useIsDark } from '../../../stores/themeStore';
import type { TFunction } from 'i18next';

interface PaymentSummaryCardProps {
  rideDetails: {
    originAddress?: string | null;
    destinationAddress?: string | null;
    estimatedDistance: number;
  } | null;
  colors: any;
  styles: any;
  t: TFunction;
}

export function PaymentSummaryCard({ rideDetails, colors, styles, t }: PaymentSummaryCardProps) {
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  if (!rideDetails) return null;

  const rows = [
    {
      icon: 'radio-button-checked' as const,
      label: t('shared.payment.summary.origin'),
      value: rideDetails.originAddress || t('shared.payment.summary.notAvailable'),
    },
    {
      icon: 'location-on' as const,
      label: t('shared.payment.summary.destination'),
      value: rideDetails.destinationAddress || t('shared.payment.summary.notAvailable'),
    },
    {
      icon: 'straighten' as const,
      label: t('shared.payment.summary.distance'),
      value: `${(rideDetails.estimatedDistance / 1000).toFixed(1)} km`,
    },
  ];

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{t('shared.payment.summary.title')}</Text>
      {rows.map((row, index) => (
        <View
          key={row.icon}
          style={[styles.summaryRow, index === rows.length - 1 && { marginBottom: 0 }]}
        >
          <View style={styles.summaryIconWrap}>
            <MaterialIcons name={row.icon} size={15} color={accent} />
          </View>
          <Text style={styles.summaryLabel}>{row.label}</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
