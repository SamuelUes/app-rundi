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
  Alert,
} from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CountryDialOption,
  normalizePhoneNumber,
  formatPhoneNumber,
  getCountryLocalNumberLength,
} from '../../utils/format/phoneUtils';
import PhoneField from '../ui/PhoneField';

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
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(initialCountry);
  const [digits, setDigits] = useState(initialDigits);
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [formattedPhone, setFormattedPhone] = useState('');

  const sheetAnim = useRef(new Animated.Value(0)).current;

  const computeForDigits = (
    country: CountryDialOption,
    fullLocalDigits: string,
  ) => {
    const maxLocal = getCountryLocalNumberLength(country);
    const numeric = (fullLocalDigits || '').replace(/\D/g, '').slice(0, maxLocal);

    const normalized = numeric
      ? normalizePhoneNumber(numeric, country.dialCode)
      : '';
    const formatted = normalized
      ? formatPhoneNumber(normalized, country.dialCode)
      : `${country.dialCode} `;

    return {
      digits: numeric,
      normalized,
      formatted,
    };
  };

  useEffect(() => {
    let country = initialCountry;
    if (!country && countryOptions.length > 0) {
      country = countryOptions[0];
    }

    const result = computeForDigits(country, initialDigits || '');

    setSelectedCountry(country);
    setDigits(result.digits);
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

    const result = computeForDigits(nextCountry, digits);

    setSelectedCountry(nextCountry);
    setDigits(result.digits);
    setNormalizedPhone(result.normalized);
    setFormattedPhone(result.formatted);
  };

  const handleDigitsChange = (nextDigits: string) => {
    const result = computeForDigits(selectedCountry, nextDigits);

    setDigits(result.digits);
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
      digits,
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
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.sheetDock}>
          <Animated.View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, 24) },
              sheetStyle,
            ]}
          >
            <View style={styles.sheetContent}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.backButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.actions.close')}
                >
                  <Ionicons name="chevron-back" size={22} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.headerTextContainer}>
                  <Text style={styles.sheetTitle}>
                    {t('common.components.phoneNumberModal.title')}
                  </Text>
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
                <PhoneField
                  countryOptions={countryOptions}
                  selectedCountry={selectedCountry}
                  onCountryChange={handleCountryChange}
                  digits={digits}
                  onChangeDigits={handleDigitsChange}
                  disabled={!!loading}
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
                  accessibilityRole="button"
                >
                  <Text style={styles.confirmButtonText}>
                    {t('common.components.phoneNumberModal.actions.useNumber')}
                  </Text>
                </TouchableOpacity>
                {initialDigits || normalizedPhone ? (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={handleClear}
                    disabled={!!loading}
                    accessibilityRole="button"
                  >
                    <Text style={styles.clearButtonText}>
                      {t('common.components.phoneNumberModal.actions.clearNumber')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default PhoneNumberModal;

const createStyles = (colors: any) => {
  const gold = colors.primary;

  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'transparent',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: '#00000077',
    },
    sheetDock: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheetContainer: {
      backgroundColor: colors.card,
      paddingHorizontal: 20,
      paddingTop: 12,
      width: '100%',
      maxHeight: '100%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    sheetContent: {
      gap: 12,
      paddingBottom: 4,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    backButton: {
      minWidth: 44,
      minHeight: 44,
      paddingRight: 8,
      paddingLeft: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backButtonText: {
      fontSize: 20,
      color: colors.text,
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
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
    },
    phonePreviewLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    phonePreviewValue: {
      fontSize: 20,
      fontWeight: '700',
      color: gold,
      letterSpacing: 0.3,
    },
    inputRow: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 12,
      gap: 12,
    },
    actionsRow: {
      gap: 8,
    },
    clearButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButton: {
      width: '100%',
      minHeight: 56,
      paddingHorizontal: 18,
      borderRadius: 18,
      backgroundColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmButtonText: {
      color: '#241B0B',
      fontSize: 16,
      fontWeight: '700',
    },
    clearButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });
};
