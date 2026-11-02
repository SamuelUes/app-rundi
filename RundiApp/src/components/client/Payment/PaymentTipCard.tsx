import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface PaymentTipCardProps {
  tipOptions: number[];
  rideAmount: number;
  selectedTipPercent: number | null;
  customTip: string;
  onSelectTip: (percent: number) => void;
  onCustomTip: (value: string) => void;
  formatCurrency: (value: number) => string;
  styles: any;
  t: TFunction;
}

export function PaymentTipCard({
  tipOptions,
  rideAmount,
  selectedTipPercent,
  customTip,
  onSelectTip,
  onCustomTip,
  formatCurrency,
  styles,
  t,
}: PaymentTipCardProps) {
  return (
    <View style={styles.tipCard}>
      <Text style={styles.tipTitle}>{t('shared.payment.tip.title')}</Text>
      <View style={styles.tipOptions}>
        {tipOptions.map((percent) => (
          <TouchableOpacity
            key={percent}
            style={[
              styles.tipButton,
              selectedTipPercent === percent && styles.tipButtonActive,
            ]}
            onPress={() => onSelectTip(percent)}
          >
            <Text
              style={[
                styles.tipButtonText,
                selectedTipPercent === percent && styles.tipButtonTextActive,
              ]}
            >
              {percent}%
            </Text>
            <Text
              style={[
                styles.tipButtonAmount,
                selectedTipPercent === percent && styles.tipButtonAmountActive,
              ]}
            >
              {formatCurrency(rideAmount * (percent / 100))}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.customTipLabel}>{t('shared.payment.tip.customLabel')}</Text>
      <TextInput
        style={styles.customTipInput}
        placeholder={t('shared.payment.tip.placeholder')}
        keyboardType="numeric"
        value={customTip}
        onChangeText={onCustomTip}
      />
    </View>
  );
}
