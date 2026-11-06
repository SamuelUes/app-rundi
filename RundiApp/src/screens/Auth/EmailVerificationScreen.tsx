import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { AuthStackParamList } from '../../navigation/types';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import registrationService from '../../services/auth/registrationService';

type EmailVerificationNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'EmailVerification'
>;
type EmailVerificationRouteProp = RouteProp<AuthStackParamList, 'EmailVerification'>;

interface Props {
  navigation: EmailVerificationNavigationProp;
  route: EmailVerificationRouteProp;
}

const ON_PRIMARY = '#241B0B';

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const accentStrong = isDark ? '#e8c47f' : '#c38d28';
  const { t } = useTranslation();

  const {
    name,
    email,
    phone,
    password,
    role,
    method,
    authProvider,
    googleIdToken,
    phoneVerified,
  } = route.params;

  const [resendLoading, setResendLoading] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const autoSendTriggeredRef = useRef(false);
  const autoVerifiedHandledRef = useRef(false);
  const pulse = useRef(new Animated.Value(0.35)).current;

  const getFirebaseErrorDetails = (error: any) => {
    const code = error?.code ? String(error.code) : 'unknown';
    const message = error?.message ? String(error.message) : '';
    return { code, message };
  };

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const sendVerificationCode = async (showSuccessAlert = true) => {
    setResendLoading(true);
    try {
      console.log('[EmailVerificationScreen] Preparando envio de correo de verificacion...', {
        authProvider,
        email,
        hasPassword: Boolean(password),
        hasGoogleIdToken: Boolean(googleIdToken),
      });

      if (authProvider === 'email/password') {
        await firebaseAuthService.ensureEmailVerificationSession(email, password || '');
      } else if (authProvider === 'google' && googleIdToken) {
        await firebaseAuthService.ensureWebSessionFromIdToken(googleIdToken);
      }

      const currentUser = await firebaseAuthService.getCurrentUser();
      const normalizedRouteEmail = (email || '').trim().toLowerCase();
      const normalizedSessionEmail = (currentUser?.email || '').trim().toLowerCase();

      if (!currentUser?.uid || !normalizedSessionEmail) {
        throw new Error('NO_AUTH_USER_EMAIL');
      }

      if (normalizedRouteEmail && normalizedSessionEmail !== normalizedRouteEmail) {
        throw new Error('SESSION_EMAIL_MISMATCH');
      }

      await firebaseAuthService.sendEmailVerificationCode();
      if (showSuccessAlert) {
        Alert.alert(
          t('authScreens.emailVerification.alerts.codeSentTitle'),
          t('authScreens.emailVerification.alerts.codeSentMessage', { email })
        );
      }
      setTimeLeft(60);
    } catch (error: any) {
      const { code: firebaseCode, message: firebaseMessage } = getFirebaseErrorDetails(error);
      console.error('[EmailVerification] Error reenviando codigo:', {
        code: firebaseCode,
        message: firebaseMessage,
        error,
      });
      Alert.alert(
        t('authScreens.emailVerification.alerts.errorTitle'),
        `${error?.message || t('authScreens.emailVerification.alerts.resendError')}\n(${firebaseCode})`
      );
      setTimeLeft(0);
    } finally {
      setResendLoading(false);
    }
  };

  const handleResendCode = async () => {
    await sendVerificationCode(true);
  };

  useEffect(() => {
    if (autoSendTriggeredRef.current) {
      return;
    }
    autoSendTriggeredRef.current = true;

    sendVerificationCode(false);
  }, []);

  const finalizeVerifiedFlow = async (userId: string, attemptCount: number) => {
    try {
      await firebaseAuthService.logEmailVerification({
        userId,
        email: (email || '').trim().toLowerCase(),
        attemptCount,
      });

      await registrationService.saveTemporaryData({
        name,
        email,
        phone,
        password,
        role,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: true,
        lastStep: 'emailVerification',
      });

      Alert.alert(
        t('authScreens.emailVerification.alerts.verifiedTitle'),
        t('authScreens.emailVerification.alerts.verifiedMessage')
      );

      navigation.replace('RoleSelection', {
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: true,
      });
    } catch (error: any) {
      const { code: firebaseCode, message: firebaseMessage } = getFirebaseErrorDetails(error);
      console.error('[EmailVerification] Error finalizando verificacion por enlace:', {
        code: firebaseCode,
        message: firebaseMessage,
        error,
      });
      Alert.alert(
        t('authScreens.emailVerification.alerts.verificationErrorTitle'),
        `${error?.message || t('authScreens.emailVerification.alerts.verificationErrorMessage')}\n(${firebaseCode})`
      );
    }
  };

  const checkEmailVerificationStatus = async (manual = false) => {
    if (autoVerifiedHandledRef.current) {
      return;
    }

    if (manual) {
      setCheckingVerification(true);
    }
    try {
      if (authProvider === 'email/password') {
        await firebaseAuthService.ensureEmailVerificationSession(email, password || '');
      } else if (authProvider === 'google' && googleIdToken) {
        await firebaseAuthService.ensureWebSessionFromIdToken(googleIdToken);
      }

      const { verified, user } = await firebaseAuthService.isCurrentUserEmailVerified();
      const normalizedRouteEmail = (email || '').trim().toLowerCase();
      const normalizedSessionEmail = (user?.email || '').trim().toLowerCase();

      if (!user?.uid || !normalizedSessionEmail) {
        throw new Error('NO_AUTH_USER_EMAIL');
      }

      if (normalizedRouteEmail && normalizedSessionEmail !== normalizedRouteEmail) {
        throw new Error('SESSION_EMAIL_MISMATCH');
      }

      if (!verified) {
        if (manual) {
          Alert.alert(
            t('authScreens.emailVerification.alerts.errorTitle'),
            t('authScreens.emailVerification.alerts.notVerifiedYet')
          );
        }
        return;
      }

      autoVerifiedHandledRef.current = true;
      await finalizeVerifiedFlow(user.uid, 1);
    } catch (error: any) {
      const { code: firebaseCode, message: firebaseMessage } = getFirebaseErrorDetails(error);
      console.error('[EmailVerification] Error verificando estado de email:', {
        code: firebaseCode,
        message: firebaseMessage,
        error,
      });
      if (manual) {
        Alert.alert(
          t('authScreens.emailVerification.alerts.errorTitle'),
          `${error?.message || t('authScreens.emailVerification.alerts.verificationErrorMessage')}\n(${firebaseCode})`
        );
      }
    } finally {
      if (manual) {
        setCheckingVerification(false);
      }
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      checkEmailVerificationStatus(false);
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  const handleCancelRegistration = () => {
    Alert.alert(
      t('authScreens.emailVerification.alerts.errorTitle', 'Error'),
      t(
        'authScreens.emailVerification.cancelConfirm',
        'Do you want to cancel registration and return to start?'
      ),
      [
        { text: t('common.actions.no', 'No'), style: 'cancel' },
        {
          text: t('common.actions.yes', 'Yes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await firebaseAuthService.deleteCurrentUser();
            } catch (deleteError: any) {
              console.warn('[EmailVerification] No se pudo eliminar usuario en Authentication:', deleteError);
            }

            try {
              await registrationService.clearTemporaryData();
            } catch (tempDataError: any) {
              console.warn('[EmailVerification] No se pudo limpiar data temporal:', tempDataError);
            }

            try {
              await firebaseAuthService.logout();
            } catch (logoutError: any) {
              console.warn('[EmailVerification] No se pudo cerrar sesion al cancelar registro:', logoutError);
            }

            navigation.replace('RegisterNew');
          },
        },
      ],
    );
  };

  const stepTexts = [
    t('authScreens.emailVerification.steps.open'),
    t('authScreens.emailVerification.steps.back'),
    t('authScreens.emailVerification.steps.auto'),
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.iconWrap}>
              <View style={styles.iconBubble}>
                <Ionicons name="mail-unread-outline" size={38} color={colors.primary} />
              </View>
              <View style={styles.iconBadge}>
                <Ionicons name="time-outline" size={14} color={accentStrong} />
              </View>
            </View>

            <Text style={styles.title}>{t('authScreens.emailVerification.title')}</Text>
            <Text style={styles.subtitle}>{t('authScreens.emailVerification.subtitle')}</Text>

            <View style={styles.emailPill}>
              <Ionicons name="mail-outline" size={15} color={accentStrong} />
              <Text style={styles.emailText} numberOfLines={1} ellipsizeMode="middle">
                {email}
              </Text>
            </View>

            <View style={styles.stepsCard}>
              {stepTexts.map((step, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <View style={styles.stepDivider} />}
                  <View style={styles.stepRow}>
                    <View style={styles.stepDot}>
                      <Text style={styles.stepNum}>{index + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, checkingVerification && styles.buttonDisabled]}
              onPress={() => checkEmailVerificationStatus(true)}
              disabled={checkingVerification}
              accessibilityRole="button"
              accessibilityState={{ disabled: checkingVerification }}
            >
              {checkingVerification ? (
                <LoadingIcon size={22} color={ON_PRIMARY} />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={19} color={ON_PRIMARY} />
                  <Text style={styles.primaryButtonText}>
                    {t('authScreens.emailVerification.verifyByLinkButton')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendQuestion}>
                {t('authScreens.emailVerification.resendQuestion')}
              </Text>
              {timeLeft > 0 ? (
                <Text style={styles.resendTimer}>
                  {t('authScreens.emailVerification.resendIn', { seconds: timeLeft })}
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
                    <LoadingIcon size={16} color={accentStrong} />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={15} color={accentStrong} />
                      <Text style={styles.resendButton}>
                        {t('authScreens.emailVerification.resendButton')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.autoRow}>
              <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />
              <Text style={styles.autoText}>
                {t('authScreens.emailVerification.autoDetect')}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelRegistration}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>
                {t('authScreens.emailVerification.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isDark: boolean) => {
  const accentSoft = isDark ? 'rgba(179,135,55,0.26)' : 'rgba(179,135,55,0.10)';
  const accentBorder = isDark ? 'rgba(232,196,127,0.45)' : 'rgba(179,135,55,0.45)';
  const accentStrong = isDark ? '#e8c47f' : '#c38d28';

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 24,
    },
    content: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
    },
    iconWrap: {
      alignSelf: 'center',
      marginBottom: 20,
    },
    iconBubble: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: accentSoft,
      borderWidth: 1,
      borderColor: accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 8,
      marginBottom: 14,
    },
    emailPill: {
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: colors.surface,
      marginBottom: 22,
    },
    emailText: {
      fontSize: 15,
      fontWeight: '700',
      color: accentStrong,
      flexShrink: 1,
    },
    stepsCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 4,
      marginBottom: 22,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 11,
    },
    stepDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 36,
    },
    stepDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNum: {
      fontSize: 12,
      fontWeight: '800',
      color: accentStrong,
      fontVariant: ['tabular-nums'],
    },
    stepText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    primaryButton: {
      minHeight: 56,
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: ON_PRIMARY,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    resendRow: {
      minHeight: 44,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      columnGap: 6,
      rowGap: 2,
      marginTop: 16,
    },
    resendQuestion: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    resendTimer: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    resendAction: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 6,
      justifyContent: 'center',
    },
    resendButton: {
      fontSize: 13,
      fontWeight: '700',
      color: accentStrong,
    },
    autoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
    },
    pulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    autoText: {
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    cancelButton: {
      alignSelf: 'center',
      minHeight: 44,
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginTop: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
};
