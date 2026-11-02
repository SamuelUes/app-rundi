import React from 'react';
import { View, Text } from 'react-native';

interface PaymentConfirmationBreakdownProps {
  breakdownTexts: {
    title: string;
    fare: string;
    tip: string;
    total: string;
    methodLabel: string;
    methodCash: string;
    methodCard: string;
  };
  numericAmount: number;
  numericTip: number;
  totalAmount: number;
  styles: any;
}

export function PaymentConfirmationBreakdown({
  breakdownTexts,
  numericAmount,
  numericTip,
  totalAmount,
  styles,
}: PaymentConfirmationBreakdownProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{breakdownTexts.title}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{breakdownTexts.fare}</Text>
        <Text style={styles.value}>C${numericAmount.toFixed(2)}</Text>
      </View>

      {numericTip > 0 && (
        <View style={styles.row}>
          <Text style={styles.label}>{breakdownTexts.tip}</Text>
          <Text style={styles.valueGreen}>+C${numericTip.toFixed(2)}</Text>
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.totalLabel}>{breakdownTexts.total}</Text>
        <Text style={styles.totalValue}>C${totalAmount.toFixed(2)}</Text>
      </View>
    </View>
  );
}
