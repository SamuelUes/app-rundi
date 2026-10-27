import React from 'react';
import { View, Text } from 'react-native';
import type { EarningsSummary } from '../../../services/earningsService';
import { formatApproxAmount } from '../../../utils/designatedCrew';
import type { TFunction } from 'i18next';

interface EarningsSummaryCardProps {
  summary: EarningsSummary;
  formatCurrency: (amount?: number | null) => string;
  styles: any;
  t: TFunction;
}

export function EarningsSummaryCard({
  summary,
  formatCurrency,
  styles,
  t,
}: EarningsSummaryCardProps) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryValues}>
        <View style={styles.summaryValueRow}>
          <Text style={styles.summaryValueLabel}>{t('driver.earnings.summary.totalGross')}</Text>
          <Text style={styles.summaryValueText}>{formatCurrency(summary.totalEarnings)}</Text>
        </View>
        <View style={styles.summaryValueRow}>
          <Text style={styles.summaryValueLabel}>{t('driver.earnings.summary.commission')}</Text>
          <Text style={[styles.summaryValueText, styles.summaryCommissionText]}>
            -{formatCurrency(summary.commission)}
          </Text>
        </View>
      </View>
      <View style={styles.summaryNetRow}>
        <Text style={styles.summaryNetLabel}>{t('driver.earnings.summary.net')}</Text>
        <Text style={styles.summaryNetValue}>{formatCurrency(summary.netEarnings)}</Text>
      </View>
      {summary.designatedEarnings && summary.designatedEarnings.rides > 0 && (
        <>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>{t('driver.earnings.split.normal')}</Text>
            <Text style={styles.splitValue}>{formatCurrency(summary.normalEarnings?.net ?? 0)}</Text>
          </View>
          <View style={styles.splitRow}>
            <Text style={styles.splitLabel}>{t('driver.earnings.split.designated')}</Text>
            <Text style={styles.splitValue}>
              {formatApproxAmount(summary.designatedEarnings.net, formatCurrency)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
