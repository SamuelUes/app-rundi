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
  extractLocalNumber,
} from '../../utils/phoneUtils';

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

  const [phone, setPhone] = useState<string>(
    formatPhoneNumber('', defaultCountry.dialCode)
  );
  const [normalizedPhone, setNormalizedPhone] = useState('');
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

    const localDigits = extractLocalNumber(
      normalizedPhone || phone,
      selectedCountry.dialCode
    );
    const newNormalized = localDigits
      ? normalizePhoneNumber(localDigits, nextCountry.dialCode)
      : '';

    setSelectedCountry(nextCountry);
    setNormalizedPhone(newNormalized);
    setPhone(
      newNormalized
        ? formatPhoneNumber(newNormalized, nextCountry.dialCode)
        : formatPhoneNumber('', nextCountry.dialCode)
    );
  };

  const handlePhoneChange = (value: string) => {
    const normalized = normalizePhoneNumber(value, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    const formatted = normalized
      ? formatPhoneNumber(normalized, selectedCountry.dialCode)
      : formatPhoneNumber(value, selectedCountry.dialCode);

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
            <Text style={styles.label}>País y Código {isPhoneMethod ? '*' : ''}</Text>
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

            <Text style={styles.label}>Teléfono {isPhoneMethod ? '*' : ''}</Text>
            <TextInput
              style={styles.input}
              placeholder={`${selectedCountry.dialCode} 12345678`}
              placeholderTextColor={colors.textSecondary}
              value={phone}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <Text style={styles.helperText}>
              {isPhoneMethod
                ? 'Es necesario para que podamos contactarte.'
                : 'Opcional, podrás agregarlo o editarlo después.'}
            </Text>
          </View>

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
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      padding: 24,
      justifyContent: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
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
      marginBottom: 8,
    },
    methodSwitcher: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 4,
      gap: 8,
    },
    methodButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    methodButtonActive: {
      backgroundColor: colors.primary,
    },
    methodButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    methodButtonTextActive: {
      color: '#FFFFFF',
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
    phoneActionsRow: {
      marginTop: 16,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    phoneNextButton: {
      width: 320,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    phoneNextIcon: {
      fontSize: 24,
      color: '#FFFFFF',
      fontWeight: '700',
    },
    footerInfo: {
      marginTop: 8,
    },
    footerText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
