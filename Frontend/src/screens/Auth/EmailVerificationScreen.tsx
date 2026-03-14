import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { AuthStackParamList } from '../../navigation/types';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import registrationService from '../../services/registrationService';

type EmailVerificationNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'EmailVerification'
>;
type EmailVerificationRouteProp = RouteProp<AuthStackParamList, 'EmailVerification'>;

interface Props {
  navigation: EmailVerificationNavigationProp;
  route: EmailVerificationRouteProp;
}

const MAX_ATTEMPTS = 3;

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
    context,
  } = route.params;

  const verificationContext = context || (authProvider === 'google' ? 'register_google' : 'register_email');

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const hiddenInputRef = useRef<TextInput>(null);

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

  const handleResendCode = async () => {
    setResendLoading(true);
    try {
      if (authProvider === 'email/password') {
        await firebaseAuthService.ensureEmailVerificationSession(email, password || '');
      }

      await firebaseAuthService.sendEmailVerificationCode();
      Alert.alert(
        t('authScreens.emailVerification.alerts.codeSentTitle'),
        t('authScreens.emailVerification.alerts.codeSentMessage', { email })
      );
      setTimeLeft(60);
      setCode('');
      setAttempts(0);
    } catch (error: any) {
      const { code: firebaseCode, message: firebaseMessage } = getFirebaseErrorDetails(error);
      console.error('❌ [EmailVerification] Error reenviando código:', {
        code: firebaseCode,
        message: firebaseMessage,
        error,
      });
      Alert.alert(
        t('authScreens.emailVerification.alerts.errorTitle'),
        `${error?.message || t('authScreens.emailVerification.alerts.resendError')}\n(${firebaseCode})`
      );
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      Alert.alert(
        t('authScreens.emailVerification.alerts.codeRequiredTitle'),
        t('authScreens.emailVerification.alerts.codeRequiredMessage')
      );
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert(
        t('authScreens.emailVerification.alerts.tooManyAttemptsTitle'),
        t('authScreens.emailVerification.alerts.tooManyAttemptsMessage')
      );
      return;
    }

    setLoading(true);
    try {
      await firebaseAuthService.applyEmailVerificationCode(trimmedCode);

      const currentUser = await firebaseAuthService.getCurrentUser();
      if (!currentUser?.uid) {
        throw new Error(t('authScreens.emailVerification.alerts.noSessionError'));
      }

      await firebaseAuthService.logEmailVerification({
        userId: currentUser.uid,
        email,
        code: trimmedCode,
        context: verificationContext,
        attemptCount: attempts + 1,
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
      console.error('❌ [EmailVerification] Error verificando código:', {
        code: firebaseCode,
        message: firebaseMessage,
        attempts: attempts + 1,
        error,
      });
      setAttempts((prev) => prev + 1);
      Alert.alert(
        t('authScreens.emailVerification.alerts.verificationErrorTitle'),
        `${error?.message || t('authScreens.emailVerification.alerts.verificationErrorMessage')}\n(${firebaseCode})`
      );
      setCode('');
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
          <Text style={styles.title}>{t('authScreens.emailVerification.title')}</Text>
          <Text style={styles.subtitle}>
            {t('authScreens.emailVerification.subtitle')}
          </Text>
          <Text style={styles.emailText}>{email}</Text>

          <View style={styles.codeSection}>
            <Text style={styles.label}>{t('authScreens.emailVerification.label')}</Text>
            <TextInput
              ref={hiddenInputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <TouchableWithoutFeedback onPress={() => hiddenInputRef.current?.focus()}>
              <View style={styles.codeInputBox}>
                <Text style={styles.codeValue} numberOfLines={2}>
                  {code || t('authScreens.emailVerification.codePlaceholder')}
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </View>

          {attempts > 0 ? (
            <Text style={styles.attemptsText}>
              {t('authScreens.emailVerification.attemptsRemaining', {
                remaining: Math.max(MAX_ATTEMPTS - attempts, 0),
                max: MAX_ATTEMPTS,
              })}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, (loading || !code.trim()) && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading || !code.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('authScreens.emailVerification.verifyButton')}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendSection}>
            {timeLeft > 0 ? (
              <Text style={styles.resendTimer}>
                {t('authScreens.emailVerification.resendIn', { seconds: timeLeft })}
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResendCode} disabled={resendLoading}>
                {resendLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.resendButton}>
                    {t('authScreens.emailVerification.resendButton')}
                  </Text>
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
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center' },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 14,
    },
    title: { fontSize: 26, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSecondary },
    emailText: { fontSize: 16, fontWeight: '600', color: colors.primary },
    codeSection: { gap: 8 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text },
    hiddenInput: { position: 'absolute', width: '100%', height: 80, opacity: 0 },
    codeInputBox: {
      minHeight: 80,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      borderRadius: 12,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    codeValue: { color: colors.text, fontSize: 13 },
    attemptsText: { color: colors.error, fontSize: 13, fontWeight: '600' },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    buttonDisabled: { opacity: 0.5 },
    resendSection: { alignItems: 'center' },
    resendTimer: { color: colors.textSecondary, fontSize: 14 },
    resendButton: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  });
