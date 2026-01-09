import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import phoneAuthService from '../../services/auth/phoneAuthService';
import registrationService from '../../services/registrationService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import { AuthStackParamList } from '../../navigation/types';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  extractLocalNumber,
  getCountryLocalNumberLength,
} from '../../utils/phoneUtils';
import PhoneDigitInput from '../../components/PhoneDigitInput';
import { useTranslation } from 'react-i18next';

const driverPhoneFallbackTexts = {
  title: 'Your phone number',
  subtitle: 'Confirm your country code and enter your number to continue.',
  info: {
    name: 'Name',
    email: 'Email',
  },
  field: {
    label: 'Phone number',
    helper: 'We will use this number to send you an SMS verification code.',
  },
  alerts: {
    errorTitle: 'Error',
    invalidPhone: 'Enter a valid number with international prefix (e.g., +505).',
    phoneExistsTitle: 'Phone already registered',
    phoneExistsMessage:
      'This phone number is already linked to an existing account. Use a different number or log in with the account associated with this phone.',
    sendFailed: 'We could not send the SMS code. Please try again.',
  },
} as const;

 type DriverPhoneNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'DriverPhone'>;
 type DriverPhoneRouteProp = RouteProp<AuthStackParamList, 'DriverPhone'>;

 interface Props {
  navigation: DriverPhoneNavigationProp;
  route: DriverPhoneRouteProp;
 }

const DriverPhoneScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const driverPhoneTexts = t('authScreens.driverPhone', {
    returnObjects: true,
    defaultValue: driverPhoneFallbackTexts,
  }) as typeof driverPhoneFallbackTexts;

  const {
    name,
    email,
    phone: initialPhone,
    password,
    method,
    authProvider,
    googleIdToken,
    context,
  } = route.params;
  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry =
    countryOptions.find((option) => option.code === 'NI') ?? countryOptions[0];

  const detectedCountry =
    initialPhone && countryOptions.find((option) => initialPhone.startsWith(option.dialCode))
      ? (countryOptions.find((option) => initialPhone.startsWith(option.dialCode)) as CountryDialOption)
      : defaultCountry;

  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(detectedCountry);

  const initialNormalized =
    initialPhone && initialPhone.trim()
      ? normalizePhoneNumber(initialPhone, detectedCountry.dialCode)
      : '';

  const initialLocalDigits = initialNormalized
    ? extractLocalNumber(initialNormalized, detectedCountry.dialCode)
    : '';

  const initialDigitsLimited = initialLocalDigits.slice(
    0,
    getCountryLocalNumberLength(detectedCountry),
  );

  const [phoneDigits, setPhoneDigits] = useState(initialDigitsLimited);

  const [normalizedPhone, setNormalizedPhone] = useState<string>(
    initialDigitsLimited
      ? normalizePhoneNumber(initialDigitsLimited, detectedCountry.dialCode)
      : initialNormalized,
  );

  const [loading, setLoading] = useState(false);

  const handleCountryChange = (countryCode: string) => {
    const nextCountry =
      countryOptions.find((option) => option.code === countryCode) ?? countryOptions[0];

    const maxDigits = getCountryLocalNumberLength(nextCountry);
    const nextDigits = phoneDigits.slice(0, maxDigits);
    const newNormalized = nextDigits
      ? normalizePhoneNumber(nextDigits, nextCountry.dialCode)
      : '';

    setSelectedCountry(nextCountry);
    setPhoneDigits(nextDigits);
    setNormalizedPhone(newNormalized);
  };

  const handlePhoneChange = (localDigits: string) => {
    setPhoneDigits(localDigits);

    const normalized = normalizePhoneNumber(localDigits, selectedCountry.dialCode);
    setNormalizedPhone(normalized);
  };

  const isPhoneValid = normalizedPhone ? /^\+\d{6,15}$/.test(normalizedPhone) : false;

  const handleSendCode = async () => {
    if (!isPhoneValid) {
      Alert.alert(
        driverPhoneTexts.alerts.errorTitle,
        driverPhoneTexts.alerts.invalidPhone,
      );
      return;
    }

    setLoading(true);
    try {
      // Verificar si el número ya existe en Firebase Auth antes de enviar el SMS
      try {
        const availability = await firebaseAuthService.checkUserExists({ phone: normalizedPhone });
        if (availability.phoneExists) {
          Alert.alert(
            driverPhoneTexts.alerts.phoneExistsTitle,
            driverPhoneTexts.alerts.phoneExistsMessage,
          );
          setLoading(false);
          return;
        }
      } catch (availabilityError) {
        console.error(
          '⚠️ No se pudo validar disponibilidad del teléfono antes de enviar código:',
          availabilityError,
        );
      }

      await phoneAuthService.sendVerificationCode(normalizedPhone);

      await registrationService.saveTemporaryData({
        name,
        email,
        phone: normalizedPhone,
        password,
        method,
        authProvider,
        googleIdToken,
        role: 'driver',
        phoneVerified: false,
        lastStep: 'driverPhone',
      });

      navigation.navigate('PhoneVerification', {
        name,
        email,
        phone: normalizedPhone,
        password,
        method,
        authProvider,
        googleIdToken,
        role: 'driver',
        phoneVerified: false,
        context: context || 'register_phone',
      });
    } catch (error: any) {
      console.error('❌ Error enviando código para conductor:', error);
      Alert.alert(
        driverPhoneTexts.alerts.errorTitle,
        error?.message || driverPhoneTexts.alerts.sendFailed,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {driverPhoneTexts.title}
            </Text>
            <Text style={styles.subtitle}>
              {driverPhoneTexts.subtitle}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>
              {driverPhoneTexts.info.name}
            </Text>
            <Text style={styles.infoValue}>{name}</Text>
            {email ? (
              <>
                <Text style={[styles.infoLabel, { marginTop: 8 }]}>
                  {driverPhoneTexts.info.email}
                </Text>
                <Text style={styles.infoValue}>{email}</Text>
              </>
            ) : null}
          </View>

          {/* <View style={styles.fieldGroup}>
            <Text style={styles.label}>Country</Text>
            <View style={styles.countryPickerContainer}>
              <Picker
                selectedValue={selectedCountry.code}
                onValueChange={handleCountryChange}
                style={styles.countryPicker}
                itemStyle={styles.countryPickerItem}
              >
                {countryOptions.map((option) => (
                  <Picker.Item
                    key={option.code}
                    label={`${option.name} (${option.dialCode})`}
                    value={option.code}
                  />
                ))}
              </Picker>
            </View>
          </View> */}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {driverPhoneTexts.field.label}
            </Text>
            <PhoneDigitInput
              countryOptions={countryOptions}
              selectedCountry={selectedCountry}
              onCountryChange={handleCountryChange}
              digits={phoneDigits}
              onChangeDigits={handlePhoneChange}
              disabled={loading}
            />
            <Text style={styles.helperText}>
              {driverPhoneTexts.field.helper}
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Image
                source={require('../../assets/icons/back_button/back_button.png')}
                style={styles.backIcon}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nextButton, (!isPhoneValid || loading) && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={!isPhoneValid || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Image
                  source={require('../../assets/icons/continue_button/continue_button.png')}
                  style={styles.continueIcon}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 2,
      //padding: 15,
      justifyContent: 'center',
      
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 20,
    },
    header: {
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    infoBox: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: 4,
    },
    infoLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    infoValue: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '600',
    },
    fieldGroup: {
      gap: 8,
    },
    countryPickerContainer: {
      marginBottom: 8,
    },
    countryPicker: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    countryPickerItem: {
      fontSize: 14,
      color: colors.text,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 14,
      fontSize: 14,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    helperText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    primaryButton: {
      marginTop: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    actionsRow: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 60,
      height: 50,
      borderRadius: 15,
      backgroundColor: 'rgba(231, 168, 86, 1)',
      paddingVertical: 7.5,
      paddingHorizontal: 10,
    },
    backIcon: {
      width: 35,
      height: 35,
      tintColor: 'rgba(0, 0, 0, 1)',
    },
    backButtonText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    nextButton: {
      width: 60,
      height: 50,
      borderRadius: 15,
      backgroundColor: 'rgba(231, 168, 86, 1)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    continueIcon: {
      width: 35,
      height: 35,
      tintColor: '#000000ff',
    },
    nextButtonIcon: {
      fontSize: 24,
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });

export default DriverPhoneScreen;
