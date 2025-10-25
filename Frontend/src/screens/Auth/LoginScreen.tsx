import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import GoogleSignInButton from '../../components/GoogleSignInButton';

// Google Client ID desde variables de entorno
// Android Client ID para Expo
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '1040329608349-t11k2f7tu1gtrh8fpogu3n1gmf2gi8p3.apps.googleusercontent.com';

export default function LoginScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+505 ');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'email' | 'phone'>('email'); // 'email' o 'phone'
  const { promptAsync, loading: googleLoading, loginWithGoogle: googleLogin } = useGoogleAuth(GOOGLE_CLIENT_ID);

  // Función para formatear teléfono: +505 XXXX XXXX
  const formatPhoneNumber = (text: string) => {
    // Remover todo excepto números
    const cleaned = text.replace(/\D/g, '');
    
    // Si comienza con 505, mantenerlo, sino agregarlo
    let formatted = cleaned.startsWith('505') ? cleaned : '505' + cleaned;
    
    // Limitar a 11 dígitos (505 + 8 dígitos)
    formatted = formatted.slice(0, 11);
    
    // Formatear como +505 XXXX XXXX
    if (formatted.length <= 3) {
      return '+' + formatted;
    } else if (formatted.length <= 7) {
      return '+' + formatted.slice(0, 3) + ' ' + formatted.slice(3);
    } else {
      return '+' + formatted.slice(0, 3) + ' ' + formatted.slice(3, 7) + ' ' + formatted.slice(7);
    }
  };

  const handlePhoneChange = (text: string) => {
    const formatted = formatPhoneNumber(text);
    setPhone(formatted);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneLogin = async () => {
    if (!phone) {
      Alert.alert('Error', 'Por favor ingresa tu número telefónico');
      return;
    }

    setLoading(true);
    try {
      console.log('📱 Solicitando código SMS para:', phone);
      
      // Importar servicio
      const phoneLoginService = (await import('../../services/phoneLoginService')).default;
      
      // Solicitar código
      const result = await phoneLoginService.requestLoginCode(phone);
      
      if (result.success) {
        // Navegar a pantalla de verificación
        navigation.navigate('PhoneVerificationLogin', {
          phone,
          mode: 'login', // Indicar que es para login, no registro
        });
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al solicitar código SMS');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      console.log('🔐 Iniciando Google Sign-In...');
      
      const result = await promptAsync();
      
      if (result?.type === 'success') {
        console.log('✅ Google Sign-In exitoso');
        const { id_token } = result.params;
        
        if (!id_token) {
          throw new Error('No se recibió ID Token de Google');
        }
        
        console.log('🔄 Iniciando sesión con Firebase...');
        const userData = await googleLogin(id_token);
        
        console.log('💾 Guardando datos de usuario...');
        await loginWithGoogle(userData);
        
        console.log('✅ Login completado, navegando a HomeScreen');
        // La navegación se maneja automáticamente en el contexto de autenticación
      } else if (result?.type === 'cancel') {
        console.log('❌ Usuario canceló Google Sign-In');
        // No mostrar alerta, es una acción esperada del usuario
      } else {
        throw new Error('Error desconocido en Google Sign-In');
      }
    } catch (error: any) {
      console.error('❌ Error en Google Login:', error);
      Alert.alert(
        'Error',
        error.message || 'Error al iniciar sesión con Google. Intenta de nuevo.'
      );
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
                <Text style={styles.label}>Número Telefónico</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="+505 XXXX XXXX"
                  placeholderTextColor={colors.textSecondary}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                  maxLength={17}
                />

                <Text style={styles.helperText}>
                  Recibirás un código SMS para verificar tu identidad
                </Text>

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handlePhoneLogin}
                  disabled={loading || googleLoading || phone.length < 17}
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
