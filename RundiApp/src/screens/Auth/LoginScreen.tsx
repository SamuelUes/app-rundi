import React, { useState, useMemo } from 'react';
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useGoogleAuth } from '../../hooks/shared/auth/useGoogleAuth';
import GoogleSignInButton from '../../components/shared/GoogleSignInButton';
import GoogleRegisterPrompt from '../../components/auth/GoogleRegisterPrompt';
import PhoneField from '../../components/ui/PhoneField';
import { PressableScale } from '../../components/ui/PressableScale';
import phoneAuthService from '../../services/auth/phoneAuthService';
import googleAuthService from '../../services/auth/googleAuthService';
import registrationService from '../../services/auth/registrationService';
import alertService from '../../services/notification/alertService';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  extractLocalNumber,
} from '../../utils/format/phoneUtils';
import { useTranslation } from 'react-i18next';
import { withAlpha } from '../../utils/format/colors';

// Google Client ID desde variables de entorno
// Android Client ID para Expo
const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  process.env.REACT_APP_GOOGLE_CLIENT_ID_ANDROID_AUTO_GOOGLE ||
  process.env.REACT_APP_GOOGLE_CLIENT_ID_ANDROID ||
  '';

export default function LoginScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { login, loginWithGoogle } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry = countryOptions.find((option) => option.code === 'NI') ?? countryOptions[0];
  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(defaultCountry);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('phone');
  const [googleNewUser, setGoogleNewUser] = useState<{
    displayName: string;
    email?: string;
    phone?: string;
    idToken: string;
  } | null>(null);
  const {
    promptAsync,
    loading: googleLoading,
    loginWithGoogle: googleLogin,
    getGoogleIdToken,
  } = useGoogleAuth(GOOGLE_CLIENT_ID);

  const handlePhoneChange = (localDigits: string) => {
    setPhoneDigits(localDigits);
    const normalized = normalizePhoneNumber(localDigits, selectedCountry.dialCode);
    setNormalizedPhone(normalized);
  };

  const handleCountryChange = (countryCode: string) => {
    const nextCountry = countryOptions.find((option) => option.code === countryCode) ?? countryOptions[0];
    const localDigits = phoneDigits || extractLocalNumber(normalizedPhone || '', selectedCountry.dialCode);
    const newNormalized = localDigits ? normalizePhoneNumber(localDigits, nextCountry.dialCode) : '';

    setSelectedCountry(nextCountry);
    setPhoneDigits(localDigits || '');
    setNormalizedPhone(newNormalized);
  };

  const handleLogin = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      alertService.showErrorAlert(t('authScreens.login.alerts.emailRequired'));
      return;
    }

    if (!password.trim()) {
      alertService.showErrorAlert(t('authScreens.login.alerts.passwordRequired'));
      return;
    }

    setLoading(true);
    try {
      await login(normalizedEmail, password);
    } catch (error: any) {
      if (error?.code === 'SESSION_ACTIVE_ELSEWHERE') {
        alertService.showSessionActiveAlert(t('authScreens.phoneVerificationLogin.alerts.sessionActiveMessage'));
        return;
      }
      let message = t('authScreens.login.alerts.genericError');
      const code = error?.code || '';

      switch (code) {
        case 'auth/user-not-found':
        case 'EMAIL_NOT_FOUND':
          Alert.alert(
            t('authScreens.login.accountNotFound.title'),
            t('authScreens.login.accountNotFound.message', { email: normalizedEmail }),
            [
              {
                text: t('authScreens.login.accountNotFound.cancel'),
                style: 'cancel',
              },
              {
                text: t('authScreens.login.accountNotFound.confirm'),
                onPress: () => navigation.navigate('RegisterNew', { email: normalizedEmail }),
              },
            ],
          );
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-email':
        case 'INVALID_PASSWORD':
          message = t('authScreens.login.alerts.invalidCredentials');
          break;
        case 'auth/too-many-requests':
          message = t('authScreens.login.alerts.tooManyAttempts');
          break;
        default:
          if (typeof error?.message === 'string') {
            if (error.message.toLowerCase().includes('password')) {
              message = t('authScreens.login.alerts.invalidCredentials');
            } else if (error.message.toLowerCase().includes('network')) {
              message = t('authScreens.login.alerts.genericError');
            }
          }
          break;
      }

      alertService.showErrorAlert(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async () => {
    const normalized = normalizePhoneNumber(phoneDigits, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    if (!normalized || !/^\+\d{6,15}$/.test(normalized)) {
      alertService.showErrorAlert(
        t('authScreens.login.alerts.phoneInvalid'),
      );
      return;
    }

    setLoading(true);
    try {
      setNormalizedPhone(normalized);
      console.log('📱 Solicitando código SMS para:', normalized);

      await phoneAuthService.sendVerificationCode(normalized);

      navigation.navigate('PhoneVerificationLogin', {
        phone: normalized,
        displayPhone: formatPhoneNumber(normalized, selectedCountry.dialCode),
        country: selectedCountry,
        mode: 'login',
      });
    } catch (error: any) {
      alertService.showErrorAlert(
        error?.message || t('authScreens.login.alerts.smsError'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      console.log('🔐 Iniciando Google Sign-In...');

      const idToken = await getGoogleIdToken();

      console.log('🔄 Iniciando sesión con Firebase...');
      const userData = await googleLogin(idToken);

      // Si no existe perfil en Firestore, avisar al usuario antes de registrar
      if (userData?.isNew) {
        setGoogleNewUser({
          displayName:
            userData.name ||
            (userData.email ? String(userData.email).split('@')[0] : 'Usuario Google'),
          email: userData.email || undefined,
          phone: userData.phone || undefined,
          idToken,
        });
        return;
      }

      console.log('💾 Guardando datos de usuario...');
      await loginWithGoogle(userData);

      console.log('✅ Login completado, la navegación se maneja por el contexto');
    } catch (error: any) {
      console.error('❌ Error en Google Login:', error);
      if (error?.code === 'SESSION_ACTIVE_ELSEWHERE') {
        alertService.showSessionActiveAlert(t('authScreens.phoneVerificationLogin.alerts.sessionActiveMessage'));
        return;
      }
      alertService.showErrorAlert(error?.message || 'Error al iniciar sesión con Google. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegisterConfirm = async () => {
    const pending = googleNewUser;
    if (!pending) return;
    setGoogleNewUser(null);

    try {
      if (pending.email) {
        await registrationService.saveTemporaryData({
          name: pending.displayName,
          email: pending.email,
          phone: pending.phone,
          password: undefined,
          method: 'google',
          authProvider: 'google',
          googleIdToken: pending.idToken,
          phoneVerified: false,
          emailVerified: false,
          lastStep: 'emailVerification',
        });

        navigation.navigate('EmailVerification', {
          name: pending.displayName,
          email: pending.email,
          phone: pending.phone,
          password: undefined,
          method: 'google',
          authProvider: 'google',
          googleIdToken: pending.idToken,
          phoneVerified: false,
          emailVerified: false,
          context: 'register_google',
        });
        return;
      }

      console.log('🆕 Usuario Google sin email verificable, navegando a RoleSelection...');
      navigation.navigate('RoleSelection', {
        name: pending.displayName,
        email: pending.email,
        phone: pending.phone,
        password: undefined,
        method: 'google',
        authProvider: 'google',
        googleIdToken: pending.idToken,
        phoneVerified: false,
        emailVerified: false,
      });
    } catch (error: any) {
      console.error('❌ Error continuando registro con Google:', error);
      alertService.showErrorAlert(error?.message || 'Error al continuar el registro. Intenta de nuevo.');
    }
  };

  const handleGoogleRegisterCancel = async () => {
    setGoogleNewUser(null);
    try {
      await googleAuthService.logout();
    } catch {}
  };

  const isPhoneValid = normalizedPhone ? /^\+\d{6,15}$/.test(normalizedPhone) : false;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
          <Animated.View
            entering={FadeInDown.duration(740).reduceMotion(ReduceMotion.System)}
            style={styles.card}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={t('common.actions.back')}
              style={styles.backButton}
            >
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.cardHeader}>
              <Text style={styles.title}>{t('authScreens.login.title')}</Text>
              <Text style={styles.subtitle}>
                {t('authScreens.login.subtitle')}
              </Text>
              <Animated.View
                entering={FadeIn.delay(160).duration(680).reduceMotion(ReduceMotion.System)}
                style={styles.headerAccent}
              />
            </View>

            <View style={styles.form}>
              <Animated.View
                key={loginMode}
                entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)}
              >
              {loginMode === 'email' ? (
                <>
                  <Text style={styles.label}>
                    {t('authScreens.login.fields.emailLabel')}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('authScreens.login.fields.emailPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    autoComplete="email"
                    importantForAutofill="yes"
                  />

                  <Text style={styles.label}>
                    {t('authScreens.login.fields.passwordLabel')}
                  </Text>
                  <View style={styles.inputWithIcon}>
                    <TextInput
                      style={styles.inputFlex}
                      placeholder={t('authScreens.login.fields.passwordPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      autoComplete="password"
                      importantForAutofill="yes"
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword((prev) => !prev)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t(showPassword ? 'authScreens.login.hidePassword' : 'authScreens.login.showPassword')}
                    >
                      <MaterialIcons
                        name={showPassword ? 'visibility-off' : 'visibility'}
                        size={22}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  <PressableScale
                    style={[styles.loginButton, (loading || googleLoading) && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={loading || googleLoading}
                  >
                    <Text style={styles.loginButtonText}>
                      {loading
                        ? t('authScreens.login.buttons.loginEmail.loading')
                        : t('authScreens.login.buttons.loginEmail.idle')}
                    </Text>
                  </PressableScale>
                </>
              ) : (
                <>
                  <Text style={styles.label}>
                    {t('authScreens.login.fields.phoneLabel')}
                  </Text>
                  <View style={styles.phoneFieldContainer}>
                    <PhoneField
                      countryOptions={countryOptions}
                      selectedCountry={selectedCountry}
                      onCountryChange={handleCountryChange}
                      digits={phoneDigits}
                      onChangeDigits={handlePhoneChange}
                      disabled={loading || googleLoading}
                      accessibilityLabel={t('authScreens.login.fields.phoneLabel')}
                    />
                  </View>
                  <Text style={styles.helperText}>
                    {t('authScreens.login.fields.phoneHelper')}
                  </Text>

                  <PressableScale
                    style={[styles.loginButton, (loading || googleLoading || !isPhoneValid) && styles.buttonDisabled]}
                    onPress={handlePhoneLogin}
                    disabled={
                      loading ||
                      googleLoading ||
                      !isPhoneValid
                    }
                  >
                    <Text style={styles.loginButtonText}>
                      {loading
                        ? t('authScreens.login.buttons.loginPhone.loading')
                        : t('authScreens.login.buttons.loginPhone.idle')}
                    </Text>
                  </PressableScale>
                </>
              )}
              </Animated.View>

              <Animated.View layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}>
              <PressableScale
                style={styles.alternativeButton}
                onPress={() => setLoginMode(loginMode === 'phone' ? 'email' : 'phone')}
                disabled={loading || googleLoading}
                accessibilityRole="button"
              >
                <Text style={styles.alternativeButtonText}>
                  {t(loginMode === 'phone' ? 'authScreens.login.useEmail' : 'authScreens.login.usePhone')}
                </Text>
              </PressableScale>

              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>
                  {t('authScreens.login.divider')}
                </Text>
                <View style={styles.divider} />
              </View>

              {/* Google Sign-In Button */}
              <GoogleSignInButton
                onPress={handleGoogleLogin}
                loading={googleLoading}
                disabled={loading}
                variant="login"
              />

              <PressableScale
                style={styles.registerButton}
                onPress={() => navigation.navigate('RegistrationCheckpoint')}
                disabled={loading || googleLoading}
              >
                <Text style={styles.registerButtonText}>
                  {t('authScreens.login.buttons.register')}
                </Text>
              </PressableScale>
              </Animated.View>
            </View>
          </Animated.View>
      </ScrollView>

      <GoogleRegisterPrompt
        visible={!!googleNewUser}
        email={googleNewUser?.email}
        onConfirm={handleGoogleRegisterConfirm}
        onCancel={handleGoogleRegisterCancel}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    marginLeft: -8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alternativeButton: {
    minHeight: 50,
    backgroundColor: '#442aa2',
    borderWidth: 0.2,
    borderColor: colors.border,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
    elevation: 2,
  },
  alternativeButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
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
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: withAlpha('#000', isDark ? 0.24 : 0.14)  }],
    elevation: 6,
  },
  cardHeader: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  headerAccent: {
    width: 32,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 18,
    opacity: 0.7,
  },
  content: {
    flex: 1,
    padding: 18,
    justifyContent: 'center',
  },
  phoneFieldContainer: {
    marginBottom: 10,
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
    fontWeight: '500',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: isDark ? colors.background : 'rgba(246, 246, 246, 0.8)',
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
    borderWidth: 0.1,
    borderColor: colors.border,
  },
  inputWithIcon: {
    position: 'relative',
    marginBottom: 20,
  },
  inputFlex: {
    backgroundColor: isDark ? colors.background : 'rgba(246, 246, 246, 0.8)',
    borderRadius: 12,
    padding: 13,
    paddingRight: 44,
    fontSize: 15,
    color: colors.text,
    borderWidth: 0.1,
    borderColor: colors.border,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 6,
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 6, color: withAlpha(colors.primary, 0.5)  }],
    elevation: 4,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  registerButton: {
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  registerButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 10,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: 16,
  },
});
