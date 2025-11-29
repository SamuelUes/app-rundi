/**
 * Phone Verification Login Screen
 * Pantalla para validar número telefónico via SMS durante login
 * Reutiliza la lógica de PhoneVerificationScreen pero para login en lugar de registro
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
} from '../../utils/phoneUtils';

export default function PhoneVerificationLoginScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { loginWithPhoneAndSMS } = useAuth();
  
  // Datos del login anterior
  const phoneFromRoute = route.params?.phone || '';
  const displayPhoneFromRoute = route.params?.displayPhone || phoneFromRoute;
  const countryFromRoute: CountryDialOption | undefined = route.params?.country;

  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry =
    countryFromRoute ||
    countryOptions.find((option) => option.code === 'NI') ||
    countryOptions[0];

  const [selectedCountry] = useState<CountryDialOption>(defaultCountry);
  
  const [code, setCode] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState<string>(phoneFromRoute);
  const [displayPhone, setDisplayPhone] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>(`${defaultCountry.dialCode} `);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

  const hiddenInputRef = useRef<TextInput>(null);
  
  const handlePhoneChange = (text: string) => {
    const normalized = normalizePhoneNumber(text, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    const formatted = normalized
      ? formatPhoneNumber(normalized, selectedCountry.dialCode)
      : formatPhoneNumber(text, selectedCountry.dialCode);

    setPhoneInput(formatted || `${selectedCountry.dialCode} `);
    setDisplayPhone(formatted || `${selectedCountry.dialCode} `);
  };

  useEffect(() => {
    const basePhone = phoneFromRoute || '';
    let initialDisplay = displayPhoneFromRoute;

    if (!initialDisplay) {
      initialDisplay = formatPhoneNumber(basePhone, selectedCountry.dialCode);
    }

    if (!initialDisplay) {
      initialDisplay = `${selectedCountry.dialCode} `;
    }

    setPhoneInput(initialDisplay);
    setDisplayPhone(initialDisplay);
    setNormalizedPhone(
      basePhone || normalizePhoneNumber(initialDisplay, selectedCountry.dialCode)
    );
    const timeout = setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 300);

    return () => clearTimeout(timeout);
  }, [phoneFromRoute, displayPhoneFromRoute, selectedCountry.dialCode]);

  // Temporizador para reenviar código
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Por favor ingresa un código de 6 dígitos');
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert('Error', 'Demasiados intentos. Por favor intenta más tarde.');
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Verificando código para login:', code);

      if (!normalizedPhone) {
        throw new Error('Número telefónico inválido. Edita el número y reenvía el código.');
      }

      const credential = await phoneAuthService.confirmVerificationCode(normalizedPhone, code, {
        signOutAfterConfirm: true,
      });
      const firebaseUser = credential.user;

      if (!firebaseUser) {
        throw new Error('No se pudo obtener el usuario de Firebase');
      }

      const userProfile = await firebaseAuthService.getUserProfile(firebaseUser.uid);
      const idToken = await firebaseUser.getIdToken();

      await loginWithPhoneAndSMS(
        {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: userProfile?.name || firebaseUser.displayName || 'Usuario',
          phone: firebaseUser.phoneNumber || normalizedPhone,
          role: userProfile?.role || 'client',
        },
        idToken
      );

      Alert.alert('✅ Éxito', 'Sesión iniciada correctamente');
    } catch (error: any) {
      console.error('Error verificando código:', error);
      setAttempts(attempts + 1);
      Alert.alert('Error', error.message || 'Error al verificar código');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    try {
      const targetPhone = normalizedPhone || phoneFromRoute;

      if (!targetPhone) {
        Alert.alert('Error', 'Ingresa un número válido antes de reenviar el código.');
        return;
      }

      console.log('📱 Reenviando código a:', targetPhone);

      await phoneAuthService.sendVerificationCode(targetPhone);

      const newDisplay = formatPhoneNumber(targetPhone, selectedCountry.dialCode) || targetPhone;
      setDisplayPhone(newDisplay);

      Alert.alert('✅ Código reenviado', `Se envió un nuevo código a ${newDisplay}`);
      setTimeLeft(60);
      setCode('');
      setAttempts(0);
    } catch (error: any) {
      console.error('Error reenviando código:', error);
      Alert.alert('Error', error.message || 'Error al reenviar código');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Verificar Número</Text>
            <Text style={styles.subtitle}>
              Hemos enviado un código SMS a:
            </Text>
            <Text style={styles.phoneNumber}>{displayPhone}</Text>
          </View>

          {/* Editar Número Telefónico */}
          <View style={styles.phoneEditSection}>
            <Text style={styles.label}>Editar número (opcional)</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder={`${selectedCountry.dialCode} 12345678`}
              placeholderTextColor={colors.textSecondary}
              value={phoneInput}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              editable={!loading}
              maxLength={17} // +505 XXXX XXXX = 17 caracteres
            />
            <Text style={styles.phoneFormatHint}>Formato: {selectedCountry.dialCode} XXXX XXXX</Text>
          </View>

          {/* Código Input */}
          <View style={styles.codeSection}>
            <Text style={styles.label}>Código de Verificación (6 dígitos)</Text>
            
            {/* Input oculto para capturar el texto */}
            <TextInput
              ref={hiddenInputRef}
              style={styles.hiddenInput}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              value={code}
              onChangeText={(text) => {
                // Solo permitir números
                const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
                setCode(numericText);
              }}
              keyboardType="numeric"
              maxLength={6}
              editable={!loading}
              autoFocus
            />
            
            {/* Casillas visuales para cada dígito */}
            <TouchableWithoutFeedback onPress={() => hiddenInputRef.current?.focus()}>
              <View style={styles.codeBoxesContainer}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.codeBox,
                      code.length > index && styles.codeBoxFilled,
                    ]}
                  >
                    <Text style={styles.codeBoxText}>
                      {code[index] || ''}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableWithoutFeedback>
          </View>

          {/* Intentos restantes */}
          {attempts > 0 && (
            <View style={styles.attemptsWarning}>
              <Text style={styles.attemptsText}>
                Intentos restantes: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}
              </Text>
            </View>
          )}

          {/* Botón Verificar */}
          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyButtonText}>Verificar Código</Text>
            )}
          </TouchableOpacity>

          {/* Reenviar Código */}
          <View style={styles.resendSection}>
            <Text style={styles.resendText}>¿No recibiste el código?</Text>
            {timeLeft > 0 ? (
              <Text style={styles.resendTimer}>
                Reenviar en {timeLeft}s
              </Text>
            ) : (
              <TouchableOpacity
                onPress={handleResendCode}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.resendButton}>Reenviar Código</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Información */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>💡 Información</Text>
            <Text style={styles.infoText}>
              • El código es válido por 10 minutos
            </Text>
            <Text style={styles.infoText}>
              • Tienes {MAX_ATTEMPTS} intentos para ingresar el código
            </Text>
            <Text style={styles.infoText}>
              • Verifica que el número sea correcto
            </Text>
          </View>

          {/* Botón Volver */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Volver</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
  },
  codeSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attemptsWarning: {
    backgroundColor: colors.error + '20',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  attemptsText: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '600',
  },
  verifyButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resendSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  resendText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  resendTimer: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  resendButton: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 18,
  },
  backButton: {
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  phoneEditSection: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phoneInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    marginVertical: 10,
  },
  phoneFormatHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: 60,
    opacity: 0,
    top: 0,
    left: 0,
  },
  codeBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  codeBox: {
    width: '15%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  codeBoxText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
});
