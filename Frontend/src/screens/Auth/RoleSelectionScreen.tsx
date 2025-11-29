/**
 * Role Selection Screen
 * Permite elegir entre Cliente o Conductor después de definir el método de registro
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import registrationService from '../../services/registrationService';
import phoneAuthService from '../../services/auth/phoneAuthService';
import { AuthStackParamList, RegistrationAuthProvider, RegistrationMethod } from '../../navigation/types';

export type RoleSelectionNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'RoleSelection'
>;

export type RoleSelectionRouteProp = RouteProp<AuthStackParamList, 'RoleSelection'>;

interface RoleSelectionScreenProps {
  navigation: RoleSelectionNavigationProp;
  route: RoleSelectionRouteProp;
}

const RoleSelectionScreen: React.FC<RoleSelectionScreenProps> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, registerWithGoogle, loginWithPhoneAndSMS } = useAuth();

  const {
    method,
    name,
    email,
    phone,
    password,
    authProvider,
    googleIdToken,
    phoneVerified,
  } = route.params;

  const [loadingRole, setLoadingRole] = useState<'client' | 'driver' | null>(null);

  const normalizeEmail = () => (email || '').trim();
  const normalizePhone = () => (phone || '').trim();

  const handleClientSelection = async () => {
    if (loadingRole) {
      return;
    }

    try {
      setLoadingRole('client');

      if (!name) {
        throw new Error('Falta el nombre completo del usuario');
      }

      const normalizedEmail = normalizeEmail() || undefined;
      const normalizedPhone = normalizePhone() || undefined;

      if (authProvider === 'email/password') {
        if (!normalizedEmail || !password) {
          throw new Error('Correo y contraseña son obligatorios para este método');
        }

        const result = await registrationService.createUser({
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          role: 'client',
          method: method as RegistrationMethod,
          authProvider: 'email/password',
          phoneVerified: Boolean(phoneVerified && normalizedPhone),
        });

        if (result.token) {
          await AsyncStorage.setItem('authToken', result.token);
        }

        await login(normalizedEmail, password);

        Alert.alert('✅ Registro completado', 'Bienvenido a Rundi');
        navigation.reset({ index: 0, routes: [{ name: 'ClientStack' as never }] });
        return;
      }

      const requiresVerifiedPhone = authProvider === 'phone';

      if (requiresVerifiedPhone && !normalizedPhone) {
        throw new Error('No se pudo obtener un número telefónico verificado.');
      }

      const result = await registrationService.createUser({
        name,
        email: normalizedEmail,
        phone: normalizedPhone,
        role: 'client',
        method,
        authProvider: authProvider as RegistrationAuthProvider,
        phoneVerified: requiresVerifiedPhone ? true : Boolean(phoneVerified && normalizedPhone),
        googleIdToken,
      });

      if (authProvider === 'google') {
        await registerWithGoogle(result.user, result.token);
      } else if (authProvider === 'phone' && normalizedPhone) {
        await loginWithPhoneAndSMS(
          {
            ...result.user,
            phone: normalizedPhone,
          },
          result.token
        );
      }

      Alert.alert('✅ Registro completado', 'Bienvenido a Rundi');
      navigation.reset({ index: 0, routes: [{ name: 'ClientStack' as never }] });
    } catch (error: any) {
      console.error('Error registrando cliente:', error);
      const message =
        error?.message?.includes('Network') || error?.message?.includes('timeout')
          ? 'No pudimos comunicarnos con el servidor. Verifica tu conexión e inténtalo de nuevo.'
          : error?.message || 'No se pudo completar el registro';
      Alert.alert('Error', message);
    } finally {
      setLoadingRole(null);
    }
  };
  const handleDriverSelection = async () => {
    if (loadingRole) {
      return;
    }

    try {
      setLoadingRole('driver');

      const normalizedEmail = normalizeEmail() || undefined;
      const normalizedPhone = normalizePhone() || undefined;

      if (!normalizedPhone) {
        navigation.navigate('DriverPhone', {
          name,
          email: normalizedEmail,
          phone: undefined,
          password,
          method: method as RegistrationMethod,
          authProvider: authProvider as RegistrationAuthProvider,
          googleIdToken,
        });

        return;
      }

      if (!phoneVerified) {
        try {
          await phoneAuthService.sendVerificationCode(normalizedPhone);
        } catch (error: any) {
          console.error('Error al enviar código SMS para conductor:', error);
          Alert.alert(
            'Error',
            error?.message || 'No se pudo enviar el código SMS. Intenta nuevamente.'
          );
          return;
        }

        navigation.navigate('PhoneVerification', {
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          method: method as RegistrationMethod,
          authProvider: authProvider as RegistrationAuthProvider,
          googleIdToken,
          role: 'driver',
          phoneVerified: false,
        });

        return;
      }

      navigation.navigate('DriverData', {
        name,
        email: normalizedEmail,
        phone: normalizedPhone,
        password,
        role: 'driver',
        method,
        authProvider,
        googleIdToken,
        phoneVerified: true,
      });
    } catch (error: any) {
      console.error('Error al preparar datos de conductor:', error);
      Alert.alert(
        'Error',
        error?.message || 'Ocurrió un problema al continuar con el registro de conductor.'
      );
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Selecciona tu rol</Text>
        <Text style={styles.subtitle}>
          Elige cómo deseas usar Rundi. Puedes registrarte como cliente o conductor.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Tu información</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Nombre:</Text>
          <Text style={styles.value}>{name}</Text>
        </View>
        {normalizeEmail() ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Correo:</Text>
            <Text style={styles.value}>{normalizeEmail()}</Text>
          </View>
        ) : null}
        {normalizePhone() ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Teléfono:</Text>
            <Text style={styles.value}>{normalizePhone()}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.label}>Método:</Text>
          <Text style={styles.value}>
            {method === 'email' && 'Email y contraseña'}
            {method === 'phone' && 'Teléfono (SMS)'}
            {method === 'google' && 'Google'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.optionButton, styles.clientButton]}
          onPress={handleClientSelection}
          disabled={loadingRole !== null}
        >
          {loadingRole === 'client' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.optionText}>Quiero ser Cliente</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionButton, styles.driverButton]}
          onPress={handleDriverSelection}
          disabled={loadingRole !== null}
        >
          {loadingRole === 'driver' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.optionText}>Quiero ser Conductor</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 24,
      gap: 24,
    },
    header: {
      gap: 8,
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
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    value: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    actions: {
      gap: 16,
    },
    optionButton: {
      paddingVertical: 18,
      borderRadius: 14,
      alignItems: 'center',
    },
    clientButton: {
      backgroundColor: colors.primary,
    },
    driverButton: {
      backgroundColor: colors.success,
    },
    optionText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });

export default RoleSelectionScreen;
