import React from 'react';
import { View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { DriverStats } from '../../../services/driver/earningsService';
import type { TFunction } from 'i18next';

interface EarningsStatsSectionProps {
  stats: DriverStats;
  formatStatNumber: (value?: number | null) => string;
  formatStatCurrency: (value?: number | null) => string;
  formatStatDuration: (value?: number | null) => string;
  formatStatDistance: (value?: number | null) => string;
  colors: any;
  styles: any;
  t: TFunction;
}

export function EarningsStatsSection({
  stats,
  formatStatNumber,
  formatStatCurrency,
  formatStatDuration,
  formatStatDistance,
  colors,
  styles,
  t,
}: EarningsStatsSectionProps) {
  const chips: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: string }[] = [
    { icon: 'today', label: t('driver.earnings.stats.ridesToday'), value: formatStatNumber(stats.ridesToday) },
    { icon: 'directions-car', label: t('driver.earnings.stats.totalRides'), value: formatStatNumber(stats.totalRides) },
    { icon: 'schedule', label: t('driver.earnings.stats.totalTime'), value: formatStatDuration(stats.totalDuration) },
    { icon: 'trending-up', label: t('driver.earnings.stats.avgEarnings'), value: formatStatCurrency(stats.averageFare) },
    { icon: 'account-balance-wallet', label: t('driver.earnings.stats.totalNet'), value: formatStatCurrency(stats.totalNetEarnings) },
    { icon: 'route', label: t('driver.earnings.stats.totalDistance'), value: formatStatDistance(stats.totalDistance) },
  ];

  return (
    <View style={styles.statsSection}>
      <Text style={styles.sectionTitle}>{t('driver.earnings.section.stats')}</Text>
      <View style={styles.statsGridChips}>
        {chips.map((chip) => (
          <View key={chip.label} style={styles.statChip}>
            <View style={styles.statChipTop}>
              <MaterialIcons name={chip.icon} size={14} color={colors.textSecondary} />
              <Text style={styles.statChipLabel} numberOfLines={1}>{chip.label}</Text>
            </View>
            <Text style={styles.statChipValue}>{chip.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
