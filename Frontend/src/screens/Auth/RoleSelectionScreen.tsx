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
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import registrationService from '../../services/auth/registrationService';
import phoneAuthService from '../../services/auth/phoneAuthService';
import { AuthStackParamList, RegistrationAuthProvider, RegistrationMethod } from '../../navigation/types';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const {
    method,
    name,
    email,
    phone,
    password,
    authProvider,
    googleIdToken,
    phoneVerified,
    emailVerified,
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
        throw new Error('MISSING_NAME');
      }

      const normalizedEmail = normalizeEmail() || undefined;
      const normalizedPhone = normalizePhone() || undefined;
      try {
        await registrationService.saveTemporaryData({
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          method: method as RegistrationMethod,
          authProvider: authProvider as RegistrationAuthProvider,
          googleIdToken,
          role: 'client',
          phoneVerified: Boolean(phoneVerified && normalizedPhone),
          emailVerified: Boolean(emailVerified && normalizedEmail),
          lastStep: 'roleSelection',
        });
      } catch (persistError) {
        console.warn('⚠️ No se pudo guardar rol cliente en checkpoint:', persistError);
      }

      if (authProvider === 'email/password') {
        if (!normalizedEmail || !password) {
          throw new Error('MISSING_EMAIL_PASSWORD');
        }

        if (!emailVerified) {
          navigation.navigate('EmailVerification', {
            name,
            email: normalizedEmail,
            phone: normalizedPhone,
            password,
            method,
            authProvider,
            googleIdToken,
            role: 'client',
            phoneVerified: Boolean(phoneVerified),
            emailVerified: Boolean(emailVerified),
            context: 'register_email',
          });
          return;
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
          emailVerified: true,
        });

        if (result.token) {
          await AsyncStorage.setItem('authToken', result.token);
        }

        await login(normalizedEmail, password);

        Alert.alert(
          t('authScreens.roleSelection.alerts.successTitle'),
          t('authScreens.roleSelection.alerts.successMessage'),
        );
        return;
      }

      const requiresVerifiedPhone = authProvider === 'phone';
      const requiresVerifiedEmail = authProvider === 'google' && Boolean(normalizedEmail);

      if (requiresVerifiedPhone && !normalizedPhone) {
        throw new Error('MISSING_VERIFIED_PHONE');
      }

      if (requiresVerifiedEmail && !emailVerified && normalizedEmail) {
        navigation.navigate('EmailVerification', {
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          method,
          authProvider,
          googleIdToken,
          role: 'client',
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          context: authProvider === 'google' ? 'register_google' : 'register_email',
        });
        return;
      }

      const result = await registrationService.createUser({
        name,
        email: normalizedEmail,
        phone: normalizedPhone,
        role: 'client',
        method,
        authProvider: authProvider as RegistrationAuthProvider,
        phoneVerified: requiresVerifiedPhone ? true : Boolean(phoneVerified && normalizedPhone),
        emailVerified: requiresVerifiedEmail ? Boolean(emailVerified) : undefined,
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

      Alert.alert(
        t('authScreens.roleSelection.alerts.successTitle'),
        t('authScreens.roleSelection.alerts.successMessage'),
      );
    } catch (error: any) {
      console.error('Error registrando cliente:', error);
      let message: string;
      switch (error?.message) {
        case 'MISSING_NAME':
          message = t('authScreens.roleSelection.alerts.missingName');
          break;
        case 'MISSING_EMAIL_PASSWORD':
          message = t('authScreens.roleSelection.alerts.missingEmailPassword');
          break;
        case 'MISSING_VERIFIED_PHONE':
          message = t('authScreens.roleSelection.alerts.missingVerifiedPhone');
          break;
        default:
          if (error?.message?.includes('Network') || error?.message?.includes('timeout')) {
            message = t('authScreens.roleSelection.alerts.networkError');
          } else {
            message = error?.message || t('authScreens.roleSelection.alerts.genericError');
          }
      }
      Alert.alert(t('authScreens.roleSelection.alerts.errorTitle'), message);
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
      try {
        await registrationService.saveTemporaryData({
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          method: method as RegistrationMethod,
          authProvider: authProvider as RegistrationAuthProvider,
          googleIdToken,
          role: 'driver',
          phoneVerified: Boolean(phoneVerified && normalizedPhone),
          emailVerified: Boolean(emailVerified && normalizedEmail),
          lastStep: 'roleSelection',
        });
      } catch (persistError) {
        console.warn('⚠️ No se pudo guardar rol conductor en checkpoint:', persistError);
      }

      if ((authProvider === 'email/password' || authProvider === 'google') && normalizedEmail && !emailVerified) {
        navigation.navigate('EmailVerification', {
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
          method,
          authProvider,
          googleIdToken,
          role: 'driver',
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          context: authProvider === 'google' ? 'register_google' : 'register_email',
        });
        return;
      }

      if (!normalizedPhone && authProvider === 'phone') {
        navigation.navigate('DriverPhone', {
          name,
          email: normalizedEmail,
          phone: undefined,
          password,
          method: method as RegistrationMethod,
          authProvider: authProvider as RegistrationAuthProvider,
          googleIdToken,
          emailVerified: Boolean(emailVerified),
        });

        return;
      }

      if (!phoneVerified && normalizedPhone && !emailVerified) {
        try {
          await phoneAuthService.sendVerificationCode(normalizedPhone);
        } catch (error: any) {
          console.error('Error al enviar código SMS para conductor:', error);
          Alert.alert(
            t('authScreens.roleSelection.alerts.errorTitle'),
            error?.message || t('authScreens.roleSelection.alerts.smsSendError'),
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
          emailVerified: Boolean(emailVerified),
        });

        return;
      }

      navigation.navigate('DriverData', {
        name,
        email: normalizedEmail,
        phone: normalizedPhone || '',
        password,
        role: 'driver',
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: Boolean(emailVerified),
      });
    } catch (error: any) {
      console.error('Error al preparar datos de conductor:', error);
      Alert.alert(
        t('authScreens.roleSelection.alerts.errorTitle'),
        error?.message || t('authScreens.roleSelection.alerts.driverFlowError'),
      );
    } finally {
      setLoadingRole(null);
    }
  };

  const methodLabel = (() => {
    if (method === 'email') {
      return t('authScreens.roleSelection.methodLabels.email');
    }
    if (method === 'phone') {
      return t('authScreens.roleSelection.methodLabels.phone');
    }
    return t('authScreens.roleSelection.methodLabels.google');
  })();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('authScreens.roleSelection.header.title')}</Text>
        <Text style={styles.subtitle}>
          {t('authScreens.roleSelection.header.subtitle')}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          {t('authScreens.roleSelection.section.title')}
        </Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>
            {`${t('authScreens.roleSelection.section.nameLabel')}:`}
          </Text>
          <Text style={styles.value}>{name}</Text>
        </View>
        {normalizeEmail() ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>
              {`${t('authScreens.roleSelection.section.emailLabel')}:`}
            </Text>
            <Text style={styles.value}>{normalizeEmail()}</Text>
          </View>
        ) : null}
        {normalizePhone() ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>
              {`${t('authScreens.roleSelection.section.phoneLabel')}:`}
            </Text>
            <Text style={styles.value}>{normalizePhone()}</Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.label}>
            {`${t('authScreens.roleSelection.section.methodLabel')}:`}
          </Text>
          <Text style={styles.value}>{methodLabel}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.optionButton, styles.clientButton]}
          onPress={handleClientSelection}
          disabled={loadingRole !== null}
        >
          {loadingRole === 'client' ? (
            <LoadingIcon size={24} color="#FFFFFF" />
          ) : (
            <Text style={styles.optionText}>
              {t('authScreens.roleSelection.buttons.client')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionButton, styles.driverButton]}
          onPress={handleDriverSelection}
          disabled={loadingRole !== null}
        >
          {loadingRole === 'driver' ? (
            <LoadingIcon size={24} color="#FFFFFF" />
          ) : (
            <Text style={styles.optionText}>
              {t('authScreens.roleSelection.buttons.driver')}
            </Text>
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
      marginTop: 40,
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
      backgroundColor: '#6e44ff',
    },
    optionText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });

export default RoleSelectionScreen;
