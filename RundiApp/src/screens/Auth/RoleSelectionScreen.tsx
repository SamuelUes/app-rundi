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
  Pressable,
  Alert,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { AnimatedCard } from '../../components/ui/AnimatedCard';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
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
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
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

  const identityCaption = [methodLabel, normalizeEmail() || normalizePhone()]
    .filter(Boolean)
    .join(' · ');
  const nameInitial = (name || '?').trim().charAt(0).toUpperCase();

  const clientAccent = isDark ? '#E8C46A' : '#76520F';
  const clientTint = isDark ? 'rgba(212, 175, 55, 0.12)' : 'rgba(179, 135, 55, 0.10)';
  const driverAccent = isDark ? '#A78BFA' : '#6E44FF';
  const driverTint = isDark ? 'rgba(167, 139, 250, 0.14)' : 'rgba(110, 68, 255, 0.08)';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {navigation.canGoBack() ? (
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            disabled={loadingRole !== null}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.actions.back')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.content}>
        <AnimatedCard style={styles.header} delay={0}>
          <Text style={styles.title}>{t('authScreens.roleSelection.header.title')}</Text>
          <Text style={styles.subtitle}>
            {t('authScreens.roleSelection.header.subtitle')}
          </Text>
        </AnimatedCard>

        <View style={styles.options}>
          <AnimatedCard delay={120}>
            <RoleOptionCard
              icon={{ family: 'material', name: 'hail' }}
              accent={clientAccent}
              tint={clientTint}
              title={t('authScreens.roleSelection.options.client.title')}
              description={t('authScreens.roleSelection.options.client.description')}
              loading={loadingRole === 'client'}
              muted={loadingRole !== null && loadingRole !== 'client'}
              onPress={handleClientSelection}
              colors={colors}
              styles={styles}
            />
          </AnimatedCard>

          <AnimatedCard delay={200}>
            <RoleOptionCard
              icon={{ family: 'ionicons', name: 'car-sport' }}
              accent={driverAccent}
              tint={driverTint}
              title={t('authScreens.roleSelection.options.driver.title')}
              description={t('authScreens.roleSelection.options.driver.description')}
              loading={loadingRole === 'driver'}
              muted={loadingRole !== null && loadingRole !== 'driver'}
              onPress={handleDriverSelection}
              colors={colors}
              styles={styles}
            />
          </AnimatedCard>
        </View>

        <AnimatedCard delay={300} style={styles.identityWrap}>
          <View style={styles.identityCard}>
            <View style={styles.identityAvatar}>
              <Text style={styles.identityInitial}>{nameInitial}</Text>
            </View>
            <View style={styles.identityTextWrap}>
              <Text style={styles.identityName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.identityCaption} numberOfLines={1}>
                {identityCaption}
              </Text>
            </View>
          </View>
        </AnimatedCard>
      </View>
    </SafeAreaView>
  );
};

type RoleIconSpec =
  | { family: 'ionicons'; name: React.ComponentProps<typeof Ionicons>['name'] }
  | { family: 'material'; name: React.ComponentProps<typeof MaterialIcons>['name'] };

type RoleOptionCardProps = {
  icon: RoleIconSpec;
  accent: string;
  tint: string;
  title: string;
  description: string;
  loading: boolean;
  muted: boolean;
  onPress: () => void;
  colors: any;
  styles: any;
};

const RoleOptionCard: React.FC<RoleOptionCardProps> = ({
  icon,
  accent,
  tint,
  title,
  description,
  loading,
  muted,
  onPress,
  colors,
  styles,
}) => (
  <Pressable
    onPress={onPress}
    disabled={muted || loading}
    accessibilityRole="button"
    accessibilityLabel={title}
    style={({ pressed }) => [
      styles.roleCard,
      pressed && { backgroundColor: tint, borderColor: accent },
      muted && styles.roleCardMuted,
    ]}
  >
    <View style={[styles.roleIconWrap, { backgroundColor: tint }]}>
      {loading ? (
        <LoadingIcon size={22} color={accent} />
      ) : icon.family === 'material' ? (
        <MaterialIcons name={icon.name} size={26} color={accent} />
      ) : (
        <Ionicons name={icon.name} size={26} color={accent} />
      )}
    </View>
    <View style={styles.roleTextWrap}>
      <Text style={styles.roleTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.roleDescription} numberOfLines={2}>{description}</Text>
    </View>
    <Ionicons name="chevron-forward" size={22} color={colors.textTertiary} />
  </Pressable>
);

const createStyles = (colors: any, isDark: boolean) => {
  const readableGold = isDark ? '#E8C46A' : '#76520F';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topBar: {
      paddingHorizontal: 24,
      paddingTop: 4,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingBottom: 12,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    header: {
      gap: 6,
      marginTop: 4,
      alignItems: 'center',
      top: -80,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: readableGold,
      letterSpacing: 0.2,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
    options: {
      gap: 14,
      marginTop: 26,
      top: -50,
    },
    roleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderRadius: 20,
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    roleCardMuted: {
      opacity: 0.45,
    },
    roleIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roleTextWrap: {
      flex: 1,
      gap: 3,
    },
    roleTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    roleDescription: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    identityWrap: {
      marginTop: 24,
    },
    identityCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    identityAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.16)' : 'rgba(212, 175, 55, 0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityInitial: {
      fontSize: 16,
      fontWeight: '700',
      color: readableGold,
    },
    identityTextWrap: {
      flex: 1,
      gap: 2,
    },
    identityName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    identityCaption: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
};

export default RoleSelectionScreen;
