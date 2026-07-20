import React from 'react';
import { View, Text } from 'react-native';
import type { DriverStats } from '../../../services/earningsService';
import type { TFunction } from 'i18next';

interface EarningsStatsSectionProps {
  stats: DriverStats;
  formatStatNumber: (value?: number | null) => string;
  formatStatCurrency: (value?: number | null) => string;
  formatStatDuration: (value?: number | null) => string;
  formatStatDistance: (value?: number | null) => string;
  styles: any;
  t: TFunction;
}

export function EarningsStatsSection({
  stats,
  formatStatNumber,
  formatStatCurrency,
  formatStatDuration,
  formatStatDistance,
  styles,
  t,
}: EarningsStatsSectionProps) {
  return (
    <View style={styles.statsSection}>
      <Text style={styles.sectionTitle}>{t('driver.earnings.section.stats')}</Text>
      <View style={styles.statsGridChips}>
        <View style={styles.statChip}>
          <Text style={styles.statChipLabel}>{t('driver.earnings.stats.ridesToday')}</Text>
          <Text style={styles.statChipValue}>{formatStatNumber(stats.ridesToday)}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalRides')}</Text>
          <Text style={styles.statChipValue}>{formatStatNumber(stats.totalRides)}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalTime')}</Text>
          <Text style={styles.statChipValue}>{formatStatDuration(stats.totalDuration)}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipLabel}>{t('driver.earnings.stats.avgEarnings')}</Text>
          <Text style={styles.statChipValue}>{formatStatCurrency(stats.averageFare)}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalNet')}</Text>
          <Text style={styles.statChipValue}>{formatStatCurrency(stats.totalNetEarnings)}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statChipLabel}>{t('driver.earnings.stats.totalDistance')}</Text>
          <Text style={styles.statChipValue}>{formatStatDistance(stats.totalDistance)}</Text>
        </View>
      </View>
    </View>
  );
}
