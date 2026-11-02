import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import {
  CountryDialOption,
  formatLocalDigits,
  getCountryFlagEmoji,
  getCountryLocalNumberLength,
  getLocalNumberPlaceholder,
} from '../../utils/format/phoneUtils';

export type PhoneFieldProps = {
  countryOptions?: CountryDialOption[];
  selectedCountry: CountryDialOption;
  onCountryChange?: (countryCode: string) => void;
  digits: string;
  onChangeDigits: (digits: string) => void;
  disabled?: boolean;
  maxDigitsOverride?: number;
  autoFocus?: boolean;
  accessibilityLabel?: string;
};

const PhoneField: React.FC<PhoneFieldProps> = ({
  countryOptions,
  selectedCountry,
  onCountryChange,
  digits,
  onChangeDigits,
  disabled,
  maxDigitsOverride,
  autoFocus,
  accessibilityLabel,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);

  const maxDigits = maxDigitsOverride ?? getCountryLocalNumberLength(selectedCountry);
  const safeDigits = digits.slice(0, maxDigits);
  const displayValue = formatLocalDigits(safeDigits, selectedCountry.code);
  const placeholder = getLocalNumberPlaceholder(selectedCountry);
  const hasSelector = !!countryOptions && countryOptions.length > 0 && !!onCountryChange;

  const handleChangeText = (text: string) => {
    if (disabled) {
      return;
    }
    const numeric = text.replace(/\D/g, '').slice(0, maxDigits);
    onChangeDigits(numeric);
  };

  return (
    <View
      style={[
        styles.field,
        isFocused && styles.fieldFocused,
        disabled && styles.fieldDisabled,
      ]}
    >
      <View style={styles.countrySegment}>
        <View style={styles.countryContent} pointerEvents="none">
          <Text style={styles.flag}>{getCountryFlagEmoji(selectedCountry.code)}</Text>
          <Text style={styles.dialCode}>{selectedCountry.dialCode}</Text>
          {hasSelector && (
            <MaterialIcons
              name="keyboard-arrow-down"
              size={18}
              color={colors.textSecondary}
            />
          )}
        </View>

        {hasSelector && (
          <Picker
            enabled={!disabled}
            selectedValue={selectedCountry.code}
            onValueChange={(value) => {
              if (typeof value === 'string' && onCountryChange) {
                onCountryChange(value);
              }
            }}
            style={styles.countryPicker}
            itemStyle={styles.countryPickerItem}
            dropdownIconColor={colors.textSecondary}
            accessibilityLabel={`${selectedCountry.name} (${selectedCountry.dialCode})`}
          >
            {countryOptions!.map((option) => (
              <Picker.Item
                key={option.code}
                label={`${option.name} (${option.dialCode})`}
                value={option.code}
              />
            ))}
          </Picker>
        )}
      </View>

      <View style={styles.divider} />

      <TextInput
        style={styles.input}
        value={displayValue}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType="number-pad"
        editable={!disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoFocus={autoFocus}
        returnKeyType="done"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
};

export default PhoneField;

const createStyles = (colors: any) =>
  StyleSheet.create({
    field: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    fieldFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '0A',
    },
    fieldDisabled: {
      opacity: 0.55,
    },
    countrySegment: {
      position: 'relative',
      alignSelf: 'stretch',
      justifyContent: 'center',
      paddingLeft: 14,
      paddingRight: 10,
    },
    countryContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    flag: {
      fontSize: 20,
    },
    dialCode: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    countryPicker: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      opacity: 0,
    },
    countryPickerItem: {
      fontSize: 15,
      color: colors.text,
    },
    divider: {
      width: StyleSheet.hairlineWidth * 2,
      height: 26,
      backgroundColor: colors.border,
    },
    input: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'android' ? 12 : 0,
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: 0.4,
    },
  });
