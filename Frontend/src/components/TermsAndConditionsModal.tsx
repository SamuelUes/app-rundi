import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export const CURRENT_TERMS_VERSION = '2025-11-29';

interface TermsAndConditionsModalProps {
  visible: boolean;
  saving?: boolean;
  requireCheck?: boolean;
  checked?: boolean;
  acceptLabel?: string;
  onToggleChecked?: () => void;
  onAccept?: () => void;
  onRequestClose?: () => void;
}

const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
  visible,
  saving = false,
  requireCheck = false,
  checked = false,
  acceptLabel,
  onToggleChecked,
  onAccept,
  onRequestClose,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!visible) {
    return null;
  }

  const isChecked = requireCheck ? !!checked : true;
  const disabled = saving || !isChecked;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('common.components.termsModal.title')}</Text>
        <Text style={styles.version}>
          {t('common.components.termsModal.version', { version: CURRENT_TERMS_VERSION })}
        </Text>
        <ScrollView style={styles.content}>
          <Text style={styles.text}>
            {t('common.components.termsModal.body')}
          </Text>
        </ScrollView>

        {requireCheck && (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={onToggleChecked}
            disabled={saving}
          >
            <View
              style={[
                styles.checkbox,
                checked && styles.checkboxChecked,
              ]}
            >
              {checked && <Text style={styles.checkboxIcon}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              {t('common.components.termsModal.checkboxLabel')}
            </Text>
          </TouchableOpacity>
        )}

        {onAccept && (
          <TouchableOpacity
            style={[styles.acceptButton, disabled && styles.buttonDisabled]}
            onPress={onAccept}
            disabled={disabled}
          >
            <Text style={styles.acceptButtonText}>
              {saving
                ? t('common.components.termsModal.saving')
                : acceptLabel || t('common.components.termsModal.acceptButton')}
            </Text>
          </TouchableOpacity>
        )}

        {onRequestClose && !requireCheck && (
          <TouchableOpacity
            style={styles.closeLink}
            onPress={onRequestClose}
            disabled={saving}
          >
            <Text style={styles.closeLinkText}>
              {t('common.components.termsModal.close')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxHeight: '80%',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    version: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 12,
      textAlign: 'center',
    },
    content: {
      maxHeight: 260,
      marginBottom: 16,
    },
    text: {
      fontSize: 13,
      color: colors.textSecondary || 'rgba(255,255,255,0.75)',
      lineHeight: 18,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: colors.background,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkboxIcon: {
      fontSize: 14,
      color: '#0F172A',
      fontWeight: '700',
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    acceptButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    acceptButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#0F172A',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    closeLink: {
      marginTop: 12,
      alignItems: 'center',
    },
    closeLinkText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });

export default TermsAndConditionsModal;
