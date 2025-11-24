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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import phoneAuthService from '../../services/auth/phoneAuthService';
import alertService from '../../services/alertService';
import {
  CountryDialOption,
  formatPhoneNumber,
  getCountryDialOptions,
  normalizePhoneNumber,
  extractLocalNumber,
} from '../../utils/phoneUtils';

// Google Client ID desde variables de entorno
// Android Client ID para Expo
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '1040329608349-t11k2f7tu1gtrh8fpogu3n1gmf2gi8p3.apps.googleusercontent.com';

export default function LoginScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry = countryOptions.find((option) => option.code === 'NI') ?? countryOptions[0];
  const [selectedCountry, setSelectedCountry] = useState<CountryDialOption>(defaultCountry);
  const [phoneInput, setPhoneInput] = useState<string>(formatPhoneNumber('', defaultCountry.dialCode));
  const [normalizedPhone, setNormalizedPhone] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('email'); // 'email' o 'phone'
  const {
    promptAsync,
    loading: googleLoading,
    loginWithGoogle: googleLogin,
    getGoogleIdToken,
  } = useGoogleAuth(GOOGLE_CLIENT_ID);

  const handlePhoneChange = (text: string) => {
    const normalized = normalizePhoneNumber(text, selectedCountry.dialCode);
    setNormalizedPhone(normalized);
    const formatted = normalized
      ? formatPhoneNumber(normalized, selectedCountry.dialCode)
      : formatPhoneNumber(text, selectedCountry.dialCode);
    setPhoneInput(formatted || `${selectedCountry.dialCode} `);
  };

  const handleCountryChange = (countryCode: string) => {
    const nextCountry = countryOptions.find((option) => option.code === countryCode) ?? countryOptions[0];
    const localDigits = extractLocalNumber(normalizedPhone || phoneInput, selectedCountry.dialCode);
    const newNormalized = localDigits ? normalizePhoneNumber(localDigits, nextCountry.dialCode) : '';

    setSelectedCountry(nextCountry);
    setNormalizedPhone(newNormalized);
    setPhoneInput(
      newNormalized
        ? formatPhoneNumber(newNormalized, nextCountry.dialCode)
        : formatPhoneNumber('', nextCountry.dialCode)
    );
  };

  const handleLogin = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      alertService.showErrorAlert('Ingresa tu correo electrónico.');
      return;
    }

    if (!password.trim()) {
      alertService.showErrorAlert('Ingresa tu contraseña para continuar.');
      return;
    }

    setLoading(true);
    try {
      await login(normalizedEmail, password);
    } catch (error: any) {
      if (error?.code === 'SESSION_ACTIVE_ELSEWHERE') {
        return;
      }
      let message = 'Error al iniciar sesión. Intenta nuevamente.';
      const code = error?.code || '';

      switch (code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-email':
        case 'EMAIL_NOT_FOUND':
        case 'INVALID_PASSWORD':
          message = 'El correo o la contraseña no son correctos. Verifica e inténtalo otra vez.';
          break;
        case 'auth/too-many-requests':
          message = 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.';
          break;
        default:
          if (typeof error?.message === 'string') {
            if (error.message.toLowerCase().includes('password')) {
              message = 'El correo o la contraseña no coinciden con nuestros registros.';
            } else if (error.message.toLowerCase().includes('network')) {
              message = 'No pudimos conectarnos. Revisa tu conexión a internet e inténtalo nuevamente.';
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
    const normalized = normalizePhoneNumber(phoneInput, selectedCountry.dialCode);
    setNormalizedPhone(normalized);

    if (!normalized || !/^\+\d{6,15}$/.test(normalized)) {
      alertService.showErrorAlert('Por favor ingresa un número telefónico válido en formato internacional (+Código País)');
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
      alertService.showErrorAlert(error?.message || 'Error al solicitar código SMS');
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
        <View style={styles.content}>
          <Text style={styles.title}>Bienvenido</Text>
          <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

          {/* Tabs para cambiar entre Email y Teléfono */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, loginMode === 'email' && styles.tabActive]}
              onPress={() => setLoginMode('email')}
            >
              <Text style={[styles.tabText, loginMode === 'email' && styles.tabTextActive]}>
                📧 Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, loginMode === 'phone' && styles.tabActive]}
              onPress={() => setLoginMode('phone')}
            >
              <Text style={[styles.tabText, loginMode === 'phone' && styles.tabTextActive]}>
                📱 Teléfono
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            {loginMode === 'email' ? (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="tu@email.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Contraseña</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
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
                    {loading ? 'Iniciando...' : 'Iniciar Sesión'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>País y Código</Text>
                <View style={styles.countryPickerContainer}>
                  <Picker
                    selectedValue={selectedCountry.code}
                    onValueChange={handleCountryChange}
                    style={styles.countryPicker}
                    itemStyle={styles.countryPickerItem}
                  >
                    {countryOptions.map((option) => (
                      <Picker.Item
                        key={option.code}
                        label={`${option.name} (${option.dialCode})`}
                        value={option.code}
                      />
                    ))}
                  </Picker>
                </View>
                <Text style={styles.label}>Número Telefónico</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder={`${selectedCountry.dialCode} 12345678`}
                  placeholderTextColor={colors.textSecondary}
                  value={phoneInput}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                  maxLength={20}
                />
                <Text style={styles.helperText}>
                  Recibirás un código SMS para verificar tu identidad. Ingresa el número en formato internacional.
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
                    {loading ? 'Enviando...' : 'Enviar Código SMS'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Separador */}
            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>O</Text>
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
              onPress={() => navigation.navigate('RegisterNew')}
              disabled={loading || googleLoading}
            >
              <Text style={styles.registerButtonText}>
                ¿No tienes cuenta? Regístrate
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
    borderRadius: 12,
    backgroundColor: colors.card,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#D4AF37',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: colors.background,
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 14,
    fontStyle: 'italic',
    marginTop: -8,
  },
});
