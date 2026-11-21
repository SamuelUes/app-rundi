/**
 * Phone Verification Login Screen
 * Pantalla para validar número telefónico via SMS durante login
 * Reutiliza la lógica de PhoneVerificationScreen pero para login en lugar de registro
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  getCountryLocalNumberLength,
  extractLocalNumber,
} from '../../utils/format/phoneUtils';
import alertService from '../../services/notification/alertService';
import PhoneField from '../../components/ui/PhoneField';
import PhoneCodeForm from '../../components/auth/PhoneCodeForm';
import { useTranslation } from 'react-i18next';

export default function PhoneVerificationLoginScreen({ navigation, route }: any) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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
  const [editingPhone, setEditingPhone] = useState(false);
  const MAX_ATTEMPTS = 3;

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
      if (!normalizedPhone) {
        throw new Error('NUMBER_INVALID');
      }

      const verificationId = phoneAuthService.getVerificationId(normalizedPhone);
      if (!verificationId) throw new Error('NO_ACTIVE_VERIFICATION');

      const firebaseUser = await firebaseAuthService.signInWithPhoneVerification(
        verificationId,
        code,
      );
      phoneAuthService.clearVerification(normalizedPhone);

      if (!firebaseUser) {
        throw new Error('USER_NOT_FOUND');
      }

      const idToken = await firebaseUser.getIdToken();

      try {
        await firebaseAuthService.getUserProfile(firebaseUser.uid);
      } catch (profileError: any) {
        if (profileError?.code !== 'PROFILE_NOT_FOUND') throw profileError;

        Alert.alert(
          t('authScreens.login.accountNotFound.title'),
          t('authScreens.login.accountNotFound.phoneMessage'),
          [
            {
              text: t('authScreens.login.accountNotFound.cancel'),
              style: 'cancel',
            },
            {
              text: t('authScreens.login.accountNotFound.confirm'),
              onPress: () =>
                navigation.navigate('RegisterNew', {
                  phone: normalizedPhone,
                  phoneVerified: true,
                }),
            },
          ],
        );
        return;
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
        ['ACCOUNT_DISABLED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_DELETED'].includes(rawCode) ||
        ['ACCOUNT_DISABLED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_DELETED'].includes(rawMessage)
      ) {
        await firebaseAuthService.logout().catch(() => undefined);
        Alert.alert(
          t('authScreens.phoneVerificationLogin.alerts.verificationErrorTitle'),
          'Esta cuenta ya no puede iniciar sesión.',
        );
        setCode('');
        return;
      }

      if (
        rawCode === 'SESSION_ACTIVE_ELSEWHERE' ||
        (typeof rawMessage === 'string' && rawMessage.includes('SESSION_ACTIVE_ELSEWHERE'))
      ) {
        alertService.showSessionActiveAlert(
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
          <Animated.View
            entering={FadeInDown.duration(740).reduceMotion(ReduceMotion.System)}
            style={styles.card}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.back')}
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
              <Text style={styles.backButtonTextLabel}>{t('common.actions.back')}</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.title}>{t('authScreens.phoneVerificationLogin.title')}</Text>
              <Text style={styles.subtitle}>
                {t('authScreens.phoneVerificationLogin.subtitle')}
              </Text>
              <Animated.View
                entering={FadeIn.delay(160).duration(680).reduceMotion(ReduceMotion.System)}
                style={styles.headerAccent}
              />
              <Text style={styles.phoneNumber}>{displayPhone}</Text>
              <TouchableOpacity
                style={styles.editToggle}
                onPress={() => setEditingPhone((prev) => !prev)}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ expanded: editingPhone }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={editingPhone ? 'chevron-up' : 'pencil-outline'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.editToggleText}>
                  {t('authScreens.phoneVerificationLogin.editLabel')}
                </Text>
              </TouchableOpacity>
            </View>

            {editingPhone && (
              <View style={styles.phoneEditSection}>
                <PhoneField
                  selectedCountry={selectedCountry}
                  digits={phoneDigits}
                  onChangeDigits={handlePhoneDigitsChange}
                  disabled={loading}
                  accessibilityLabel={t('authScreens.phoneVerificationLogin.editLabel')}
                />
                <Text style={styles.phoneFormatHint}>
                  {t('authScreens.phoneVerificationLogin.formatHint', {
                    dialCode: selectedCountry.dialCode,
                  })}
                </Text>
              </View>
            )}

            <PhoneCodeForm
              code={code}
              onChangeCode={setCode}
              onVerify={handleVerifyCode}
              onResend={handleResendCode}
              loading={loading}
              resendLoading={resendLoading}
              timeLeft={timeLeft}
              attempts={attempts}
              maxAttempts={MAX_ATTEMPTS}
              primaryColor={colors.primary}
              styles={styles}
              translationKey="phoneVerificationLogin"
            />

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
          </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 20,
    },
    card: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      borderRadius: 28,
      backgroundColor: colors.card,
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 32,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.24 : 0.14,
      shadowRadius: 12,
      elevation: 6,
    },
    backButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      marginLeft: -8,
      marginBottom: 8,
    },
    backButtonTextLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    header: {
      alignItems: 'center',
      marginBottom: 28,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    headerAccent: {
      width: 32,
      height: 3,
      borderRadius: 3,
      backgroundColor: colors.primary,
      marginTop: 18,
      marginBottom: 14,
      opacity: 0.7,
    },
    phoneNumber: {
      minHeight: 40,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.surface,
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
      textAlign: 'center',
      overflow: 'hidden',
    },
    editToggle: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 6,
      paddingHorizontal: 8,
    },
    editToggleText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    phoneEditSection: {
      marginBottom: 20,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 12,
      gap: 8,
    },
    phoneFormatHint: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    codeSection: {
      width: '100%',
      gap: 12,
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    attemptsWarning: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.error + '40',
      backgroundColor: colors.error + '10',
      padding: 12,
      marginBottom: 16,
    },
    attemptsText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.error,
      fontWeight: '600',
      textAlign: 'center',
    },
    primaryButton: {
      minHeight: 56,
      width: '100%',
      paddingHorizontal: 20,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#241B0B',
      fontSize: 16,
      fontWeight: '700',
    },
    buttonDisabled: {
      opacity: 0.45,
    },
    resendSection: {
      minHeight: 44,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      columnGap: 8,
      rowGap: 4,
      marginTop: 16,
      marginBottom: 20,
    },
    resendText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    resendTimer: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    resendAction: {
      minHeight: 44,
      paddingHorizontal: 6,
      justifyContent: 'center',
    },
    resendButton: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '700',
    },
    infoBox: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 6,
    },
    infoTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    infoText: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
  });
