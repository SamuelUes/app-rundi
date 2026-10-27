import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import OtpCodeInput from '../../ui/OtpCodeInput';
import { LoadingIcon } from '../../ui/LoadingIcon';

interface RideVerificationCodeModalProps {
  visible: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (code: string) => void;
}

export function RideVerificationCodeModal({
  visible,
  loading,
  error,
  onClose,
  onSubmit,
}: RideVerificationCodeModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (visible) setCode('');
  }, [visible]);

  useEffect(() => {
    if (error) setCode('');
  }, [error]);

  const canSubmit = code.length === 4 && !loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t('driver.activeRide.verification.title')}</Text>
              <Text style={styles.subtitle}>{t('driver.activeRide.verification.subtitle')}</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              disabled={loading}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('driver.activeRide.verification.close')}
            >
              <MaterialIcons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <OtpCodeInput
            value={code}
            onChange={setCode}
            length={4}
            disabled={loading}
            autoFocus
            accessibilityLabel={t('driver.activeRide.verification.inputLabel')}
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
            onPress={() => canSubmit && onSubmit(code)}
            disabled={!canSubmit}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
          >
            {loading ? (
              <LoadingIcon size={18} color="#1C1917" animation="spin" />
            ) : (
              <MaterialIcons name="check-circle" size={18} color="#1C1917" />
            )}
            <Text style={styles.submitText}>
              {loading
                ? t('driver.activeRide.verification.confirming')
                : t('driver.activeRide.verification.confirm')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    sheet: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 18,
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    headerCopy: { flex: 1, gap: 4 },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    closeButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.error,
      textAlign: 'center',
    },
    submitButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    submitDisabled: { opacity: 0.55 },
    submitText: {
      color: '#1C1917',
      fontWeight: '700',
      fontSize: 15,
    },
  });
