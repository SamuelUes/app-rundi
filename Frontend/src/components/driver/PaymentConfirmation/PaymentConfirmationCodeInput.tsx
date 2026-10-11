import React, { useRef } from 'react';
import { View, Text, TextInput } from 'react-native';
import {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { AnimatedButton } from '../../ui/AnimatedButton';
import alertService from '../../../services/alertService';
import { useIsDark } from '../../../stores/themeStore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../../config/firebase';
import sessionService from '../../../services/sessionService';

interface PaymentConfirmationCodeInputProps {
  rideId: string;
  code: string | null;
  codeDigits: string[];
  isCodeValidated: boolean;
  confirming: boolean;
  switching: boolean;
  buttonTexts: { generateCode: string };
  alertsTexts: {
    codeSuccessTitle: string;
    codeSuccessMessage: string;
    codeErrorMessage: string;
  };
  colors: any;
  t: any;
  onSetCode: (code: string) => void;
  onSetCodeDigits: (digits: string[]) => void;
  onSetIsCodeValidated: (validated: boolean) => void;
  onSetConfirming: (confirming: boolean) => void;
  styles: any;
}

export function PaymentConfirmationCodeInput({
  rideId,
  code,
  codeDigits,
  isCodeValidated,
  confirming,
  switching,
  buttonTexts,
  alertsTexts,
  colors,
  t,
  onSetCode,
  onSetCodeDigits,
  onSetIsCodeValidated,
  onSetConfirming,
  styles,
}: PaymentConfirmationCodeInputProps) {
  const codeInputsRef = useRef<Array<TextInput | null>>([]);
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  return (
    <>
      {!code && (
        <AnimatedButton
          title={buttonTexts.generateCode}
          iconName="vpn-key"
          variant="outline"
          color={accent}
          onPress={async () => {
            try {
              onSetConfirming(true);

              const { app } = await initializeFirebase();
              if (!app) throw new Error('Firebase no inicializado');

              const functions = getFunctions(app);
              const generateCashCodeFn = httpsCallable(functions, 'generateCashCode');
              const deviceId = await sessionService.getDeviceId();

              const res = await generateCashCodeFn({ rideId, deviceId });
              const data = res.data as any;

              if (data?.success && data.code) {
                onSetCode(String(data.code));
                onSetCodeDigits(['', '', '', '']);
                onSetIsCodeValidated(false);
              }
            } catch (e: any) {
              console.error('❌ Error generando código:', e);
              alertService.showErrorAlert(e.message || 'No se pudo generar el código');
            } finally {
              onSetConfirming(false);
            }
          }}
          loading={confirming}
          disabled={confirming || switching}
          style={{ marginBottom: 12 }}
        />
      )}

      {code && (
        <View style={styles.codeContainer}>
          <Text style={styles.codeLabel}>
            {t('driver.paymentConfirmation.codeLabel', { code })}
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
                  isCodeValidated && styles.codeBoxValidated,
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

                  const currentCode = newDigits.join('');
                  if (currentCode.length === 4 && code) {
                    if (currentCode === code) {
                      onSetIsCodeValidated(true);
                      alertService.showSuccessAlert(
                        alertsTexts.codeSuccessTitle,
                        alertsTexts.codeSuccessMessage
                      );
                    } else {
                      onSetIsCodeValidated(false);
                      alertService.showErrorAlert(alertsTexts.codeErrorMessage);
                    }
                  } else {
                    onSetIsCodeValidated(false);
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
      )}
    </>
  );
}
