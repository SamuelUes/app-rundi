import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';
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
        <Text style={styles.title}>{t('common.components.termsModal.title')}</Text>
        <Text style={styles.subtitle}>{documentLabel}</Text>
        <Text style={styles.version}>{documentVersion}</Text>

        {showDocumentSelector && (
          <View style={styles.selectorWrapper}>
            <Text style={styles.selectorLabel}>{t('common.components.termsModal.selectorLabel')}</Text>
            <ScrollView
              horizontal
              style={styles.selectorScroll}
              contentContainerStyle={styles.selectorRow}
              showsHorizontalScrollIndicator={false}
            >
              {documentOptions.map((option) => {
                const active = option === selectedDocument;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.selectorChip, active && styles.selectorChipActive]}
                    onPress={() => setSelectedDocument(option)}
                    disabled={saving}
                  >
                    <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>
                      {t(`common.components.termsModal.documents.${option}.label`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
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
      marginBottom: 2,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 13,
      color: colors.text,
      textAlign: 'center',
      marginBottom: 4,
      fontWeight: '600',
    },
    version: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 12,
      textAlign: 'center',
    },
    selectorWrapper: {
      marginBottom: 10,
    },
    selectorLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 8,
      textAlign: 'center',
    },
    selectorScroll: {
      maxHeight: 42,
    },
    selectorRow: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 2,
    },
    selectorChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: colors.surface || colors.background,
    },
    selectorChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    selectorChipText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '600',
    },
    selectorChipTextActive: {
      color: '#0F172A',
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
    documentProgressText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'right',
      marginTop: -10,
      marginBottom: 12,
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
