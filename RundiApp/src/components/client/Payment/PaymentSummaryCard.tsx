import React from 'react';
import { View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useIsDark } from '../../../stores/themeStore';
import type { TFunction } from 'i18next';
import { getRideFeatureLabels, getRideServiceTypeLabel } from '../../../utils/ride/rideFeatureLabels';

interface PaymentSummaryCardProps {
  rideDetails: {
    originAddress?: string | null;
    destinationAddress?: string | null;
    estimatedDistance: number;
    serviceCode?: string | null;
    featureCodes?: string[];
    surgeMultiplier?: number;
  } | null;
  colors: any;
  styles: any;
  t: TFunction;
}

export function PaymentSummaryCard({ rideDetails, colors, styles, t }: PaymentSummaryCardProps) {
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  if (!rideDetails) return null;

  const rows: Array<{
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
    label: string;
    value: string;
  }> = [
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
  const serviceName = getRideServiceTypeLabel(rideDetails, t);
  rows.push({
    icon: 'local-taxi' as const,
    label: t('shared.payment.summary.service'),
    value: serviceName,
  });
  if (rideDetails.featureCodes?.length) {
    rows.push({
      icon: 'nightlight' as const,
      label: t('shared.payment.summary.features'),
      value: getRideFeatureLabels(rideDetails, t).join(' / '),
    });
  }
  if ((rideDetails.surgeMultiplier ?? 1) > 1) {
    rows.push({
      icon: 'trending-up' as const,
      label: t('shared.payment.summary.surge'),
      value: t('shared.payment.summary.highDemand'),
    });
  }

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
