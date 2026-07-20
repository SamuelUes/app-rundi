import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface PaymentMethodCardProps {
  paymentMethod: 'card' | 'cash';
  changingPaymentMethod: boolean;
  onSelectMethod: (method: 'card' | 'cash') => void;
  styles: any;
  t: TFunction;
}

export function PaymentMethodCard({
  paymentMethod,
  changingPaymentMethod,
  onSelectMethod,
  styles,
  t,
}: PaymentMethodCardProps) {
  return (
    <View style={styles.paymentMethodCard}>
      <Text style={styles.paymentMethodTitle}>{t('shared.payment.paymentMethod.title')}</Text>

      <TouchableOpacity
        style={[
          styles.methodButton,
          paymentMethod === 'cash' && styles.methodButtonActive,
        ]}
        onPress={() => onSelectMethod('cash')}
        disabled={changingPaymentMethod}
      >
        <Text style={styles.methodIcon}>💵</Text>
        <View style={styles.methodInfo}>
          <Text style={styles.methodName}>{t('shared.payment.paymentMethod.cashTitle')}</Text>
          <Text style={styles.methodDescription}>
            {t('shared.payment.paymentMethod.cashSubtitle')}
          </Text>
        </View>
        {paymentMethod === 'cash' && (
          <Text style={styles.methodCheck}>✓</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
