import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import OtpCodeInput from '../ui/OtpCodeInput';
import { LoadingIcon } from '../ui/LoadingIcon';

type Props = {
  code: string;
  onChangeCode: (code: string) => void;
  onVerify: () => void;
  onResend: () => void;
  loading: boolean;
  resendLoading: boolean;
  timeLeft: number;
  attempts: number;
  maxAttempts: number;
  primaryColor: string;
  styles: any;
  translationKey: 'phoneVerification' | 'phoneVerificationLogin';
};

export default function PhoneCodeForm({
  code, onChangeCode, onVerify, onResend, loading, resendLoading,
  timeLeft, attempts, maxAttempts, primaryColor, styles, translationKey,
}: Props) {
  const { t } = useTranslation();
  const prefix = `authScreens.${translationKey}`;
  const codeLabel = t(`${prefix}.${translationKey === 'phoneVerification' ? 'codeLabel' : 'codeSectionLabel'}`);
  const verifyDisabled = loading || code.length !== 6;

  return (
    <>
      <View style={styles.codeSection}>
        <Text style={styles.label}>{codeLabel}</Text>
        <OtpCodeInput
          value={code}
          onChange={onChangeCode}
          disabled={loading}
          autoFocus
          accessibilityLabel={codeLabel}
        />
      </View>
      {attempts > 0 && (
        <View style={styles.attemptsWarning}>
          <Text style={styles.attemptsText}>
            {t(`${prefix}.attemptsLabel`, { remaining: Math.max(0, maxAttempts - attempts), max: maxAttempts })}
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.primaryButton, verifyDisabled && styles.buttonDisabled]}
        onPress={onVerify}
        disabled={verifyDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: verifyDisabled }}
      >
        {loading ? <LoadingIcon size={24} color="#241B0B" /> : (
          <Text style={styles.primaryButtonText}>{t(`${prefix}.verifyButton`)}</Text>
        )}
      </TouchableOpacity>
      <View style={styles.resendSection}>
        <Text style={styles.resendText}>{t(`${prefix}.resend.question`)}</Text>
        {timeLeft > 0 ? (
          <Text style={styles.resendTimer}>{t(`${prefix}.resend.timer`, { seconds: timeLeft })}</Text>
        ) : (
          <TouchableOpacity
            style={styles.resendAction}
            onPress={onResend}
            disabled={resendLoading || loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: resendLoading || loading }}
          >
            {resendLoading ? <LoadingIcon size={20} color={primaryColor} /> : (
              <Text style={styles.resendButton}>{t(`${prefix}.resend.button`)}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}
