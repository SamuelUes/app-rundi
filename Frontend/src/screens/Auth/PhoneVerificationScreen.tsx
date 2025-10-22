/**
 * Phone Verification Screen
 * Pantalla para validar número telefónico via SMS
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
import smsService from '../../services/smsService';

export default function PhoneVerificationScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  
  // Datos del registro anterior
  const { name, email, phone, password, role, authProvider } = route.params || {};
  
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

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
      console.log('🔐 Verificando código:', code);
      
      // Llamar a servicio SMS para validar código
      const result = await smsService.verifyCode(phone, code);
      
      if (!result.success) {
        // Código inválido
        setAttempts(attempts + 1);
        Alert.alert('Error', result.message);
        setCode('');
        return;
      }

      // Código válido
      Alert.alert('✅ Éxito', 'Número verificado correctamente');
      
      // Navegar según el rol
      if (role === 'driver') {
        // Para conductores, ir a pantalla de datos del conductor
        navigation.navigate('DriverData', {
          name,
          email,
          phone,
          password,
          role,
          authProvider,
          phoneVerified: true,
        });
      } else {
        // Para clientes, crear usuario directamente
        navigation.navigate('RegisterConfirm', {
          name,
          email,
          phone,
          password,
          role,
          authProvider,
          phoneVerified: true,
        });
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
      console.log('📱 Reenviando código a:', phone);
      
      // Llamar a servicio SMS para reenviar código
      const result = await smsService.resendCode(phone);
      
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      
      Alert.alert('✅ Código reenviado', `Se envió un nuevo código a ${phone}`);
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
            <Text style={styles.phoneNumber}>{phone}</Text>
          </View>

          {/* Código Input */}
          <View style={styles.codeSection}>
            <Text style={styles.label}>Código de Verificación (6 dígitos)</Text>
            <TextInput
              style={styles.codeInput}
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
});
