import React, { useRef, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import {
  TextInputInstance,
  TextInputKeyPressEvent,
} from 'react-native';
import { AnimatedButton } from '../../ui/AnimatedButton';
import { useIsDark } from '../../../stores/themeStore';

interface PaymentConfirmationCodeInputProps {
  codeDigits: string[];
  confirming: boolean;
  switching: boolean;
  buttonTexts: { enterCode: string; hideCode: string };
  colors: any;
  t: any;
  onSetCodeDigits: (digits: string[]) => void;
  styles: any;
}

export function PaymentConfirmationCodeInput({
  codeDigits,
  confirming,
  switching,
  buttonTexts,
  colors,
  t,
  onSetCodeDigits,
  styles,
}: PaymentConfirmationCodeInputProps) {
  const codeInputsRef = useRef<Array<TextInputInstance | null>>([]);
  const [codeVisible, setCodeVisible] = useState(false);
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  return (
    <>
      <AnimatedButton
        title={codeVisible ? buttonTexts.hideCode : buttonTexts.enterCode}
        iconName={codeVisible ? 'visibility-off' : 'vpn-key'}
        variant="outline"
        color={accent}
        onPress={() => setCodeVisible((v) => !v)}
        disabled={confirming || switching}
        style={{ marginBottom: 12 }}
      />

      {codeVisible && <View style={styles.codeContainer}>
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
              style={styles.codeBox}
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
                e: TextInputKeyPressEvent
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
      </View>}
    </>
  );
}
