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
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  getCountryLocalNumberLength,
  extractLocalNumber,
} from '../../utils/phoneUtils';
import alertService from '../../services/alertService';
import PhoneDigitInput from '../../components/ui/PhoneDigitInput';
import { useTranslation } from 'react-i18next';

export default function PhoneVerificationLoginScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { loginWithPhoneAndSMS } = useAuth();
  const { t } = useTranslation();
  
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

  const localLength = getCountryLocalNumberLength(defaultCountry);
  const initialLocalDigits = phoneFromRoute
    ? extractLocalNumber(phoneFromRoute, defaultCountry.dialCode).slice(0, localLength)
    : '';

  const [phoneDigits, setPhoneDigits] = useState(initialLocalDigits);

  const [code, setCode] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState<string>(
    initialLocalDigits
      ? normalizePhoneNumber(initialLocalDigits, defaultCountry.dialCode)
      : phoneFromRoute,
  );
  const [displayPhone, setDisplayPhone] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

  const hiddenInputRef = useRef<TextInput>(null);

  const handlePhoneDigitsChange = (localDigits: string) => {
    setPhoneDigits(localDigits);

    const normalized = normalizePhoneNumber(localDigits, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    const formatted = normalized
      ? formatPhoneNumber(normalized, selectedCountry.dialCode)
      : formatPhoneNumber('', selectedCountry.dialCode);

    const nextDisplay = formatted || `${selectedCountry.dialCode} `;
    setDisplayPhone(nextDisplay);
  };

  useEffect(() => {
    const basePhone = normalizedPhone || phoneFromRoute || '';
    let initialDisplay = displayPhoneFromRoute;

    if (!initialDisplay && basePhone) {
      initialDisplay = formatPhoneNumber(basePhone, selectedCountry.dialCode);
    }

    if (!initialDisplay) {
      initialDisplay = `${selectedCountry.dialCode} `;
    }

    setDisplayPhone(initialDisplay);
    const timeout = setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 300);

    return () => clearTimeout(timeout);
  }, [normalizedPhone, phoneFromRoute, displayPhoneFromRoute, selectedCountry.dialCode]);

  // Temporizador para reenviar código
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert(
        t('authScreens.phoneVerificationLogin.alerts.codeIncompleteTitle'),
        t('authScreens.phoneVerificationLogin.alerts.codeIncompleteMessage'),
      );
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert(
        t('authScreens.phoneVerificationLogin.alerts.tooManyAttemptsTitle'),
        t('authScreens.phoneVerificationLogin.alerts.tooManyAttemptsMessage'),
      );
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Verificando código para login:', code);

      if (!normalizedPhone) {
        throw new Error('NUMBER_INVALID');
      }

      const credential = await phoneAuthService.confirmVerificationCode(normalizedPhone, code, {
        signOutAfterConfirm: false,
      });
      const firebaseUser = credential.user;

      if (!firebaseUser) {
        throw new Error('USER_NOT_FOUND');
      }

      const idToken = await firebaseUser.getIdToken();

      try {
        await firebaseAuthService.ensureWebSessionFromIdToken(idToken);
      } catch (sessionError) {
        console.warn('⚠️ No se pudo sincronizar sesión web antes de leer perfil:', sessionError);
      }

      try {
        await firebaseAuthService.logSmsVerification({
          userId: firebaseUser.uid,
          phoneNumber: normalizedPhone,
          code,
          context: 'login_phone',
          attemptCount: attempts + 1,
        });
      } catch (logError) {
        console.error('⚠️ No se pudo registrar el log de verificación SMS (login):', logError);
      }

      await loginWithPhoneAndSMS(
        {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'Usuario',
          phone: firebaseUser.phoneNumber || normalizedPhone,
        },
        idToken
      );

      alertService.showSuccessAlert(
        t('authScreens.phoneVerificationLogin.alerts.successTitle'),
        t('authScreens.phoneVerificationLogin.alerts.successMessage'),
        {
        duration: 2000,
      });
    } catch (error: any) {
      console.error('Error verificando código:', error);
      setAttempts((prev) => prev + 1);

      const rawMessage: string = error?.message || '';
      const rawCode: string = (error as any)?.code || '';

      if (
        rawCode === 'SESSION_ACTIVE_ELSEWHERE' ||
        (typeof rawMessage === 'string' && rawMessage.includes('SESSION_ACTIVE_ELSEWHERE'))
      ) {
        alertService.showErrorAlert(
          t('authScreens.phoneVerificationLogin.alerts.sessionActiveMessage'),
        );
        setCode('');
        return;
      }

      let translatedMessage = t('authScreens.phoneVerificationLogin.alerts.genericError');
      if (rawMessage === 'NUMBER_INVALID') {
        translatedMessage = t('authScreens.phoneVerificationLogin.alerts.invalidPhoneMessage');
      } else if (
        typeof rawMessage === 'string' &&
        rawMessage.includes('Missing or insufficient permissions')
      ) {
        translatedMessage = t('authScreens.phoneVerificationLogin.alerts.permissionsError');
      }

      Alert.alert(
        t('authScreens.phoneVerificationLogin.alerts.verificationErrorTitle'),
        translatedMessage,
      );
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
        Alert.alert(
          t('authScreens.phoneVerificationLogin.alerts.resendErrorTitle'),
          t('authScreens.phoneVerificationLogin.alerts.invalidPhoneMessage'),
        );
        return;
      }

      console.log('📱 Reenviando código a:', targetPhone);

      await phoneAuthService.sendVerificationCode(targetPhone);

      const newDisplay = formatPhoneNumber(targetPhone, selectedCountry.dialCode) || targetPhone;
      setDisplayPhone(newDisplay);

      Alert.alert(
        t('authScreens.phoneVerificationLogin.alerts.resendSuccessTitle'),
        t('authScreens.phoneVerificationLogin.alerts.resendSuccessMessage', { phone: newDisplay }),
      );
      setTimeLeft(60);
      setCode('');
      setAttempts(0);
    } catch (error: any) {
      console.error('Error reenviando código:', error);
      Alert.alert(
        t('authScreens.phoneVerificationLogin.alerts.resendErrorTitle'),
        error.message || t('authScreens.phoneVerificationLogin.alerts.resendErrorMessage'),
      );
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
            <Text style={styles.title}>{t('authScreens.phoneVerificationLogin.title')}</Text>
            <Text style={styles.subtitle}>
              {t('authScreens.phoneVerificationLogin.subtitle')}
            </Text>
            <Text style={styles.phoneNumber}>{displayPhone}</Text>
          </View>

          {/* Editar Número Telefónico */}
          <View style={styles.phoneEditSection}>
            <Text style={styles.label}>
              {t('authScreens.phoneVerificationLogin.editLabel')}
            </Text>
            <PhoneDigitInput
              selectedCountry={selectedCountry}
              digits={phoneDigits}
              onChangeDigits={handlePhoneDigitsChange}
              disabled={loading}
            />
            <Text style={styles.phoneFormatHint}>
              {t('authScreens.phoneVerificationLogin.formatHint', {
                dialCode: selectedCountry.dialCode,
              })}
            </Text>
          </View>

          {/* Código Input */}
          <View style={styles.codeSection}>
            <Text style={styles.label}>
              {t('authScreens.phoneVerificationLogin.codeSectionLabel')}
            </Text>
            
            {/* Input oculto para capturar el texto */}
            <TextInput
              ref={hiddenInputRef}
              style={styles.hiddenInput}
              placeholder={t('authScreens.phoneVerificationLogin.codePlaceholder')}
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
                {t('authScreens.phoneVerificationLogin.attemptsLabel', {
                  remaining: MAX_ATTEMPTS - attempts,
                  max: MAX_ATTEMPTS,
                })}
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
              <LoadingIcon size={24} color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyButtonText}>
                {t('authScreens.phoneVerificationLogin.verifyButton')}
              </Text>
            )}
          </TouchableOpacity>

          {/* Reenviar Código */}
          <View style={styles.resendSection}>
            <Text style={styles.resendText}>
              {t('authScreens.phoneVerificationLogin.resend.question')}
            </Text>
            {timeLeft > 0 ? (
              <Text style={styles.resendTimer}>
                {t('authScreens.phoneVerificationLogin.resend.timer', { seconds: timeLeft })}
              </Text>
            ) : (
              <TouchableOpacity
                onPress={handleResendCode}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <LoadingIcon size={20} color={colors.primary} />
                ) : (
                  <Text style={styles.resendButton}>
                    {t('authScreens.phoneVerificationLogin.resend.button')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Información */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>
              {t('authScreens.phoneVerificationLogin.info.title')}
            </Text>
            <Text style={styles.infoText}>
              {t('authScreens.phoneVerificationLogin.info.codeValidity')}
            </Text>
            <Text style={styles.infoText}>
              {t('authScreens.phoneVerificationLogin.info.attempts', { max: MAX_ATTEMPTS })}
            </Text>
            <Text style={styles.infoText}>
              {t('authScreens.phoneVerificationLogin.info.checkNumber')}
            </Text>
          </View>

          {/* Botón Volver */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>
              {t('authScreens.phoneVerificationLogin.backButton')}
            </Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  codeBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  codeBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '25',
  },
  codeBoxText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
});
