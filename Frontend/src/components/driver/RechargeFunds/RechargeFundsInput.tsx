import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import SupportChatShortcut from '../../shared/SupportChatShortcut';
import type { TFunction } from 'i18next';

interface RechargeFundsInputProps {
  amount: string;
  submitting: boolean;
  parsedRechargeAmount: number;
  inputTexts: { amountLabel: string; amountPlaceholder: string };
  colors: any;
  onSetAmount: (v: string) => void;
  onPay: () => void;
  t: TFunction;
  styles: any;
}

export function RechargeFundsInput({
  amount,
  submitting,
  parsedRechargeAmount,
  inputTexts,
  colors,
  onSetAmount,
  onPay,
  t,
  styles,
}: RechargeFundsInputProps) {
  return (
    <>
      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>{inputTexts.amountLabel}</Text>
        <TextInput
          value={amount}
          onChangeText={onSetAmount}
          placeholder={inputTexts.amountPlaceholder}
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          keyboardType="decimal-pad"
        />
      </View>

      <TouchableOpacity
        style={[
          styles.payButton,
          (submitting || parsedRechargeAmount <= 0) &&
            styles.payButtonDisabled,
        ]}
        disabled={submitting || parsedRechargeAmount <= 0}
        onPress={onPay}
        activeOpacity={0.85}
      >
        {submitting ? (
          <LoadingIcon size={20} color="#fff" />
        ) : (
          <Text style={styles.payButtonText}>
            {t('driver.rechargeFunds.button.pay', {
              amount: (parsedRechargeAmount > 0 ? parsedRechargeAmount : 0).toFixed(2),
            })}
          </Text>
        )}
      </TouchableOpacity>

      <SupportChatShortcut
        style={{ marginTop: 16 }}
        initialCategory="payment"
        initialTitle={t('driver.rechargeFunds.support.title')}
        label={t('driver.rechargeFunds.support.label')}
        description={t('driver.rechargeFunds.support.description')}
      />
    </>
  );
}
