import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface PaymentCostCardProps {
  rideAmount: number;
  tip: number;
  totalAmount: number;
  formatCurrency: (value: number) => string;
  styles: any;
  t: TFunction;
}

export function PaymentCostCard({
  rideAmount,
  tip,
  totalAmount,
  formatCurrency,
  styles,
  t,
}: PaymentCostCardProps) {
  return (
    <View style={styles.costCard}>
      <Text style={styles.costTitle}>{t('shared.payment.cost.title')}</Text>
      <View style={styles.costRow}>
        <Text style={styles.costLabel}>{t('shared.payment.cost.fare')}</Text>
        <Text style={styles.costValue}>{formatCurrency(rideAmount)}</Text>
      </View>
      {tip > 0 && (
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>{t('shared.payment.cost.tip')}</Text>
          <Text style={styles.costValue}>{formatCurrency(tip)}</Text>
        </View>
      )}
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{t('shared.payment.cost.total')}</Text>
        <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
      </View>
    </View>
  );
}
