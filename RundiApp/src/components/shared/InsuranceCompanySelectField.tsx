import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { INSURANCE_COMPANIES } from '../../constants/insuranceCompanies';

export { INSURANCE_COMPANIES };

const OTHER_VALUE = 'Otra';

interface InsuranceCompanySelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Estilo del campo cerrado (mismo que un input) */
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/**
 * Selector de aseguradora con catálogo fijo (enum vehicle_insurance_company).
 * Renderiza un campo tipo input que abre un modal con las opciones.
 */
export const InsuranceCompanySelectField = ({
  value,
  onChange,
  placeholder,
  style,
  disabled = false,
}: InsuranceCompanySelectFieldProps) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [visible, setVisible] = useState(false);

  const displayValue =
    value === OTHER_VALUE
      ? t('common.components.insuranceCompany.otherOption')
      : value;

  return (
    <>
      <TouchableOpacity
        style={[style, styles.fieldRow]}
        onPress={() => setVisible(true)}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <Text
          style={[styles.fieldText, !displayValue && { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {displayValue || placeholder}
        </Text>
        <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {t('common.components.insuranceCompany.selectTitle')}
            </Text>
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {[...INSURANCE_COMPANIES, OTHER_VALUE].map((company) => {
                const isOther = company === OTHER_VALUE;
                return (
                  <TouchableOpacity
                    key={company}
                    style={[styles.optionRow, isOther && styles.optionRowOther]}
                    onPress={() => {
                      onChange(company);
                      setVisible(false);
                    }}
                  >
                    <Text
                      style={[styles.optionText, isOther && { color: colors.textSecondary }]}
                    >
                      {isOther ? t('common.components.insuranceCompany.otherOption') : company}
                    </Text>
                    {value === company && (
                      <MaterialIcons name="check" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default InsuranceCompanySelectField;

const createStyles = (colors: any) =>
  StyleSheet.create({
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    fieldText: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: '70%',
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    modalList: {
      flexGrow: 0,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 13,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionRowOther: {
      borderBottomWidth: 0,
    },
    optionText: {
      fontSize: 15,
      color: colors.text,
    },
  });
