import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface PaymentPayButtonProps {
  isPendingPayment: boolean;
  processing: boolean;
  onPay: () => void;
  colors: any;
  styles: any;
  t: TFunction;
}

export function PaymentPayButton({
  isPendingPayment,
  processing,
  onPay,
  colors,
  styles,
  t,
}: PaymentPayButtonProps) {
  return (
    <>
      <TouchableOpacity
        style={[
          styles.payButton,
          isPendingPayment && styles.payButtonPending,
          processing && styles.payButtonDisabled,
        ]}
        onPress={onPay}
        disabled={processing}
      >
        {processing ? (
          <LoadingIcon size={22} color="#fff" />
        ) : (
          <>
            <MaterialIcons name="payments" size={20} color="#fff" />
            <Text style={styles.payButtonText}>
              {t('shared.payment.buttons.payCash')}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.securityInfo}>
        <MaterialIcons name="lock-outline" size={20} color={colors.textSecondary} />
        <Text style={styles.securityText}>
          {t('shared.payment.security.message')}
        </Text>
      </View>
    </>
  );
}
