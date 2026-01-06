import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import PhoneDigitInput from '../../components/PhoneDigitInput';
import phoneAuthService from '../../services/auth/phoneAuthService';
import alertService from '../../services/alertService';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  extractLocalNumber,
} from '../../utils/phoneUtils';
import { useTranslation } from 'react-i18next';

// Google Client ID desde variables de entorno
// Android Client ID para Expo
const GOOGLE_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  process.env.REACT_APP_GOOGLE_CLIENT_ID_ANDROID_AUTO_GOOGLE ||
  process.env.REACT_APP_GOOGLE_CLIENT_ID_ANDROID ||
  '';

export default function LoginScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('email'); // 'email' o 'phone'
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
        return;
      }
      let message = t('authScreens.login.alerts.genericError');
      const code = error?.code || '';

      switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-email':
        case 'EMAIL_NOT_FOUND':
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

      // Si no existe perfil en Firestore, forzar selección de rol
      if (userData?.isNew) {
        const displayName =
          userData.name ||
          (userData.email ? String(userData.email).split('@')[0] : 'Usuario Google');

        console.log('🆕 Usuario Google sin perfil, navegando a RoleSelection...');
        navigation.navigate('RoleSelection', {
          name: displayName,
          email: userData.email || undefined,
          phone: userData.phone || undefined,
          password: undefined,
          method: 'google',
          authProvider: 'google',
          googleIdToken: idToken,
          phoneVerified: false,
        });

        return;
      }

      console.log('💾 Guardando datos de usuario...');
      await loginWithGoogle(userData);

      console.log('✅ Login completado, la navegación se maneja por el contexto');
    } catch (error: any) {
      console.error('❌ Error en Google Login:', error);
      if (error?.code === 'SESSION_ACTIVE_ELSEWHERE') {
        return;
      }
      alertService.showErrorAlert(error?.message || 'Error al iniciar sesión con Google. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const isPhoneValid = normalizedPhone ? /^\+\d{6,15}$/.test(normalizedPhone) : false;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.bannerContainer}>
          <Image
            source={require('../../assets/images/campaña2/promo_1-2.png')}
            style={styles.bannerImage}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.title}>{t('authScreens.login.title')}</Text>
            <Text style={styles.subtitle}>
              {t('authScreens.login.subtitle')}
            </Text>
          </View>

          {/* Tabs para cambiar entre Email y Teléfono */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity style={styles.tab} onPress={() => setLoginMode('email')}>
              <Text style={[styles.tabText, loginMode === 'email' && styles.tabTextActive]}>
                {t('authScreens.login.tabs.email')}
              </Text>
              {loginMode === 'email' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => setLoginMode('phone')}>
              <Text style={[styles.tabText, loginMode === 'phone' && styles.tabTextActive]}>
                {t('authScreens.login.tabs.phone')}
              </Text>
              {loginMode === 'phone' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
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
                />

                <Text style={styles.label}>
                  {t('authScreens.login.fields.passwordLabel')}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('authScreens.login.fields.passwordPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleLogin}
                  disabled={loading || googleLoading}
                >
                  <Text style={styles.loginButtonText}>
                    {loading
                      ? t('authScreens.login.buttons.loginEmail.loading')
                      : t('authScreens.login.buttons.loginEmail.idle')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>
                  {t('authScreens.login.fields.phoneLabel')}
                </Text>
                <View style={styles.countryPickerContainer}>
                  <PhoneDigitInput
                    countryOptions={countryOptions}
                    selectedCountry={selectedCountry}
                    onCountryChange={handleCountryChange}
                    digits={phoneDigits}
                    onChangeDigits={handlePhoneChange}
                    disabled={loading || googleLoading}
                  />
                </View>
                <Text style={styles.helperText}>
                  {t('authScreens.login.fields.phoneHelper')}
                </Text>

                <TouchableOpacity
                  style={styles.loginButton}
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
                </TouchableOpacity>
              </>
            )}

            {/* Separador */}
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

            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => navigation.navigate('RegistrationCheckpoint')}
              disabled={loading || googleLoading}
            >
              <Text style={styles.registerButtonText}>
                {t('authScreens.login.buttons.register')}
              </Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: 'rgba(201, 201, 201, 1)',
  },
  bannerContainer: {
    width: '100%',
    height: 250,
    marginTop: 0,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  card: {
    flex: 1,
    marginTop: 5,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeader: {
    marginBottom: 16,
  },
  content: {
    flex: 1,
    padding: 18,
    justifyContent: 'center',
  },
  countryPickerContainer: {
    marginBottom: 14,
  },
  countryPicker: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#D4AF37' + '30',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  countryPickerItem: {
    fontSize: 15,
    color: colors.text,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#D4AF37',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    fontWeight: '500',
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
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 13,
    fontSize: 15,
    color: colors.text,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#D4AF37' + '30',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  phoneInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#D4AF37' + '50',
    textAlign: 'center',
    letterSpacing: 2,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  loginButton: {
    backgroundColor: '#D4AF37',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  loginButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  registerButton: {
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  registerButtonText: {
    color: '#D4AF37',
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
    backgroundColor: '#D4AF37' + '30',
  },
  dividerText: {
    marginHorizontal: 10,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    columnGap: 24,
  },
  tab: {
    paddingVertical: 4,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  tabActive: {
    // Mantener por compatibilidad, ya no se usa fondo para el tab activo
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: '#D4AF37',
  },
  tabUnderline: {
    marginTop: 2,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#D4AF37',
    alignSelf: 'stretch',
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 14,
    fontStyle: 'italic',
    marginTop: -8,
  },
});
