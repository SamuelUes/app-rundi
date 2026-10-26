/**
 * Phone Verification Screen
 * Pantalla para validar número telefónico via SMS
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import registrationService from '../../services/auth/registrationService';
import accountLinkingService from '../../services/auth/accountLinkingService';
import { AuthStackParamList } from '../../navigation/types';
import { formatPhoneNumber, getCountryDialOptions } from '../../utils/phoneUtils';
import alertService from '../../services/alertService';
import OtpCodeInput from '../../components/ui/OtpCodeInput';
import { useTranslation } from 'react-i18next';

type PhoneVerificationNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'PhoneVerification'
>;

type PhoneVerificationRouteProp = RouteProp<AuthStackParamList, 'PhoneVerification'>;

interface Props {
  navigation: PhoneVerificationNavigationProp;
  route: PhoneVerificationRouteProp;
}

const MAX_ATTEMPTS = 3;

const buildAuthProviderField = (providers: string[]) => {
  if (!providers.length) {
    return 'desconocido';
  }
  return providers
    .map((provider) => {
      if (provider === 'google.com') return 'google';
      if (provider === 'password') return 'email/password';
      if (provider === 'phone') return 'phone';
      return provider;
    })
    .join('+');
};

export default function PhoneVerificationScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const {
    name,
    email,
    phone,
    password,
    method,
    authProvider,
    googleIdToken,
    role,
    emailVerified,
    context,
  } = route.params;

  const verificationContext: 'register_phone' | 'add_phone' | string =
    context ?? 'register_phone';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const [displayPhone, setDisplayPhone] = useState<string>(phone);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  useEffect(() => {
    try {
      const options = getCountryDialOptions();
      const match = options.find((option) => phone.startsWith(option.dialCode));
      if (match) {
        const formatted = formatPhoneNumber(phone, match.dialCode);
        setDisplayPhone(formatted);
      } else {
        setDisplayPhone(phone);
      }
    } catch {
      setDisplayPhone(phone);
    }
  }, [phone]);

  const handleVerifySuccess = async () => {
    try {
      await registrationService.saveTemporaryData({
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        role,
        phoneVerified: true,
        lastStep: 'phoneVerification',
      });

      const driverScreensContext: 'register_driver' | 'register_upgrade_driver' =
        verificationContext === 'register_upgrade_driver'
          ? 'register_upgrade_driver'
          : 'register_driver';

      if (role === 'driver') {
        navigation.replace('DriverData', {
          name,
          email,
          phone,
          password,
          role: 'driver',
          method,
          authProvider,
          googleIdToken,
          phoneVerified: true,
          emailVerified: Boolean(emailVerified),
          context: driverScreensContext,
        });
      } else {
        navigation.replace('RoleSelection', {
          method,
          name,
          email,
          phone,
          password,
          authProvider,
          googleIdToken,
          phoneVerified: true,
          emailVerified: Boolean(emailVerified),
        });
      }
    } catch (error: any) {
      console.error('❌ Error guardando datos verificados:', error);
      Alert.alert(
        t('authScreens.phoneVerification.alerts.saveErrorTitle'),
        error?.message || t('authScreens.phoneVerification.alerts.saveErrorMessage'),
      );
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert(
        t('authScreens.phoneVerification.alerts.codeIncompleteTitle'),
        t('authScreens.phoneVerification.alerts.codeIncompleteMessage'),
      );
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert(
        t('authScreens.phoneVerification.alerts.tooManyAttemptsTitle'),
        t('authScreens.phoneVerification.alerts.tooManyAttemptsMessage'),
      );
      return;
    }

    setLoading(true);
    try {
      if (verificationContext === 'add_phone') {
        try {
          const { phone: linkedPhone, providers } =
            await accountLinkingService.confirmPhoneLinkCode(code);

          const currentUser = await firebaseAuthService.getCurrentUser();
          const userId = currentUser?.uid;

          if (userId && linkedPhone) {
            try {
              await firebaseAuthService.logSmsVerification({
                userId,
                phoneNumber: linkedPhone,
                code,
                context: 'add_phone',
                attemptCount: attempts + 1,
              });
            } catch (logError) {
              console.error(
                '⚠️ No se pudo registrar el log de verificación SMS (add_phone):',
                logError,
              );
            }

            try {
              const authProviderLabel = buildAuthProviderField(providers || []);
              await firebaseAuthService.updateUserProfile(userId, {
                phone: linkedPhone,
                phoneVerified: true,
                authProvider: authProviderLabel,
                method: authProviderLabel,
              });
            } catch (updateError) {
              console.error('❌ Error actualizando perfil con teléfono vinculado:', updateError);
              throw updateError;
            }

            try {
              const stored = await AsyncStorage.getItem('user');
              if (stored) {
                const parsed = JSON.parse(stored);
                await AsyncStorage.setItem(
                  'user',
                  JSON.stringify({
                    ...parsed,
                    phone: linkedPhone,
                  }),
                );
              }
            } catch (cacheError) {
              console.warn(
                '⚠️ No se pudo actualizar caché local del usuario con teléfono verificado:',
                cacheError,
              );
            }
          }

          alertService.showSuccessAlert(
            t('authScreens.phoneVerification.alerts.addPhoneSuccessTitle'),
            t('authScreens.phoneVerification.alerts.addPhoneSuccessMessage'),
            {
              duration: 2000,
            },
          );

          navigation.goBack();
        } catch (error: any) {
          console.error('❌ Error vinculando teléfono a la cuenta actual:', error);
          setAttempts((prev) => prev + 1);
          Alert.alert(
            t('authScreens.phoneVerification.alerts.addPhoneErrorTitle'),
            error?.message ||
              t('authScreens.phoneVerification.alerts.addPhoneErrorMessage'),
          );
          setCode('');
        }
        return;
      }

      if (verificationContext === 'register_phone') {
        // Verificar si el número ya existe en Firebase Auth antes de continuar
        try {
          const availability = await firebaseAuthService.checkUserExists({ phone });
          if (availability.phoneExists) {
            Alert.alert(
              t('authScreens.phoneVerification.alerts.phoneExistsTitle'),
              t('authScreens.phoneVerification.alerts.phoneExistsMessage'),
            );
            setLoading(false);
            return;
          }
        } catch (availabilityError) {
          console.error('⚠️ No se pudo validar disponibilidad del teléfono antes de verificar código:', availabilityError);
        }
      }

      const credential = await phoneAuthService.confirmVerificationCode(phone, code, {
        signOutAfterConfirm: true,
      });

      try {
        let logUserId = credential?.user?.uid;

        if (verificationContext === 'register_upgrade_driver') {
          try {
            const currentUser = await firebaseAuthService.getCurrentUser();
            if (currentUser?.uid) {
              logUserId = currentUser.uid;
            }
          } catch (currentUserError) {
            console.warn(
              '⚠️ No se pudo obtener usuario actual para log de verificación SMS (upgrade):',
              currentUserError,
            );
          }
        }

        if (logUserId) {
          await firebaseAuthService.logSmsVerification({
            userId: logUserId,
            phoneNumber: phone,
            code,
            context: verificationContext || 'register_phone',
            attemptCount: attempts + 1,
          });
        }
      } catch (logError) {
        console.error('⚠️ No se pudo registrar el log de verificación SMS (registro):', logError);
      }

      alertService.showSuccessAlert(
        t('authScreens.phoneVerification.alerts.verificationSuccessTitle'),
        t('authScreens.phoneVerification.alerts.verificationSuccessMessage'),
        {
        duration: 2000,
      });
      await handleVerifySuccess();
    } catch (error: any) {
      console.error('❌ Error verificando código:', error);
      setAttempts((prev) => prev + 1);
      Alert.alert(
        t('authScreens.phoneVerification.alerts.verificationErrorTitle'),
        error?.message ||
          t('authScreens.phoneVerification.alerts.verificationErrorMessage'),
      );
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    try {
      if (verificationContext === 'add_phone') {
        await accountLinkingService.sendPhoneLinkCode(phone);
      } else {
        await phoneAuthService.sendVerificationCode(phone);
      }

      Alert.alert(
        t('authScreens.phoneVerification.alerts.resendSuccessTitle'),
        t('authScreens.phoneVerification.alerts.resendSuccessMessage', { phone: displayPhone }),
      );
      setTimeLeft(60);
      setCode('');
      setAttempts(0);
    } catch (error: any) {
      console.error('❌ Error reenviando código:', error);
      Alert.alert(
        t('authScreens.phoneVerification.alerts.resendErrorTitle'),
        error?.message || t('authScreens.phoneVerification.alerts.resendErrorMessage'),
      );
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
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
              <Text style={styles.title}>{t('authScreens.phoneVerification.title')}</Text>
              <Text style={styles.subtitle}>
                {verificationContext === 'add_phone'
                  ? t('authScreens.phoneVerification.subtitles.addPhone')
                  : t('authScreens.phoneVerification.subtitles.register')}
              </Text>
              <Text style={styles.phoneNumber}>{displayPhone}</Text>
            </View>

            <View style={styles.codeSection}>
              <Text style={styles.label}>
                {t('authScreens.phoneVerification.codeLabel')}
              </Text>

              <OtpCodeInput
                value={code}
                onChange={setCode}
                disabled={loading}
                accessibilityLabel={t('authScreens.phoneVerification.codeLabel')}
              />
            </View>

            {attempts > 0 && (
              <View style={styles.attemptsWarning}>
                <Text style={styles.attemptsText}>
                  {t('authScreens.phoneVerification.attemptsLabel', {
                    remaining: MAX_ATTEMPTS - attempts,
                    max: MAX_ATTEMPTS,
                  })}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (loading || code.length !== 6) && styles.buttonDisabled,
              ]}
              onPress={handleVerifyCode}
              disabled={loading || code.length !== 6}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || code.length !== 6 }}
            >
              {loading ? (
                <LoadingIcon size={24} color="#241B0B" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t('authScreens.phoneVerification.verifyButton')}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendSection}>
              <Text style={styles.resendText}>
                {t('authScreens.phoneVerification.resend.question')}
              </Text>
              {timeLeft > 0 ? (
                <Text style={styles.resendTimer}>
                  {t('authScreens.phoneVerification.resend.timer', { seconds: timeLeft })}
                </Text>
              ) : (
                <TouchableOpacity
                  style={styles.resendAction}
                  onPress={handleResendCode}
                  disabled={resendLoading}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: resendLoading }}
                >
                  {resendLoading ? (
                    <LoadingIcon size={20} color={colors.primary} />
                  ) : (
                    <Text style={styles.resendButton}>
                      {t('authScreens.phoneVerification.resend.button')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>
                {t('authScreens.phoneVerification.info.title')}
              </Text>
              <Text style={styles.infoText}>
                {t('authScreens.phoneVerification.info.codeValidity')}
              </Text>
              <Text style={styles.infoText}>
                {t('authScreens.phoneVerification.info.attempts', { max: MAX_ATTEMPTS })}
              </Text>
              <Text style={styles.infoText}>
                {t('authScreens.phoneVerification.info.checkNumber')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
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
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    content: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
    },
    backButton: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      top: -30,
      gap: 8,
      marginBottom: 20,
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
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 14,
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
