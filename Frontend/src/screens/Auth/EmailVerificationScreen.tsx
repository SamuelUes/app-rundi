import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
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

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const checkEmailVerificationStatus = async (showNotVerifiedAlert = false) => {
    if (autoVerifiedHandledRef.current) {
      return;
    }

    setCheckingVerification(true);
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
        if (showNotVerifiedAlert) {
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
      if (showNotVerifiedAlert) {
        Alert.alert(
          t('authScreens.emailVerification.alerts.errorTitle'),
          `${error?.message || t('authScreens.emailVerification.alerts.verificationErrorMessage')}\n(${firebaseCode})`
        );
      }
    } finally {
      setCheckingVerification(false);
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('authScreens.emailVerification.title')}</Text>
          </View>
          <Text style={styles.title}>{t('authScreens.emailVerification.title')}</Text>
          <Text style={styles.subtitle}>{t('authScreens.emailVerification.subtitle')}</Text>
          <Text style={styles.emailText}>{email}</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{t('authScreens.emailVerification.linkVerificationHint')}</Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, checkingVerification && styles.buttonDisabled]}
            onPress={() => checkEmailVerificationStatus(true)}
            disabled={checkingVerification}
          >
            {checkingVerification ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>{t('authScreens.emailVerification.verifyByLinkButton')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRegistration}>
            <Text style={styles.cancelButtonText}>{t('authScreens.emailVerification.cancel')}</Text>
          </TouchableOpacity>

          <View style={styles.resendSection}>
            {timeLeft > 0 ? (
              <Text style={styles.resendTimer}>{t('authScreens.emailVerification.resendIn', { seconds: timeLeft })}</Text>
            ) : (
              <TouchableOpacity
                style={styles.resendButtonContainer}
                onPress={handleResendCode}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.resendButton}>{t('authScreens.emailVerification.resendButton')}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F2F2F2' },
    scrollContent: { flexGrow: 1, padding: 18, paddingTop: 56, paddingBottom: 28, justifyContent: 'flex-start' },
    card: {
      backgroundColor: '#F7F7F7',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: '#DDDDDD',
      padding: 20,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: '#E8E1D3',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 2,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#6E5A2E', letterSpacing: 0.2 },
    title: { fontSize: 34, fontWeight: '800', color: '#141414' },
    subtitle: { fontSize: 20, color: '#686868', lineHeight: 21 },
    emailText: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#AC7F2C' },
    infoBox: {
      borderWidth: 1,
      borderColor: '#D5D5D5',
      backgroundColor: '#FFFFFF',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    infoText: { color: '#3A3A3A', fontSize: 15, lineHeight: 20 },
    primaryButton: {
      backgroundColor: '#D1BB90',
      borderRadius: 13,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 2,
    },
    primaryButtonText: { color: '#FFFFFF', fontSize: 23, fontWeight: '800' },
    buttonDisabled: { opacity: 0.5 },
    cancelButton: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#D7D7D7',
      backgroundColor: '#FFFFFF',
    },
    cancelButtonText: {
      color: '#474747',
      fontSize: 14,
      fontWeight: '700',
    },
    resendSection: { alignItems: 'center' },
    resendTimer: { color: '#7D7D7D', fontSize: 15 },
    resendButtonContainer: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: '#EFE6D6',
      borderWidth: 1,
      borderColor: '#E2D3B8',
    },
    resendButton: { color: '#AC7F2C', fontSize: 18, fontWeight: '700' },
  });
