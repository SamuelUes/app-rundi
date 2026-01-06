import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Platform,
  KeyboardAvoidingView,
  Image,
  TextInput,
  Alert,
} from 'react-native';

import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  CountryDialOption,
  normalizePhoneNumber,
  formatPhoneNumber,
  getCountryLocalNumberLength,
  getCountryAreaCodeLength,
} from '../utils/phoneUtils';
import PhoneDigitInput from './PhoneDigitInput';

export type PhoneNumberModalResult = {
  country: CountryDialOption;
  digits: string;
  normalizedPhone: string;
  formattedPhone: string;
};

type Props = {
  visible: boolean;
  countryOptions: CountryDialOption[];
  initialCountry: CountryDialOption;
  initialDigits: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (result: PhoneNumberModalResult) => void;
};

const E164_REGEX = /^\+\d{6,15}$/;

const PhoneNumberModal: React.FC<Props> = ({
  visible,
  countryOptions,
  initialCountry,
  initialDigits,
  loading,
  onClose,
  onConfirm,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(initialCountry);
  const [areaDigits, setAreaDigits] = useState('');
  const [digits, setDigits] = useState(initialDigits);
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [formattedPhone, setFormattedPhone] = useState('');

  const sheetAnim = useRef(new Animated.Value(0)).current;

  const computeFromFullLocal = (
    country: CountryDialOption,
    fullLocalDigits: string,
  ) => {
    const maxLocal = getCountryLocalNumberLength(country);
    const areaLength = getCountryAreaCodeLength(country);
    const numeric = (fullLocalDigits || '').replace(/\D/g, '').slice(0, maxLocal);

    const areaPart = areaLength > 0 ? numeric.slice(0, areaLength) : '';
    const linePart = areaLength > 0 ? numeric.slice(areaLength) : numeric;
    const combined = areaPart + linePart;

    const normalized = combined
      ? normalizePhoneNumber(combined, country.dialCode)
      : '';
    const formatted = normalized
      ? formatPhoneNumber(normalized, country.dialCode)
      : `${country.dialCode} `;

    return {
      areaDigits: areaPart,
      lineDigits: linePart,
      normalized,
      formatted,
    };
  };

  const computeFromParts = (
    country: CountryDialOption,
    rawArea: string,
    rawLine: string,
  ) => {
    const maxLocal = getCountryLocalNumberLength(country);
    const areaLength = getCountryAreaCodeLength(country);

    const numericArea =
      areaLength > 0 ? (rawArea || '').replace(/\D/g, '').slice(0, areaLength) : '';
    const remainingForLine = Math.max(0, maxLocal - numericArea.length);
    const numericLine = (rawLine || '')
      .replace(/\D/g, '')
      .slice(0, remainingForLine);

    const combined = numericArea + numericLine;

    const normalized = combined
      ? normalizePhoneNumber(combined, country.dialCode)
      : '';
    const formatted = normalized
      ? formatPhoneNumber(normalized, country.dialCode)
      : `${country.dialCode} `;

    return {
      areaDigits: numericArea,
      lineDigits: numericLine,
      normalized,
      formatted,
    };
  };

  useEffect(() => {
    let country = initialCountry;
    if (!country && countryOptions.length > 0) {
      country = countryOptions[0];
    }

    const result = computeFromFullLocal(country, initialDigits || '');

    setSelectedCountry(country);
    setAreaDigits(result.areaDigits);
    setDigits(result.lineDigits);
    setNormalizedPhone(result.normalized);
    setFormattedPhone(result.formatted);
  }, [initialCountry, initialDigits, countryOptions]);

  useEffect(() => {
    if (visible) {
      Animated.timing(sheetAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, sheetAnim]);

  const handleCountryChange = (code: string) => {
    const nextCountry =
      countryOptions.find((c) => c.code === code) ?? selectedCountry;

    const result = computeFromFullLocal(nextCountry, areaDigits + digits);

    setSelectedCountry(nextCountry);
    setAreaDigits(result.areaDigits);
    setDigits(result.lineDigits);
    setNormalizedPhone(result.normalized);
    setFormattedPhone(result.formatted);
  };

  const handleDigitsChange = (nextDigits: string) => {
    const result = computeFromParts(selectedCountry, areaDigits, nextDigits);

    setAreaDigits(result.areaDigits);
    setDigits(result.lineDigits);
    setNormalizedPhone(result.normalized);
    setFormattedPhone(result.formatted);
  };

  const handleAreaChange = (nextArea: string) => {
    const result = computeFromParts(selectedCountry, nextArea, digits);

    setAreaDigits(result.areaDigits);
    setDigits(result.lineDigits);
    setNormalizedPhone(result.normalized);
    setFormattedPhone(result.formatted);
  };

  const handleConfirm = () => {
    if (!normalizedPhone || !E164_REGEX.test(normalizedPhone)) {
      Alert.alert(
        t('common.components.phoneNumberModal.alerts.invalidTitle'),
        t('common.components.phoneNumberModal.alerts.invalidMessage'),
      );
      return;
    }

    onConfirm({
      country: selectedCountry,
      digits: areaDigits + digits,
      normalizedPhone,
      formattedPhone,
    });
  };

  const handleClear = () => {
    if (loading) {
      return;
    }
    onConfirm({
      country: selectedCountry,
      digits: '',
      normalizedPhone: '',
      formattedPhone: '',
    });
  };

  const maxLocalDigits = getCountryLocalNumberLength(selectedCountry);
  const maxLineDigits = Math.max(0, maxLocalDigits - areaDigits.length);
  const areaLength = getCountryAreaCodeLength(selectedCountry);

  const sheetStyle = {
    transform: [
      {
        translateY: sheetAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [40, 0],
        }),
      },
    ],
    opacity: sheetAnim,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheetContainer, sheetStyle]}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Image
                source={require('../assets/icons/back_button/back_button.png')}
                style={styles.backIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <View style={styles.headerTextContainer}>
              <Text style={styles.sheetTitle}>{t('common.components.phoneNumberModal.title')}</Text>
              <Text style={styles.sheetSubtitle}>
                {t('common.components.phoneNumberModal.subtitle')}
              </Text>
            </View>
          </View>

          <View style={styles.phonePreview}>
            <Text style={styles.phonePreviewLabel}>
              {t('common.components.phoneNumberModal.previewLabel')}
            </Text>
            <Text style={styles.phonePreviewValue}>{formattedPhone}</Text>
          </View>

          <View style={styles.inputRow}>
            {areaLength > 0 && (
              <View style={styles.areaInputRow}>
                <Text style={styles.areaLabel}>
                  {t('common.components.phoneNumberModal.areaLabel')}
                </Text>
                <TextInput
                  style={styles.areaInput}
                  value={areaDigits}
                  onChangeText={handleAreaChange}
                  keyboardType="number-pad"
                  maxLength={areaLength}
                  editable={!loading}
                />
              </View>
            )}
            <PhoneDigitInput
              countryOptions={countryOptions}
              selectedCountry={selectedCountry}
              onCountryChange={handleCountryChange}
              digits={digits}
              onChangeDigits={handleDigitsChange}
              disabled={!!loading}
              maxDigitsOverride={maxLineDigits}
            />
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!normalizedPhone || !E164_REGEX.test(normalizedPhone) || loading) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!normalizedPhone || !E164_REGEX.test(normalizedPhone) || !!loading}
            >
              <Text style={styles.confirmButtonText}>
                {t('common.components.phoneNumberModal.actions.useNumber')}
              </Text>
            </TouchableOpacity>
            {(initialDigits || normalizedPhone) ? (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClear}
                disabled={!!loading}
              >
                <Text style={styles.clearButtonText}>
                  {t('common.components.phoneNumberModal.actions.clearNumber')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PhoneNumberModal;

const createStyles = (colors: any) => {
  const gold = '#D4AF37';

  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'transparent',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#00000077',
    },
    sheetContainer: {
      backgroundColor: colors.card,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      borderTopLeftRadius: 34,
      borderTopRightRadius: 34,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButton: {
      paddingVertical: 8,
      paddingRight: 8,
      paddingLeft: 4,
    },
    backButtonText: {
      fontSize: 20,
      color: colors.text,
    },
    backIcon: {
      width: 30,
      height: 30,
      tintColor: colors.text,
    },
    headerTextContainer: {
      flex: 1,
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    sheetSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    phonePreview: {
      marginTop: 4,
      gap: 2,
    },
    phonePreviewLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    phonePreviewValue: {
      fontSize: 16,
      fontWeight: '600',
      color: gold,
    },
    inputRow: {
      marginTop: 8,
    },
    areaInputRow: {
      marginBottom: 8,
    },
    areaLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    areaInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 90,
      color: colors.text,
      backgroundColor: colors.card,
    },
    actionsRow: {
      marginTop: 12,
    },
    clearButton: {
      marginTop: 8,
      alignItems: 'center',
    },
    confirmButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    clearButtonText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });
};
