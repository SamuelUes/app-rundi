import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
  return (
    <View style={styles.header}>
      <MaterialIcons name={paymentMethod === 'cash' ? 'payments' : 'credit-card'} size={48} color={colors.primary} />
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
