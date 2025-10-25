/**
 * Phone Verification Login Screen
 * Pantalla para validar número telefónico via SMS durante login
 * Reutiliza la lógica de PhoneVerificationScreen pero para login en lugar de registro
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import phoneLoginService from '../../services/phoneLoginService';

export default function PhoneVerificationLoginScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { loginWithPhoneAndSMS } = useAuth();
  
  // Datos del login anterior
  const phoneFromRoute = route.params?.phone || '';
  
  const [code, setCode] = useState('');
  const [phoneInput, setPhoneInput] = useState('+505 ');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

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
    setPhoneInput(formatted);
  };

  // Temporizador para reenviar código
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Por favor ingresa un código de 6 dígitos');
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert('Error', 'Demasiados intentos. Por favor intenta más tarde.');
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Verificando código para login:', code);
      
      // Llamar a servicio para verificar código y hacer login
      const result = await phoneLoginService.verifyCodeAndLogin(phoneFromRoute, code);
      
      if (!result.success) {
        // Código inválido
        setAttempts(attempts + 1);
        Alert.alert('Error', result.message || 'Código inválido');
        setCode('');
        return;
      }

      // Código válido - hacer login
      console.log('✅ Código verificado, iniciando sesión...');
      
      // Usar el método de login del contexto de autenticación
      if (result.user && result.token) {
        await loginWithPhoneAndSMS(result.user, result.token);
        
        Alert.alert('✅ Éxito', 'Sesión iniciada correctamente');
        // La navegación se maneja automáticamente en el contexto de autenticación
      } else {
        throw new Error('No se recibieron datos de usuario');
      }
    } catch (error: any) {
      console.error('Error verificando código:', error);
      setAttempts(attempts + 1);
      Alert.alert('Error', error.message || 'Error al verificar código');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    try {
      console.log('📱 Reenviando código a:', phoneFromRoute);
      
      // Llamar a servicio SMS para reenviar código
      const result = await phoneLoginService.resendLoginCode(phoneFromRoute);
      
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      
      Alert.alert('✅ Código reenviado', `Se envió un nuevo código a ${phoneFromRoute}`);
      setTimeLeft(60);
      setCode('');
      setAttempts(0);
    } catch (error: any) {
      console.error('Error reenviando código:', error);
      Alert.alert('Error', error.message || 'Error al reenviar código');
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
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Verificar Número</Text>
            <Text style={styles.subtitle}>
              Hemos enviado un código SMS a:
            </Text>
            <Text style={styles.phoneNumber}>{phoneFromRoute}</Text>
          </View>

          {/* Editar Número Telefónico */}
          <View style={styles.phoneEditSection}>
            <Text style={styles.label}>Editar número (opcional)</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="+505 XXXX XXXX"
              placeholderTextColor={colors.textSecondary}
              value={phoneInput}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              editable={!loading}
              maxLength={17} // +505 XXXX XXXX = 17 caracteres
            />
            <Text style={styles.phoneFormatHint}>Formato: +505 XXXX XXXX</Text>
          </View>

          {/* Código Input */}
          <View style={styles.codeSection}>
            <Text style={styles.label}>Código de Verificación (6 dígitos)</Text>
            
            {/* Input oculto para capturar el texto */}
            <TextInput
              style={styles.hiddenInput}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              value={code}
              onChangeText={(text) => {
                // Solo permitir números
                const numericText = text.replace(/[^0-9]/g, '').slice(0, 6);
                setCode(numericText);
              }}
              keyboardType="numeric"
              maxLength={6}
              editable={!loading}
            />
            
            {/* Casillas visuales para cada dígito */}
            <View style={styles.codeBoxesContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.codeBox,
                    code.length > index && styles.codeBoxFilled,
                  ]}
                >
                  <Text style={styles.codeBoxText}>
                    {code[index] || ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Intentos restantes */}
          {attempts > 0 && (
            <View style={styles.attemptsWarning}>
              <Text style={styles.attemptsText}>
                Intentos restantes: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}
              </Text>
            </View>
          )}

          {/* Botón Verificar */}
          <TouchableOpacity
            style={[styles.verifyButton, loading && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.verifyButtonText}>Verificar Código</Text>
            )}
          </TouchableOpacity>

          {/* Reenviar Código */}
          <View style={styles.resendSection}>
            <Text style={styles.resendText}>¿No recibiste el código?</Text>
            {timeLeft > 0 ? (
              <Text style={styles.resendTimer}>
                Reenviar en {timeLeft}s
              </Text>
            ) : (
              <TouchableOpacity
                onPress={handleResendCode}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.resendButton}>Reenviar Código</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Información */}
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>💡 Información</Text>
            <Text style={styles.infoText}>
              • El código es válido por 10 minutos
            </Text>
            <Text style={styles.infoText}>
              • Tienes {MAX_ATTEMPTS} intentos para ingresar el código
            </Text>
            <Text style={styles.infoText}>
              • Verifica que el número sea correcto
            </Text>
          </View>

          {/* Botón Volver */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Volver</Text>
          </TouchableOpacity>
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
    marginBottom: 40,
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
    marginBottom: 12,
  },
  phoneNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
  },
  codeSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  codeInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attemptsWarning: {
    backgroundColor: colors.error + '20',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  attemptsText: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '600',
  },
  verifyButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resendSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  resendText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  resendTimer: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  resendButton: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 18,
  },
  backButton: {
    padding: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  phoneEditSection: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phoneInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 2,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    marginVertical: 10,
  },
  phoneFormatHint: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  codeBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  codeBox: {
    width: '15%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  codeBoxText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
});
