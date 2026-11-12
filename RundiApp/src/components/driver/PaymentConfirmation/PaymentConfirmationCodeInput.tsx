import React, { useRef } from 'react';
import { View, Text, TextInput } from 'react-native';
import {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { AnimatedButton } from '../../ui/AnimatedButton';
import { useIsDark } from '../../../stores/themeStore';

interface PaymentConfirmationCodeInputProps {
  codeSent: boolean;
  codeDigits: string[];
  confirming: boolean;
  switching: boolean;
  buttonTexts: { generateCode: string };
  colors: any;
  t: any;
  onSetCodeDigits: (digits: string[]) => void;
  onRequestCode: () => void;
  styles: any;
}

export function PaymentConfirmationCodeInput({
  codeSent,
  codeDigits,
  confirming,
  switching,
  buttonTexts,
  colors,
  t,
  onSetCodeDigits,
  onRequestCode,
  styles,
}: PaymentConfirmationCodeInputProps) {
  const codeInputsRef = useRef<Array<TextInput | null>>([]);
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  return (
    <>
      <AnimatedButton
        title={buttonTexts.generateCode}
        iconName="vpn-key"
        variant="outline"
        color={accent}
        onPress={onRequestCode}
        loading={confirming}
        disabled={confirming || switching}
        style={{ marginBottom: 12 }}
      />

      <View style={styles.codeContainer}>
        <Text style={styles.codeLabel}>
          {t('driver.paymentConfirmation.codeLabel')}
        </Text>
        <View style={styles.codeBoxRow}>
          {[0, 1, 2, 3].map((index) => (
            <TextInput
              key={index}
              ref={(el) => {
                codeInputsRef.current[index] = el;
              }}
              style={[
                styles.codeBox,
                codeSent && styles.codeBoxValidated,
              ]}
              keyboardType="number-pad"
              maxLength={1}
              value={codeDigits[index]}
              onChangeText={(text) => {
                const digit = text.replace(/[^0-9]/g, '').slice(-1);
                const newDigits = [...codeDigits];
                newDigits[index] = digit;
                onSetCodeDigits(newDigits);

                if (digit && index < 3) {
                  codeInputsRef.current[index + 1]?.focus();
                }
              }}
              onKeyPress={(
                e: NativeSyntheticEvent<TextInputKeyPressEventData>
              ) => {
                if (
                  e.nativeEvent.key === 'Backspace' &&
                  !codeDigits[index] &&
                  index > 0
                ) {
                  codeInputsRef.current[index - 1]?.focus();
                }
              }}
            />
          ))}
        </View>
      </View>
    </>
  );
}
