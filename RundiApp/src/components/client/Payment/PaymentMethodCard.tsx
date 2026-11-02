import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useIsDark } from '../../../stores/themeStore';
import type { TFunction } from 'i18next';

interface PaymentMethodCardProps {
  paymentMethod: 'card' | 'cash';
  changingPaymentMethod: boolean;
  onSelectMethod: (method: 'card' | 'cash') => void;
  colors: any;
  styles: any;
  t: TFunction;
}

export function PaymentMethodCard({
  paymentMethod,
  changingPaymentMethod,
  onSelectMethod,
  colors,
  styles,
  t,
}: PaymentMethodCardProps) {
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

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
        activeOpacity={0.8}
      >
        <View style={styles.methodIconWrap}>
          <MaterialIcons name="payments" size={22} color={accent} />
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodName}>{t('shared.payment.paymentMethod.cashTitle')}</Text>
          <Text style={styles.methodDescription}>
            {t('shared.payment.paymentMethod.cashSubtitle')}
          </Text>
        </View>
        {paymentMethod === 'cash' && (
          <MaterialIcons name="check-circle" size={22} color={colors.primary} />
        )}
      </TouchableOpacity>
    </View>
  );
}
