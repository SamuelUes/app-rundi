/**
 * Phone Verification Screen
 * Pantalla para validar número telefónico via SMS
 */

import React, { useEffect, useMemo, useState } from 'react';
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
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../context/ThemeContext';
import phoneAuthService from '../../services/auth/phoneAuthService';
import registrationService from '../../services/registrationService';
import { AuthStackParamList } from '../../navigation/types';

type PhoneVerificationNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'PhoneVerification'
>;

type PhoneVerificationRouteProp = RouteProp<AuthStackParamList, 'PhoneVerification'>;

interface Props {
  navigation: PhoneVerificationNavigationProp;
  route: PhoneVerificationRouteProp;
}

const MAX_ATTEMPTS = 3;

export default function PhoneVerificationScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    name,
    email,
    phone,
    password,
    method,
    authProvider,
    googleIdToken,
  } = route.params;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const handleVerifySuccess = async () => {
    try {
      await registrationService.saveTemporaryData({
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: true,
      });

      navigation.replace('RoleSelection', {
        method,
        name,
        email,
        phone,
        password,
        authProvider,
        googleIdToken,
        phoneVerified: true,
      });
    } catch (error: any) {
      console.error('❌ Error guardando datos verificados:', error);
      Alert.alert('Error', error.message || 'No se pudo continuar con el registro');
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Ingresa un código de 6 dígitos.');
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      Alert.alert('Error', 'Has alcanzado el número máximo de intentos.');
      return;
    }

    setLoading(true);
    try {
      await phoneAuthService.confirmVerificationCode(phone, code, {
        signOutAfterConfirm: true,
      });

      Alert.alert('✅ Teléfono verificado', 'Continuemos con tu registro.');
      await handleVerifySuccess();
    } catch (error: any) {
      console.error('❌ Error verificando código:', error);
      setAttempts((prev) => prev + 1);
      Alert.alert('Error', error.message || 'Código incorrecto');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    try {
      await phoneAuthService.sendVerificationCode(phone);
      Alert.alert('✅ Código reenviado', `Se envió un nuevo código a ${phone}`);
      setTimeLeft(60);
      setCode('');
      setAttempts(0);
    } catch (error: any) {
      console.error('❌ Error reenviando código:', error);
      Alert.alert('Error', error.message || 'No se pudo reenviar el código');
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
        <View style={styles.card}>
          <Text style={styles.title}>Verificar tu número</Text>
          <Text style={styles.subtitle}>
            Envía el código recibido para continuar con el registro.
          </Text>
          <Text style={styles.phoneNumber}>{phone}</Text>

          <View style={styles.codeSection}>
            <Text style={styles.label}>Código de verificación</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              editable={!loading}
            />
          </View>

          {attempts > 0 && (
            <View style={styles.attemptsWarning}>
              <Text style={styles.attemptsText}>
                Intentos restantes: {MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, (loading || code.length !== 6) && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Verificar código</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendSection}>
            <Text style={styles.resendText}>¿No recibiste el código?</Text>
            {timeLeft > 0 ? (
              <Text style={styles.resendTimer}>Reenviar en {timeLeft}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResendCode} disabled={resendLoading}>
                {resendLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.resendButton}>Reenviar código</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Recordatorio</Text>
            <Text style={styles.infoText}>• El código vence en 10 minutos.</Text>
            <Text style={styles.infoText}>
              • Dispones de {MAX_ATTEMPTS} intentos antes de bloquear el proceso.
            </Text>
            <Text style={styles.infoText}>
              • Verifica que el número mostrado sea correcto.
            </Text>
          </View>

          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Cambiar número</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      padding: 24,
      justifyContent: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    phoneNumber: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.primary,
    },
    codeSection: {
      marginTop: 12,
      gap: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    codeInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 24,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 8,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
    },
    attemptsWarning: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.error,
      backgroundColor: colors.error + '10',
      padding: 12,
    },
    attemptsText: {
      fontSize: 14,
      color: colors.error,
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    resendSection: {
      alignItems: 'center',
      gap: 8,
    },
    resendText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    resendTimer: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    resendButton: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
    },
    infoBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 16,
      gap: 4,
    },
    infoTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    backButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    backButtonText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
    },
  });
