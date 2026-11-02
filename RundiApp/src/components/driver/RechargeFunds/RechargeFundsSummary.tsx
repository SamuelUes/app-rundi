import React from 'react';
import { View, Text } from 'react-native';

interface RechargeFundsSummaryProps {
  summary: any;
  summaryTexts: any;
  formatCurrency: (n: number) => string;
  styles: any;
}

export function RechargeFundsSummary({
  summary,
  summaryTexts,
  formatCurrency,
  styles,
}: RechargeFundsSummaryProps) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{summaryTexts.title}</Text>

      <View style={styles.summaryHighlight}>
        <Text style={styles.summaryHighlightAmount}>{formatCurrency(summary?.availableBalance ?? 0)}</Text>
        <Text style={styles.summaryHighlightLabel}>
          {summaryTexts.currentBalanceLabel}
        </Text>
      </View>

      <View style={styles.summaryBreakdown}>
        <View style={styles.summaryBreakdownItem}>
          <View style={styles.summaryBreakdownText}>
            <Text style={styles.summaryBreakdownLabel}>{summaryTexts.totalRechargedLabel}</Text>
          </View>
          <Text style={styles.summaryBreakdownValue}>
            {`${summary?.totals?.rechargeCount ?? 0} · ${formatCurrency(summary?.totals?.totalRecharged ?? 0)}`}
          </Text>
        </View>

        <View style={styles.summaryBreakdownItem}>
          <View style={styles.summaryBreakdownText}>
            <Text style={styles.summaryBreakdownLabel}>{summaryTexts.totalDeductedLabel}</Text>
          </View>
          <Text style={styles.summaryBreakdownValue}>
            {`${summary?.totals?.deductionCount ?? 0} · ${formatCurrency(summary?.totals?.totalDeducted ?? 0)}`}
          </Text>
        </View>
      </View>

      <Text style={styles.summaryHint}>{summaryTexts.hint}</Text>
    </View>
  );
}
