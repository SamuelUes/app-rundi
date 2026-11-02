import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

export const CURRENT_TERMS_VERSION = '1.0';

export type TermsDocumentType = 'general' | 'users' | 'designated_driver';

type TermsDocumentsCheckedState = Record<TermsDocumentType, boolean>;

interface TermsAndConditionsModalProps {
  visible: boolean;
  saving?: boolean;
  requireCheck?: boolean;
  checked?: boolean;
  checkedDocuments?: Partial<TermsDocumentsCheckedState>;
  showDocumentSelector?: boolean;
  requireAllDocumentsCheck?: boolean;
  defaultDocumentType?: TermsDocumentType;
  acceptLabel?: string;
  onToggleChecked?: () => void;
  onToggleDocumentChecked?: (documentType: TermsDocumentType) => void;
  onAccept?: () => void;
  onRequestClose?: () => void;
}

const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
  visible,
  saving = false,
  requireCheck = false,
  checked = false,
  checkedDocuments,
  showDocumentSelector = false,
  requireAllDocumentsCheck = false,
  defaultDocumentType = 'designated_driver',
  acceptLabel,
  onToggleChecked,
  onToggleDocumentChecked,
  onAccept,
  onRequestClose,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedDocument, setSelectedDocument] = useState<TermsDocumentType>(defaultDocumentType);

  useEffect(() => {
    if (visible) {
      setSelectedDocument(defaultDocumentType);
    }
  }, [defaultDocumentType, visible]);

  if (!visible) {
    return null;
  }

  const isChecked = requireCheck ? !!checked : true;
  const documentOptions: TermsDocumentType[] = ['general', 'users', 'designated_driver'];
  const effectiveCheckedDocuments: TermsDocumentsCheckedState = {
    general: checkedDocuments?.general === true,
    users: checkedDocuments?.users === true,
    designated_driver: checkedDocuments?.designated_driver === true,
  };
  const currentDocumentChecked = effectiveCheckedDocuments[selectedDocument];
  const allDocumentsChecked = documentOptions.every((documentType) => effectiveCheckedDocuments[documentType]);
  const disabled = saving || (requireAllDocumentsCheck ? !allDocumentsChecked : !isChecked);
  const documentLabel = t(`common.components.termsModal.documents.${selectedDocument}.label`);
  const documentBody = t(`common.components.termsModal.documents.${selectedDocument}.body`, {
    defaultValue: t('common.components.termsModal.body'),
  });
  const documentVersion = t(`common.components.termsModal.documents.${selectedDocument}.version`, {
    version: CURRENT_TERMS_VERSION,
    defaultValue: t('common.components.termsModal.version', { version: CURRENT_TERMS_VERSION }),
  });

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('common.components.termsModal.title')}</Text>
          <Text style={styles.subtitle}>{documentLabel}</Text>
          <Text style={styles.version}>{documentVersion}</Text>
        </View>

        {showDocumentSelector && (
          <View style={styles.selectorWrapper}>
            <Text style={styles.selectorLabel}>{t('common.components.termsModal.selectorLabel')}</Text>
            <View style={styles.selectorOptions}>
              {documentOptions.map((option) => {
                const active = option === selectedDocument;
                const documentChecked = effectiveCheckedDocuments[option];
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.selectorOption, active && styles.selectorOptionActive]}
                    onPress={() => setSelectedDocument(option)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: saving }}
                  >
                    <Text style={[styles.selectorOptionText, active && styles.selectorOptionTextActive]}>
                      {t(`common.components.termsModal.documents.${option}.label`)}
                    </Text>
                    {documentChecked && (
                      <Text style={[styles.selectorOptionCheck, active && styles.selectorOptionCheckActive]}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <ScrollView style={styles.content}>
          <Text style={styles.text}>{documentBody}</Text>
        </ScrollView>

        {requireCheck && !requireAllDocumentsCheck && (
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

        {requireAllDocumentsCheck && (
          <>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => onToggleDocumentChecked?.(selectedDocument)}
              disabled={saving}
            >
              <View
                style={[
                  styles.checkbox,
                  currentDocumentChecked && styles.checkboxChecked,
                ]}
              >
                {currentDocumentChecked && <Text style={styles.checkboxIcon}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('common.components.termsModal.checkboxLabel')}
              </Text>
            </TouchableOpacity>

            <Text style={styles.documentProgressText}>
              {`${documentOptions.filter((documentType) => effectiveCheckedDocuments[documentType]).length}/${documentOptions.length}`}
            </Text>
          </>
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
      backgroundColor: 'rgba(0,0,0,0.64)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    card: {
      width: '100%',
      maxHeight: '88%',
      backgroundColor: colors.card,
      borderRadius: 24,
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.4,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '600',
      marginBottom: 5,
    },
    version: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    selectorWrapper: {
      marginBottom: 16,
    },
    selectorLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: 9,
    },
    selectorOptions: {
      gap: 8,
    },
    selectorOption: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.surface || colors.background,
    },
    selectorOptionActive: {
      backgroundColor: colors.primary,
    },
    selectorOptionText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontWeight: '600',
    },
    selectorOptionTextActive: {
      color: '#241B0B',
    },
    selectorOptionCheck: {
      marginLeft: 10,
      fontSize: 15,
      fontWeight: '700',
      color: colors.primary,
    },
    selectorOptionCheckActive: {
      color: '#241B0B',
    },
    content: {
      flexShrink: 1,
      minHeight: 120,
      maxHeight: 280,
      marginBottom: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.surface || colors.background,
    },
    text: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 21,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      marginBottom: 12,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      backgroundColor: colors.background,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkboxIcon: {
      fontSize: 14,
      color: '#241B0B',
      fontWeight: '700',
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
    },
    documentProgressText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'right',
      marginTop: -8,
      marginBottom: 12,
    },
    acceptButton: {
      minHeight: 52,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acceptButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#241B0B',
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    closeLink: {
      minHeight: 44,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeLinkText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });

export default TermsAndConditionsModal;
