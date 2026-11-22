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
  Platform,
  ScrollView,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import registrationService from '../../services/auth/registrationService';
import phoneAuthService from '../../services/auth/phoneAuthService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import { getFirebaseAuth } from '../../config/firebase';
import { AuthStackParamList, RegistrationMethod, RegistrationAuthProvider } from '../../navigation/types';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  getCountryLocalNumberLength,
} from '../../utils/format/phoneUtils';
import { useTranslation } from 'react-i18next';
import { RegisterBaseFields } from '../../components/auth/Register/RegisterBaseFields';
import { RegisterPasswordFields } from '../../components/auth/Register/RegisterPasswordFields';
import { RegisterPhoneSubmit } from '../../components/auth/Register/RegisterPhoneSubmit';
import { PressableScale } from '../../components/ui/PressableScale';
import { withAlpha } from '../../utils/format/colors';

export default function RegisterScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AuthStackParamList, 'RegisterNew'>>();
  const registerParams = route.params;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();

  // Estados principales
  const [method, setMethod] = useState<RegistrationMethod>(
    registerParams?.email ? 'email' : 'phone',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState(registerParams?.email || '');

  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry =
    countryOptions.find((option) => option.code === 'NI') ?? countryOptions[0];
  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(defaultCountry);

  const [phoneDigits, setPhoneDigits] = useState('');
  const [phone, setPhone] = useState<string>(
    formatPhoneNumber('', defaultCountry.dialCode)
  );
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'match' | 'mismatch'>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!registerParams?.phone) return;

    const matchingCountry = countryOptions
      .filter((option) => registerParams.phone!.startsWith(option.dialCode))
      .sort((a, b) => b.dialCode.length - a.dialCode.length)[0];
    const country = matchingCountry || defaultCountry;
    const localDigits = registerParams.phone.startsWith(country.dialCode)
      ? registerParams.phone.slice(country.dialCode.length)
      : '';

    setMethod('phone');
    setSelectedCountry(country);
    setPhoneDigits(localDigits);
    setNormalizedPhone(registerParams.phone);
    setPhone(formatPhoneNumber(registerParams.phone, country.dialCode));
    setVerifiedPhone(registerParams.phoneVerified ? registerParams.phone : '');
  }, [registerParams, countryOptions, defaultCountry]);

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

    const maxDigits = getCountryLocalNumberLength(nextCountry);
    const nextDigits = phoneDigits.slice(0, maxDigits);
    const newNormalized = nextDigits
      ? normalizePhoneNumber(nextDigits, nextCountry.dialCode)
      : '';

    setSelectedCountry(nextCountry);
    setPhoneDigits(nextDigits);
    setNormalizedPhone(newNormalized);
    setPhone(
      newNormalized
        ? formatPhoneNumber(newNormalized, nextCountry.dialCode)
        : formatPhoneNumber('', nextCountry.dialCode)
    );
    if (newNormalized !== verifiedPhone) setVerifiedPhone('');
  };

  const handlePhoneChange = (localDigits: string) => {
    setPhoneDigits(localDigits);

    const normalized = normalizePhoneNumber(localDigits, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    const formatted = normalized
      ? formatPhoneNumber(normalized, selectedCountry.dialCode)
      : formatPhoneNumber('', selectedCountry.dialCode);

    setPhone(formatted || `${selectedCountry.dialCode} `);
    if (normalized !== verifiedPhone) setVerifiedPhone('');
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
    emailVerified = false,
  }: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified?: boolean;
    emailVerified?: boolean;
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
      emailVerified,
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
        Alert.alert(
          t('authScreens.register.alerts.genericTitle'),
          t('authScreens.register.alerts.confirmPasswordMissing'),
        );
        return;
      }
      if (passwordsDontMatch) {
        Alert.alert(
          t('authScreens.register.alerts.genericTitle'),
          t('authScreens.register.alerts.passwordsMismatch'),
        );
        return;
      }
      Alert.alert(
        t('authScreens.register.alerts.genericTitle'),
        t('authScreens.register.alerts.incompleteEmailForm'),
      );
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const phoneForCheck = undefined;

      const { emailExists, phoneExists } = await firebaseAuthService.checkUserExists({
        email: normalizedEmail,
        phone: phoneForCheck,
      });

      if (emailExists) {
        Alert.alert(
          t('authScreens.register.alerts.genericTitle'),
          t('authScreens.register.alerts.emailExists'),
        );
        return;
      }

      if (phoneExists) {
        Alert.alert(
          t('authScreens.register.alerts.genericTitle'),
          t('authScreens.register.alerts.phoneExists'),
        );
        return;
      }

      await firebaseAuthService.ensureEmailVerificationSession(normalizedEmail, password);

      await registrationService.saveTemporaryData({
        name: name.trim(),
        email: normalizedEmail,
        phone: phoneForCheck,
        password,
        method: 'email',
        authProvider: 'email/password',
        phoneVerified: false,
        emailVerified: false,
        lastStep: 'emailVerification',
      });

      navigation.navigate('EmailVerification', {
        name: name.trim(),
        email: normalizedEmail,
        phone: phoneForCheck,
        password,
        authProvider: 'email/password',
        method: 'email',
        role: undefined,
        googleIdToken: undefined,
        phoneVerified: false,
        emailVerified: false,
        context: 'register_email',
      });
    } catch (error: any) {
      console.error('❌ Error registro email:', error);
      Alert.alert(
        t('authScreens.register.alerts.genericTitle'),
        error?.message || t('authScreens.register.alerts.registerEmailError'),
      );
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
        t('authScreens.register.alerts.genericTitle'),
        t('authScreens.register.alerts.phoneInvalidNumber'),
      );
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = undefined;

      const { emailExists, phoneExists } = await firebaseAuthService.checkUserExists({
        email: normalizedEmail,
        phone: normalizedPhone,
      });

      if (emailExists) {
        Alert.alert('Error', 'Ya existe una cuenta registrada con este correo electrónico.');
        return;
      }

      // Reuse the Firebase phone identity verified during the login attempt.
      try {
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;

        if (
          verifiedPhone === normalizedPhone &&
          firebaseUser?.phoneNumber === normalizedPhone
        ) {
          await registrationService.saveTemporaryData({
            name: name.trim(),
            phone: normalizedPhone,
            method: 'phone',
            authProvider: 'phone',
            phoneVerified: true,
            lastStep: 'register',
          });

          navigation.navigate('RoleSelection', {
            name: name.trim(),
            phone: normalizedPhone,
            method: 'phone',
            authProvider: 'phone',
            phoneVerified: true,
          });
          return;
        }
      } catch (checkError) {
        console.warn(
          '⚠️ [Register] No se pudo verificar verificación previa de teléfono; continuando con SMS:',
          checkError,
        );
      }

      if (phoneExists) {
        Alert.alert(
          t('authScreens.register.alerts.genericTitle'),
          t('authScreens.register.alerts.phoneExists'),
        );
        return;
      }

      console.log('📱 [Register] Enviando código SMS a:', normalizedPhone);
      await phoneAuthService.sendVerificationCode(normalizedPhone);

      await registrationService.saveTemporaryData({
        name: name.trim(),
        email: undefined,
        phone: normalizedPhone,
        password: undefined,
        googleIdToken: undefined,
        method: 'phone',
        authProvider: 'phone',
        phoneVerified: false,
        emailVerified: false,
        lastStep: 'register',
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
      Alert.alert(
        t('authScreens.register.alerts.genericTitle'),
        error?.message || t('authScreens.register.alerts.registerPhoneError'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
            disabled={loading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.back')}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.cardHeader}>
            <Text style={styles.title}>{t('authScreens.register.header.title')}</Text>
            <Text style={styles.subtitle}>
              {t('authScreens.register.header.subtitle')}
            </Text>
            <Animated.View
              entering={FadeIn.delay(160).duration(680).reduceMotion(ReduceMotion.System)}
              style={styles.headerAccent}
            />
          </View>

          <RegisterBaseFields
            name={name}
            email={email}
            isEmailMethod={isEmailMethod}
            isPhoneMethod={isPhoneMethod}
            loading={loading}
            colors={colors}
            selectedCountry={selectedCountry}
            phoneDigits={phoneDigits}
            countryOptions={countryOptions}
            onSetName={setName}
            onSetEmail={setEmail}
            onCountryChange={handleCountryChange}
            onChangeDigits={handlePhoneChange}
            t={t}
            styles={styles}
          />

          <Animated.View
            key={method}
            entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)}
            style={styles.animatedSection}
          >
          {isEmailMethod && (
            <RegisterPasswordFields
              password={password}
              confirmPassword={confirmPassword}
              passwordStatus={passwordStatus}
              showPassword={showPassword}
              showConfirmPassword={showConfirmPassword}
              loading={loading}
              isEmailFormValid={isEmailFormValid}
              colors={colors}
              onSetPassword={setPassword}
              onSetConfirmPassword={setConfirmPassword}
              onToggleShowPassword={() => setShowPassword((prev) => !prev)}
              onToggleShowConfirmPassword={() => setShowConfirmPassword((prev) => !prev)}
              onSubmit={handleRegisterWithEmail}
              t={t}
              styles={styles}
            />
          )}

          {isPhoneMethod && (
            <RegisterPhoneSubmit
              isPhoneFormValid={isPhoneFormValid}
              loading={loading}
              onSubmit={handleRegisterWithPhone}
              t={t}
              styles={styles}
            />
          )}
          </Animated.View>

          <Animated.View
            layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
            style={styles.animatedSection}
          >
          <PressableScale
            style={styles.alternativeButton}
            onPress={() => setMethod(isPhoneMethod ? 'email' : 'phone')}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.alternativeButtonText}>
              {t(isPhoneMethod ? 'authScreens.login.useEmail' : 'authScreens.login.usePhone')}
            </Text>
          </PressableScale>

          <View style={styles.footerInfo}>
            <Text style={styles.footerText}>
              {t('authScreens.register.footer')}
            </Text>
          </View>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ==================== ESTILOS ====================
const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    alternativeButton: {
      minHeight: 50,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 12,
    },
    alternativeButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingTop: 16,
      paddingBottom: 32,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    card: {
      backgroundColor: colors.card,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      borderRadius: 28,
      paddingTop: 24,
      paddingBottom: 32,
      paddingHorizontal: 24,
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.border,
      gap: 20,
      boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: withAlpha('#000', isDark ? 0.24 : 0.14)  }],
      elevation: 6,
    },
    cardHeader: {
      alignItems: 'center',
      marginBottom: 8,
    },
    headerAccent: {
      width: 32,
      height: 3,
      borderRadius: 3,
      backgroundColor: colors.primary,
      marginTop: 18,
      opacity: 0.7,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    methodSwitcher: {
      flexDirection: 'row',
      alignSelf: 'center',
      backgroundColor: isDark ? colors.background : 'rgba(244, 245, 245, 0.5)',
      borderRadius: 999,
      borderWidth: 0.1,
      borderColor: colors.border,
      padding: 4,
      gap: 6,
      marginBottom: 8,
    },
    methodButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    methodButtonActive: {
      backgroundColor: 'rgba(241, 200, 123, 0.2)',
    },
    methodButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    methodButtonTextActive: {
      color: 'rgba(172, 127, 44, 1)',
    },
    fieldGroup: {
      gap: 7,
      marginBottom: 2,
    },
    animatedSection: {
      gap: 20,
    },
    backButton: {
      width: 44,
      height: 44,
      alignSelf: 'flex-start',
      marginLeft: -8,
      justifyContent: 'center',
      alignItems: 'center',
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
      backgroundColor: isDark ? colors.background : 'rgba(246, 246, 246, 0.8)',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text,
      borderWidth: 0.1,
      borderColor: colors.border,
    },
    inputWithIcon: {
      position: 'relative',
    },
    inputFlex: {
      backgroundColor: isDark ? colors.background : 'rgba(246, 246, 246, 0.8)',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      paddingRight: 44,
      fontSize: 15,
      color: colors.text,
      borderWidth: 0.7,
      borderColor: isDark ? colors.background : 'rgba(246, 246, 246, 0.8)',
    },
    eyeButton: {
      position: 'absolute',
      right: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    inputSuccess: {
      borderColor: colors.success,
      boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 4, color: withAlpha(colors.success, 0.2)  }],
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
      backgroundColor: 'rgba(172, 127, 44, 1)',
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      marginTop: 8,
      boxShadow: '0px 4px 6px rgba(214, 182, 122, 0.3)',
      elevation: 5,
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
      justifyContent: 'center',
    },
    phoneNextButton: {
      width: '100%',
      height: 52,
      borderRadius: 999,
      backgroundColor: 'rgba(172, 127, 44, 1)',
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 6, color: withAlpha(colors.primary, 0.3)  }],
      elevation: 5,
    },
    phoneNextIcon: {
      fontSize: 18,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    footerInfo: {
      marginTop: 20,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
