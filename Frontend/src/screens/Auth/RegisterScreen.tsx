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
import { useNavigation } from '@react-navigation/native';
import { Buffer } from 'buffer';

import { useTheme } from '../../context/ThemeContext';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import registrationService from '../../services/registrationService';
import phoneAuthService from '../../services/auth/phoneAuthService';
import { RegistrationMethod, RegistrationAuthProvider } from '../../navigation/types';

// Configuración de Google
const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
  process.env.REACT_APP_GOOGLE_ANDROID_CLIENT_ID ||
  process.env.REACT_APP_GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_CLIENT_ID ||
  '';

const decodeGoogleProfile = (idToken: string) => {
  try {
    const [, payload] = idToken.split('.');
    if (!payload) {
      return {};
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    console.warn('⚠️ No se pudo decodificar el token de Google', error);
    return {};
  }
};

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Estados principales
  const [method, setMethod] = useState<RegistrationMethod>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'match' | 'mismatch'>('idle');

  // Hooks de Google
  const { getGoogleIdToken, loading: googleAuthLoading } = useGoogleAuth(GOOGLE_CLIENT_ID);

  // Métodos activos
  const isEmailMethod = method === 'email';
  const isPhoneMethod = method === 'phone';
  const isGoogleMethod = method === 'google';

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
    name.trim() !== '' && normalizedPhone.startsWith('+') && normalizedPhone.length >= 8;

  // Normalizar teléfono (solo números)
  const sanitizePhone = (value: string) => value.replace(/[^\d+]/g, '');

  const ensurePhoneFormat = (value: string) => {
    const sanitized = sanitizePhone(value);
    const formatted = sanitized.startsWith('+') ? sanitized : sanitized ? `+${sanitized}` : sanitized;
    setNormalizedPhone(formatted);
    return formatted;
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
      await registrationService.saveTemporaryData({
        name: name.trim(),
        email: email.trim(),
        phone: normalizedPhone || undefined,
        password,
        method: 'email',
        authProvider: 'email/password',
        phoneVerified: Boolean(normalizedPhone),
      });

      navigateToRoleSelection({
        name: name.trim(),
        email: email.trim(),
        phone: normalizedPhone || undefined,
        password,
        authProvider: 'email/password',
        method: 'email',
        phoneVerified: Boolean(normalizedPhone),
      });
    } catch (error: any) {
      console.error('❌ Error registro email:', error);
      Alert.alert('Error', error.message || 'No se pudo iniciar el registro');
    } finally {
      setLoading(false);
    }
  };

  // Registro con Google
  const handleRegisterWithGoogle = async () => {
    setLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      const profile = decodeGoogleProfile(idToken);

      const finalName = (profile.name as string | undefined) || name.trim();
      const finalEmail = (profile.email as string | undefined) || email.trim();
      const googlePhone = profile.phone_number as string | undefined;

      setName(finalName);
      if (finalEmail) setEmail(finalEmail);

      let verifiedPhone = googlePhone || ensurePhoneFormat(phone);

      await registrationService.saveTemporaryData({
        name: finalName,
        email: finalEmail,
        phone: verifiedPhone || undefined,
        method: 'google',
        authProvider: 'google',
        phoneVerified: Boolean(verifiedPhone),
        googleIdToken: idToken,
      });

      navigateToRoleSelection({
        name: finalName,
        email: finalEmail || undefined,
        phone: verifiedPhone || undefined,
        authProvider: 'google',
        method: 'google',
        googleIdToken: idToken,
        phoneVerified: Boolean(verifiedPhone),
      });
    } catch (error: any) {
      if (error?.message !== 'Autenticación cancelada por el usuario') {
        console.error('❌ Error registro Google:', error);
        Alert.alert('Error', error?.message || 'No se pudo continuar con Google');
      }
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
      Alert.alert('Error', 'Ingresa tu nombre y un número válido con prefijo +505.');
      return;
    }

    setLoading(true);
    try {
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
              disabled={loading || googleAuthLoading}
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
              disabled={loading || googleAuthLoading}
            >
              <Text
                style={[styles.methodButtonText, isPhoneMethod && styles.methodButtonTextActive]}
              >
                Solo teléfono
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.methodButton, isGoogleMethod && styles.methodButtonActive]}
              onPress={() => setMethod('google')}
              disabled={loading || googleAuthLoading}
            >
              <Text
                style={[styles.methodButtonText, isGoogleMethod && styles.methodButtonTextActive]}
              >
                Google
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
              editable={!loading && !googleAuthLoading}
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
              editable={!loading && !googleAuthLoading}
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
            <TextInput
              style={styles.input}
              placeholder="+505 XXXX XXXX"
              placeholderTextColor={colors.textSecondary}
              value={phone}
              onChangeText={(value) => setPhone(ensurePhoneFormat(value))}
              keyboardType="phone-pad"
              editable={!loading && !googleAuthLoading}
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
                  editable={!loading && !googleAuthLoading}
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
                  editable={!loading && !googleAuthLoading}
                />
                {passwordStatus === 'match' && (
                  <Text style={styles.successText}>✅ Las contraseñas coinciden</Text>
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
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!isPhoneFormValid || loading) && styles.buttonDisabled,
              ]}
              onPress={handleRegisterWithPhone}
              disabled={!isPhoneFormValid || loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Continuar con Teléfono</Text>
              )}
            </TouchableOpacity>
          )}

          {isGoogleMethod && (
            <GoogleSignInButton
              onPress={handleRegisterWithGoogle}
              loading={googleAuthLoading || loading}
              disabled={googleAuthLoading || loading}
              variant="register"
            />
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
    footerInfo: {
      marginTop: 8,
    },
    footerText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
