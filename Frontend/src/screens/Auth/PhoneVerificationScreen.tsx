/**
 * Phone Verification Screen
 * Pantalla para validar número telefónico via SMS
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Image,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../context/ThemeContext';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import registrationService from '../../services/auth/registrationService';
import accountLinkingService from '../../services/auth/accountLinkingService';
import { AuthStackParamList } from '../../navigation/types';
import { formatPhoneNumber, getCountryDialOptions } from '../../utils/phoneUtils';
import alertService from '../../services/alertService';
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
  const hiddenInputRef = useRef<TextInput>(null);

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('authScreens.phoneVerification.title')}</Text>
          <Text style={styles.subtitle}>
            {verificationContext === 'add_phone'
              ? t('authScreens.phoneVerification.subtitles.addPhone')
              : t('authScreens.phoneVerification.subtitles.register')}
          </Text>
          <Text style={styles.phoneNumber}>{displayPhone}</Text>

          <View style={styles.codeSection}>
            <Text style={styles.label}>
              {t('authScreens.phoneVerification.codeLabel')}
            </Text>

            <TextInput
              ref={hiddenInputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={(text) => {
                const numeric = text.replace(/[^0-9]/g, '').slice(0, 6);
                setCode(numeric);
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder={t('authScreens.phoneVerification.codePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              editable={!loading}
            />

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
                    <Text style={styles.codeBoxText}>{code[index] || ''}</Text>
                  </View>
                ))}
              </View>
            </TouchableWithoutFeedback>
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
            style={[styles.primaryButton, (loading || code.length !== 6) && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <LoadingIcon size={24} color="#FFFFFF" />
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
              <TouchableOpacity onPress={handleResendCode} disabled={resendLoading}>
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

          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Image
              source={require('../../assets/icons/back_button/back_button.png')}
              style={styles.backIcon}
            />
            <Text style={styles.backButtonTextLabel}>
              {t('authScreens.phoneVerification.backButton')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
    },
    phoneNumber: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.primary,
    },
    codeSection: {
      marginTop: 12,
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    codeInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 24,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 8,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    attemptsWarning: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.error,
      backgroundColor: colors.error + '10',
      padding: 12,
    },
    attemptsText: {
      fontSize: 14,
      color: colors.error,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
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
    resendSection: {
      alignItems: 'center',
      gap: 8,
    },
    resendText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    resendTimer: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    resendButton: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
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
    infoBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 16,
      gap: 4,
    },
    infoTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    backButton: {
      width: 60,
      height: 50,
      borderRadius: 15,
      backgroundColor: 'rgba(231, 168, 86, 1)',
      paddingVertical: 7.5,
      paddingHorizontal: 10,
      alignSelf: 'center',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    backIcon: {
      width: 35,
      height: 35,
      tintColor: '#000000ff',
    },
    backButtonTextLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
  });
