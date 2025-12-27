/**
 * Google Phone Screen
 * Captura número telefónico tras autenticación con Google antes de verificar vía SMS
 */

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
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import phoneAuthService from '../../services/auth/phoneAuthService';
import registrationService from '../../services/registrationService';
import { AuthStackParamList } from '../../navigation/types';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  extractLocalNumber,
} from '../../utils/phoneUtils';

export type GooglePhoneScreenNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'GooglePhone'
>;

export type GooglePhoneScreenRouteProp = RouteProp<AuthStackParamList, 'GooglePhone'>;

interface GooglePhoneScreenProps {
  navigation: GooglePhoneScreenNavigationProp;
  route: GooglePhoneScreenRouteProp;
}

const DEFAULT_COUNTRY_CODE = 'NI';

const GooglePhoneScreen: React.FC<GooglePhoneScreenProps> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { name, email, googleIdToken, initialPhone } = route.params;

  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry =
    countryOptions.find((option) => option.code === DEFAULT_COUNTRY_CODE) ?? countryOptions[0];
  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(defaultCountry);

  const [phoneInput, setPhoneInput] = useState<string>(
    formatPhoneNumber(initialPhone || '', selectedCountry.dialCode)
  );
  const [normalizedPhone, setNormalizedPhone] = useState<string>(
    initialPhone ? normalizePhoneNumber(initialPhone, selectedCountry.dialCode) : ''
  );
  const [loading, setLoading] = useState(false);

  const handleCountryChange = (countryCode: string) => {
    const nextCountry =
      countryOptions.find((option) => option.code === countryCode) ?? countryOptions[0];
    const localDigits = extractLocalNumber(normalizedPhone || phoneInput, selectedCountry.dialCode);
    const newNormalized = localDigits ? normalizePhoneNumber(localDigits, nextCountry.dialCode) : '';

    setSelectedCountry(nextCountry);
    setNormalizedPhone(newNormalized);
    setPhoneInput(formatPhoneNumber(newNormalized, nextCountry.dialCode));
  };

  const handlePhoneChange = (text: string) => {
    const newNormalized = normalizePhoneNumber(text, selectedCountry.dialCode);
    setNormalizedPhone(newNormalized);
    setPhoneInput(newNormalized ? formatPhoneNumber(newNormalized, selectedCountry.dialCode) : `${selectedCountry.dialCode} `);
  };

  const handleContinue = async () => {
    const normalized = normalizePhoneNumber(phoneInput, selectedCountry.dialCode);

    if (!normalized || !/^\+\d{6,15}$/.test(normalized)) {
      Alert.alert('Error', 'Por favor ingresa un número telefónico válido');
      return;
    }

    setLoading(true);
    try {
      console.log('📱 Solicitando código SMS post-Google:', normalized);
      await phoneAuthService.sendVerificationCode(normalized);

      await registrationService.saveTemporaryData({
        name,
        email,
        phone: normalized,
        method: 'phone',
        authProvider: 'google',
        phoneVerified: false,
        googleIdToken,
        lastStep: 'googlePhone',
      });

      Alert.alert('✅ Código enviado', `Se envió un código a ${normalized}`);

      navigation.replace('PhoneVerification', {
        name,
        email,
        phone: normalized,
        method: 'phone',
        authProvider: 'google',
        googleIdToken,
        phoneVerified: false,
      });
    } catch (error: any) {
      console.error('Error enviando código post-Google:', error);
      Alert.alert('Error', error.message || 'No se pudo enviar el código SMS');
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
        <View style={styles.content}>
          <Text style={styles.title}>Necesitamos tu número</Text>
          <Text style={styles.subtitle}>
            Completa tu número telefónico para verificarlo y terminar el registro
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{name}</Text>

            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{email}</Text>

            <Text style={[styles.label, styles.sectionLabel]}>Teléfono</Text>

            <View style={styles.phoneRow}>
              <TextInput
                style={[styles.input, styles.countryInput]}
                value={selectedCountry.dialCode}
                editable={false}
              />
              <TextInput
                style={[styles.input, styles.phoneInput]}
                placeholder="Tu número"
                placeholderTextColor={colors.textSecondary}
                value={phoneInput.replace(selectedCountry.dialCode, '').trim()}
                onChangeText={(text) => handlePhoneChange(`${selectedCountry.dialCode} ${text}`)}
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>

            <View style={styles.countryPicker}>
              {countryOptions.map((option) => (
                <TouchableOpacity
                  key={option.code}
                  style={[
                    styles.countryOption,
                    selectedCountry.code === option.code && styles.countryOptionActive,
                  ]}
                  onPress={() => handleCountryChange(option.code)}
                  disabled={loading}
                >
                  <Text style={styles.countryOptionText}>
                    {option.name} ({option.dialCode})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.continueButtonText}>Enviar código</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
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
      flexGrow: 1,
      padding: 24,
    },
    content: {
      flex: 1,
      gap: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sectionLabel: {
      marginTop: 12,
    },
    value: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    phoneRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      color: colors.text,
      flex: 1,
    },
    countryInput: {
      flex: 0,
      minWidth: 80,
      textAlign: 'center',
      fontWeight: '600',
    },
    phoneInput: {
      flex: 1,
    },
    countryPicker: {
      marginTop: 8,
      gap: 8,
    },
    countryOption: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    countryOptionActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '15',
    },
    countryOptionText: {
      fontSize: 14,
      color: colors.text,
    },
    continueButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 10,
      alignItems: 'center',
    },
    continueButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButton: {
      marginTop: 8,
      paddingVertical: 12,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });

export default GooglePhoneScreen;
