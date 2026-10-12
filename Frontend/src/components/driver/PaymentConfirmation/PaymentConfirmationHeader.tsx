import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useIsDark } from '../../../stores/themeStore';

interface PaymentConfirmationHeaderProps {
  paymentMethod: 'cash' | 'card';
  headerTexts: {
    cashTitle: string;
    cardTitle: string;
    cashSubtitle: string;
    cardSubtitle: string;
  };
  clientName: string;
  colors: any;
  t: any;
  styles: any;
}

export function PaymentConfirmationHeader({
  paymentMethod,
  headerTexts,
  clientName,
  colors,
  t,
  styles,
}: PaymentConfirmationHeaderProps) {
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  return (
    <View style={styles.header}>
      <View style={styles.headerIconWrap}>
        <MaterialIcons name={paymentMethod === 'cash' ? 'payments' : 'credit-card'} size={26} color={accent} />
      </View>
      <Text style={styles.title}>
        {paymentMethod === 'cash' ? headerTexts.cashTitle : headerTexts.cardTitle}
      </Text>
      <Text style={styles.subtitle}>
        {paymentMethod === 'cash'
          ? t('driver.paymentConfirmation.header.cashSubtitle', { name: clientName })
          : t('driver.paymentConfirmation.header.cardSubtitle', { name: clientName })}
      </Text>
    </View>
  );
}
