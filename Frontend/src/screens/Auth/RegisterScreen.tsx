/**
 * Register Screen (Simplificado)
 * Pantalla de registro con datos básicos
 * Soporta Email/Password y Google Sign-In
 */

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
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../context/ThemeContext';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import registrationService from '../../services/registrationService';
import smsService from '../../services/smsService';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '1040329608349-t11k2f7tu1gtrh8fpogu3n1gmf2gi8p3.apps.googleusercontent.com';

export default function RegisterScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { promptAsync, loading: googleLoading } = useGoogleAuth(GOOGLE_CLIENT_ID);

  // Datos básicos
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+505');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'client' | 'driver'>('client');
  const [loading, setLoading] = useState(false);

  // Validaciones
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordsDontMatch = password && confirmPassword && password !== confirmPassword;
  // Email es opcional, pero teléfono es obligatorio
  const isFormValid = name && phone && password && passwordsMatch && role;

  const handleRegisterWithEmail = async () => {
    if (!isFormValid) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos (Nombre, Teléfono, Contraseña, Rol)');
      return;
    }

    // Validar email si se proporciona
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Error', 'Email inválido');
      return;
    }

    setLoading(true);
    try {
      console.log('📝 Iniciando registro con email/password...');

      // Validar formato de teléfono
      if (!smsService.validatePhoneFormat(phone)) {
        Alert.alert('Error', 'Formato de teléfono inválido. Usa +505 XXXX XXXX');
        setLoading(false);
        return;
      }

      // Guardar datos temporales
      await registrationService.saveTemporaryData({
        name,
        email,
        phone,
        password,
        role,
        authProvider: 'email/password',
        phoneVerified: false,
      });

      console.log('✅ Datos guardados, enviando SMS...');

      // Enviar código SMS
      const smsResult = await smsService.sendSmsCode(phone);

      if (!smsResult.success) {
        Alert.alert('Error', smsResult.message);
        setLoading(false);
        return;
      }

      Alert.alert('✅ Código enviado', `Se envió un código a ${phone}`);

      // Navegar a verificación de teléfono
      navigation.navigate('PhoneVerification', {
        name,
        email,
        phone,
        password,
        role,
        authProvider: 'email/password',
      });
    } catch (error: any) {
      console.error('Error en registro:', error);
      Alert.alert('Error', error.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterWithGoogle = async () => {
    try {
      console.log('🔐 Iniciando registro con Google...');

      // Validar campos requeridos
      if (!name || !phone || !role) {
        Alert.alert('Error', 'Por favor completa Nombre, Teléfono y Rol');
        return;
      }

      // Validar que el teléfono esté en formato correcto
      if (!smsService.validatePhoneFormat(phone)) {
        Alert.alert('Error', 'Formato de teléfono inválido. Usa +505 XXXX XXXX');
        return;
      }

      // Guardar datos temporales
      await registrationService.saveTemporaryData({
        name,
        email,
        phone,
        role,
        authProvider: 'google',
        phoneVerified: false,
      });

      console.log('✅ Datos guardados, enviando SMS...');

      // Enviar código SMS
      const smsResult = await smsService.sendSmsCode(phone);

      if (!smsResult.success) {
        Alert.alert('Error', smsResult.message);
        return;
      }

      Alert.alert('✅ Código enviado', `Se envió un código a ${phone}`);

      // Navegar a verificación de teléfono
      navigation.navigate('PhoneVerification', {
        name,
        email,
        phone,
        role,
        authProvider: 'google',
      });
    } catch (error: any) {
      console.error('Error en registro con Google:', error);
      Alert.alert('Error', error.message || 'Error al registrarse con Google');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Crear Cuenta</Text>
            <Text style={styles.subtitle}>
              Únete a DriveAngel.ni hoy
            </Text>
          </View>

          {/* Nombre */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nombre Completo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Tu nombre"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              editable={!loading && !googleLoading}
            />
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com (opcional)"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!loading && !googleLoading}
            />
          </View>

          {/* Teléfono */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Teléfono *</Text>
            <TextInput
              style={styles.input}
              placeholder="+505 XXXX XXXX"
              placeholderTextColor={colors.textSecondary}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!loading && !googleLoading}
            />
            <Text style={styles.helperText}>Formato: +505 XXXX XXXX</Text>
          </View>

          {/* Rol */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>¿Qué eres? *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={role}
                onValueChange={setRole}
                enabled={!loading && !googleLoading}
                style={styles.picker}
              >
                <Picker.Item label="👤 Cliente (Pasajero)" value="client" />
                <Picker.Item label="🚗 Conductor" value="driver" />
              </Picker>
            </View>
          </View>

          {/* Contraseña */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña *</Text>
            <TextInput
              style={styles.input}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading && !googleLoading}
            />
          </View>

          {/* Confirmar Contraseña */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirmar Contraseña *</Text>
            <TextInput
              style={[
                styles.input,
                passwordsDontMatch ? styles.inputError : {},
              ]}
              placeholder="Repite tu contraseña"
              placeholderTextColor={colors.textSecondary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading && !googleLoading}
            />
            {passwordsDontMatch && (
              <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
            )}
          </View>

          {/* Botón Registrarse */}
          <TouchableOpacity
            style={[styles.registerButton, (!isFormValid || loading) && styles.buttonDisabled]}
            onPress={handleRegisterWithEmail}
            disabled={!isFormValid || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.registerButtonText}>Registrarse con Email</Text>
            )}
          </TouchableOpacity>

          {/* Divisor */}
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>O</Text>
            <View style={styles.divider} />
          </View>

          {/* Google Sign-In */}
          <GoogleSignInButton
            onPress={handleRegisterWithGoogle}
            loading={googleLoading}
            disabled={!name || !phone || !role || loading}
          />

          {/* Login */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>¿Ya tienes cuenta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Inicia sesión</Text>
            </TouchableOpacity>
          </View>

          {/* Términos */}
          <Text style={styles.termsText}>
            Al registrarte, aceptas nuestros{' '}
            <Text style={styles.termsLink}>Términos de Servicio</Text> y{' '}
            <Text style={styles.termsLink}>Política de Privacidad</Text>
          </Text>

          {/* Progreso */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: '25%' }]} />
          </View>
          <Text style={styles.progressText}>Paso 1 de 4</Text>
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
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.error,
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: {
    color: colors.text,
  },
  registerButton: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    color: colors.textSecondary,
    fontSize: 14,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  loginText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  loginLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  progressContainer: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 24,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
