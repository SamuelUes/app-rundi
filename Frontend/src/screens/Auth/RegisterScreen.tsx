/**
 * Register Screen
 * Paso 1 del flujo de registro. Permite elegir método (email/Google/teléfono)
 * y recopila los datos básicos antes de continuar con la verificación.
 */

import React, { useState, useMemo, useEffect } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../../context/ThemeContext';
import registrationService from '../../services/registrationService';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import { getFirebaseAuth } from '../../config/firebase';
import { RegistrationMethod, RegistrationAuthProvider } from '../../navigation/types';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  getCountryLocalNumberLength,
} from '../../utils/phoneUtils';
import PhoneNumberModal from '../../components/PhoneNumberModal';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Estados principales
  const [method, setMethod] = useState<RegistrationMethod>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry =
    countryOptions.find((option) => option.code === 'NI') ?? countryOptions[0];
  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(defaultCountry);

  const [phoneDigits, setPhoneDigits] = useState('');
  const [phone, setPhone] = useState<string>(
    formatPhoneNumber('', defaultCountry.dialCode)
  );
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'match' | 'mismatch'>('idle');

  // Métodos activos
  const isEmailMethod = method === 'email';
  const isPhoneMethod = method === 'phone';

  // Validaciones básicas
  const isEmailValid = email.includes('@') && email.includes('.');
  const isPasswordValid = password.length >= 6;
  const isConfirmFilled = confirmPassword.trim().length > 0;
  const passwordsDontMatch = isConfirmFilled && password !== confirmPassword;

  const isEmailFormValid =
    name.trim() !== '' &&
    isEmailValid &&
    isPasswordValid &&
    isConfirmFilled &&
    !passwordsDontMatch;

  useEffect(() => {
    if (!password && !confirmPassword) {
      setPasswordStatus('idle');
      return;
    }

    if (!isConfirmFilled) {
      setPasswordStatus('idle');
      return;
    }

    if (isPasswordValid && password === confirmPassword) {
      setPasswordStatus('match');
    } else {
      setPasswordStatus('mismatch');
    }
  }, [password, confirmPassword, isConfirmFilled, isPasswordValid]);

  const isPhoneFormValid =
    name.trim() !== '' && (normalizedPhone ? /^\+\d{6,15}$/.test(normalizedPhone) : false);

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
    setPhone(
      newNormalized
        ? formatPhoneNumber(newNormalized, nextCountry.dialCode)
        : formatPhoneNumber('', nextCountry.dialCode)
    );
  };

  const openPhoneModal = () => {
    setPhoneModalVisible(true);
  };

  const handlePhoneModalClose = () => {
    setPhoneModalVisible(false);
  };

  const handlePhoneModalConfirm = ({
    country,
    digits,
    normalizedPhone: normalized,
    formattedPhone: formatted,
  }: {
    country: CountryDialOption;
    digits: string;
    normalizedPhone: string;
    formattedPhone: string;
  }) => {
    setSelectedCountry(country);
    setPhoneDigits(digits);
    setNormalizedPhone(normalized);
    setPhone(formatted || `${country.dialCode} `);
    setPhoneModalVisible(false);
  };

  const handlePhoneChange = (localDigits: string) => {
    setPhoneDigits(localDigits);

    const normalized = normalizePhoneNumber(localDigits, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    const formatted = normalized
      ? formatPhoneNumber(normalized, selectedCountry.dialCode)
      : formatPhoneNumber('', selectedCountry.dialCode);

    setPhone(formatted || `${selectedCountry.dialCode} `);
  };

  // Navegación
  const navigateToRoleSelection = ({
    name,
    email,
    phone,
    password,
    method,
    authProvider,
    googleIdToken,
    phoneVerified = false,
  }: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified?: boolean;
  }) => {
    navigation.navigate('RoleSelection', {
      name,
      email,
      phone,
      password,
      method,
      authProvider,
      googleIdToken,
      phoneVerified,
    });
  };

  // Registro con email
  const handleRegisterWithEmail = async () => {
    if (!isEmailMethod) {
      setMethod('email');
      return;
    }

    if (!isEmailFormValid) {
      if (!isConfirmFilled) {
        Alert.alert('Error', 'Confirma tu contraseña para continuar.');
        return;
      }
      if (passwordsDontMatch) {
        Alert.alert('Error', 'Las contraseñas deben coincidir.');
        return;
      }
      Alert.alert('Error', 'Completa nombre, email y una contraseña válida.');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const phoneForCheck = normalizedPhone || undefined;

      const { emailExists, phoneExists } = await firebaseAuthService.checkUserExists({
        email: normalizedEmail,
        phone: phoneForCheck,
      });

      if (emailExists) {
        Alert.alert('Error', 'Ya existe una cuenta registrada con este correo electrónico.');
        return;
      }

      if (phoneExists) {
        Alert.alert('Error', 'Ya existe una cuenta registrada con este número telefónico.');
        return;
      }

      await registrationService.saveTemporaryData({
        name: name.trim(),
        email: normalizedEmail,
        phone: phoneForCheck,
        password,
        method: 'email',
        authProvider: 'email/password',
        phoneVerified: false,
      });

      navigateToRoleSelection({
        name: name.trim(),
        email: normalizedEmail,
        phone: phoneForCheck,
        password,
        authProvider: 'email/password',
        method: 'email',
        phoneVerified: false,
      });
    } catch (error: any) {
      console.error('❌ Error registro email:', error);
      Alert.alert('Error', error.message || 'No se pudo iniciar el registro');
    } finally {
      setLoading(false);
    }
  };

  // Registro con teléfono
  const handleRegisterWithPhone = async () => {
    if (!isPhoneMethod) {
      setMethod('phone');
      return;
    }

    if (!isPhoneFormValid) {
      Alert.alert(
        'Error',
        'Ingresa tu nombre y un número telefónico válido en formato internacional (+Código país).'
      );
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase() || undefined;

      const { emailExists, phoneExists } = await firebaseAuthService.checkUserExists({
        email: normalizedEmail,
        phone: normalizedPhone,
      });

      if (emailExists) {
        Alert.alert('Error', 'Ya existe una cuenta registrada con este correo electrónico.');
        return;
      }

      // ✅ Caso especial: el usuario ya está autenticado y tiene una verificación previa de registro
      // en Supabase para este número → saltar SMS y pasar directo a selección de rol.
      let handledByVerifiedLog = false;
      try {
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;

        if (firebaseUser && firebaseUser.phoneNumber === normalizedPhone) {
          const hasVerified = await firebaseAuthService.hasVerifiedRegisterPhoneLog(normalizedPhone);

          if (hasVerified) {
            console.log(
              '✅ [Register] Teléfono ya verificado previamente (Supabase); saltando a RoleSelection',
            );

            await registrationService.saveTemporaryData({
              name: name.trim(),
              email: normalizedEmail,
              phone: normalizedPhone,
              method: 'phone',
              authProvider: 'phone',
              phoneVerified: true,
            });

            navigation.navigate('RoleSelection', {
              name: name.trim(),
              email: normalizedEmail,
              phone: normalizedPhone,
              password: undefined,
              method: 'phone',
              authProvider: 'phone',
              googleIdToken: undefined,
              phoneVerified: true,
            });
            handledByVerifiedLog = true;
          }
        }
      } catch (checkError) {
        console.warn(
          '⚠️ [Register] No se pudo verificar verificación previa de teléfono; continuando con SMS:',
          checkError,
        );
      }

      if (phoneExists && !handledByVerifiedLog) {
        Alert.alert('Error', 'Ya existe una cuenta registrada con este número telefónico.');
        return;
      }

      console.log('📱 [Register] Enviando código SMS a:', normalizedPhone);
      await phoneAuthService.sendVerificationCode(normalizedPhone);

      await registrationService.saveTemporaryData({
        name: name.trim(),
        phone: normalizedPhone,
        method: 'phone',
        authProvider: 'phone',
        phoneVerified: false,
      });

      navigation.navigate('PhoneVerification', {
        name: name.trim(),
        phone: normalizedPhone,
        method: 'phone',
        authProvider: 'phone',
        phoneVerified: false,
      });
    } catch (error: any) {
      console.error('❌ Error registro teléfono:', error);
      Alert.alert('Error', error.message || 'No se pudo continuar con el registro');
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
          <Text style={styles.title}>Crear Cuenta</Text>
          <Text style={styles.subtitle}>Selecciona cómo quieres registrarte</Text>

          {/* Selector de método */}
          <View style={styles.methodSwitcher}>
            <TouchableOpacity
              style={[styles.methodButton, isEmailMethod && styles.methodButtonActive]}
              onPress={() => setMethod('email')}
              disabled={loading}
            >
              <Text
                style={[styles.methodButtonText, isEmailMethod && styles.methodButtonTextActive]}
              >
                Email y contraseña
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodButton, isPhoneMethod && styles.methodButtonActive]}
              onPress={() => setMethod('phone')}
              disabled={loading}
            >
              <Text
                style={[styles.methodButtonText, isPhoneMethod && styles.methodButtonTextActive]}
              >
                Solo teléfono
              </Text>
            </TouchableOpacity>

          </View>

          {/* Campos base */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nombre completo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              editable={!loading}
            />
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email {isEmailMethod ? '*' : ''}</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading}
            />
            <Text style={styles.helperText}>
              {isEmailMethod
                ? 'Usaremos este correo para tu cuenta.'
                : 'Opcional, puedes agregarlo ahora o más tarde.'}
            </Text>
          </View>

          {/* Teléfono */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Teléfono {isPhoneMethod ? '*' : ''}</Text>

            <TouchableOpacity
              style={styles.phoneSummary}
              onPress={openPhoneModal}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={styles.phoneSummaryFlagDial}>
                <Text style={styles.phoneSummaryDial}>{selectedCountry.dialCode}</Text>
              </View>
              <View style={styles.phoneSummaryValueContainer}>
                <Text
                  style={
                    normalizedPhone
                      ? styles.phoneSummaryValue
                      : styles.phoneSummaryPlaceholder
                  }
                  numberOfLines={1}
                >
                  {normalizedPhone ? phone : 'Toca para agregar tu número'}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {isPhoneMethod
                ? 'Es necesario para que podamos contactarte.'
                : 'Opcional, podrás agregarlo o editarlo después.'}
            </Text>
          </View>

          <PhoneNumberModal
            visible={phoneModalVisible}
            onClose={handlePhoneModalClose}
            onConfirm={handlePhoneModalConfirm}
            countryOptions={countryOptions}
            initialCountry={selectedCountry}
            initialDigits={phoneDigits}
            loading={loading}
          />

          {/* Contraseñas */}
          {isEmailMethod && (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Contraseña *</Text>
                <TextInput
                  style={[
                    styles.input,
                    passwordStatus === 'match' && styles.inputSuccess,
                    passwordStatus === 'mismatch' && styles.inputError,
                  ]}
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirmar contraseña *</Text>
                <TextInput
                  style={[
                    styles.input,
                    passwordStatus === 'match' && styles.inputSuccess,
                    passwordStatus === 'mismatch' && styles.inputError,
                  ]}
                  placeholder="Repite tu contraseña"
                  placeholderTextColor={colors.textSecondary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  editable={!loading}
                />
                {passwordStatus === 'match' && (
                  <Text style={styles.successText}>Las contraseñas coinciden</Text>
                )}
                {passwordStatus === 'mismatch' && (
                  <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!isEmailFormValid || loading) && styles.buttonDisabled,
                ]}
                onPress={handleRegisterWithEmail}
                disabled={!isEmailFormValid || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Continuar con Email</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {isPhoneMethod && (
            <View style={styles.phoneActionsRow}>
              <TouchableOpacity
                style={[
                  styles.phoneNextButton,
                  (!isPhoneFormValid || loading) && styles.buttonDisabled,
                ]}
                onPress={handleRegisterWithPhone}
                disabled={!isPhoneFormValid || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.phoneNextIcon}>Siguiente</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>
              Paso 1 de 4 · Verificaremos tu número antes de elegir el rol.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ==================== ESTILOS ====================
const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 2,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingVertical: 32,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 28,
      paddingVertical: 32,
      paddingHorizontal: 24,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: 'rgba(207, 152, 48, 1)',
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    methodSwitcher: {
      flexDirection: 'row',
      alignSelf: 'center',
      backgroundColor: colors.background,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
      gap: 6,
      marginBottom: 8,
    },
    methodButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    methodButtonActive: {
      backgroundColor: 'rgba(241, 200, 123, 1), 1)' + '20',
    },
    methodButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    methodButtonTextActive: {
      color: 'rgba(172, 127, 44, 1), 1)',
    },
    fieldGroup: {
      gap: -25,
      marginBottom: 2,
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
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    inputSuccess: {
      borderColor: colors.success,
      shadowColor: colors.success,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    helperText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    phoneSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      gap: 6,
    },
    phoneSummaryFlagDial: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    phoneSummaryDial: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    phoneSummaryValueContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    phoneSummaryValue: {
      fontSize: 13,
      color: colors.text,
    },
    phoneSummaryPlaceholder: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    inputError: {
      borderColor: colors.error,
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
    },
    successText: {
      fontSize: 12,
      color: colors.success,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 999,
      alignItems: 'center',
      marginTop: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 5,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    phoneActionsRow: {
      marginTop: 16,
      flexDirection: 'row',
      justifyContent: 'center',
    },
    phoneNextButton: {
      width: '100%',
      height: 52,
      borderRadius: 999,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 5,
    },
    phoneNextIcon: {
      fontSize: 24,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    footerInfo: {
      marginTop: 20,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
