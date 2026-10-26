import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { AnimatedCard } from '../../components/ui/AnimatedCard';
import { AnimatedButton } from '../../components/ui/AnimatedButton';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import registrationService from '../../services/auth/registrationService';
import { setRegistrationUploadsInProgress } from '../../services/proximityService';
import { AuthStackParamList, RegistrationAuthProvider, RegistrationMethod } from '../../navigation/types';
import { useTranslation } from 'react-i18next';

type RegistrationCheckpointNavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'RegistrationCheckpoint'
>;

type RegistrationCheckpointRouteProp = RouteProp<AuthStackParamList, 'RegistrationCheckpoint'>;

type Props = {
  navigation: RegistrationCheckpointNavigationProp;
  route: RegistrationCheckpointRouteProp;
};

type RegistrationLastStep =
  | 'register'
  | 'emailVerification'
  | 'roleSelection'
  | 'googlePhone'
  | 'driverPhone'
  | 'phoneVerification'
  | 'driverData'
  | 'registerConfirm';

type StepIconSpec =
  | { family: 'ionicons'; name: React.ComponentProps<typeof Ionicons>['name'] }
  | { family: 'material'; name: React.ComponentProps<typeof MaterialIcons>['name'] };

type TempRegistrationData = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: 'client' | 'driver';
  method?: RegistrationMethod;
  authProvider?: RegistrationAuthProvider;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  googleIdToken?: string;
  lastStep?: RegistrationLastStep;
  driverData?: any;
  vehicleData?: any;
};

const RegistrationCheckpointScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const readableGold = isDark ? '#E8C46A' : '#76520F';
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [startingOver, setStartingOver] = useState(false);
  const [tempData, setTempData] = useState<TempRegistrationData | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = (await registrationService.getTemporaryData()) as TempRegistrationData;
        const hasData = data && Object.keys(data).length > 0 && data.name;

        if (!hasData) {
          navigation.replace('RegisterNew');
          return;
        }

        setTempData(data);
      } catch (error) {
        navigation.replace('RegisterNew');
        return;
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigation]);

  const resolveStepLabel = (data: TempRegistrationData | null): string => {
    const step = data?.lastStep;

    if (!step) {
      return t('authScreens.registrationCheckpoint.stepLabels.default');
    }

    if (step === 'register') {
      if (data?.method === 'google') {
        return t('authScreens.registrationCheckpoint.stepLabels.register.google');
      }
      if (data?.method === 'phone') {
        return t('authScreens.registrationCheckpoint.stepLabels.register.phone');
      }
      return t('authScreens.registrationCheckpoint.stepLabels.register.default');
    }

    if (step === 'googlePhone') {
      return t('authScreens.registrationCheckpoint.stepLabels.googlePhone');
    }

    if (step === 'driverPhone') {
      return t('authScreens.registrationCheckpoint.stepLabels.driverPhone');
    }

    if (step === 'emailVerification') {
      return t('authScreens.registrationCheckpoint.stepLabels.emailVerification');
    }

    if (step === 'phoneVerification') {
      if (data?.role === 'driver') {
        return t('authScreens.registrationCheckpoint.stepLabels.phoneVerification.driver');
      }
      return t('authScreens.registrationCheckpoint.stepLabels.phoneVerification.default');
    }

    if (step === 'driverData') {
      return t('authScreens.registrationCheckpoint.stepLabels.driverData');
    }

    if (step === 'roleSelection') {
      return t('authScreens.registrationCheckpoint.stepLabels.roleSelection');
    }

    if (step === 'registerConfirm') {
      return t('authScreens.registrationCheckpoint.stepLabels.registerConfirm');
    }

    return t('authScreens.registrationCheckpoint.stepLabels.default');
  };

  const resolveStepIcon = (
    data: TempRegistrationData | null,
  ): StepIconSpec => {
    switch (data?.lastStep) {
      case 'roleSelection':
        return { family: 'material', name: 'alt-route' };
      case 'googlePhone':
        return { family: 'ionicons', name: 'phone-portrait' };
      case 'driverPhone':
        return { family: 'material', name: 'contactless' };
      case 'phoneVerification':
        return { family: 'material', name: 'sms' };
      case 'emailVerification':
        return { family: 'ionicons', name: 'mail-outline' };
      case 'driverData':
        return { family: 'ionicons', name: 'car-sport' };
      case 'registerConfirm':
        return { family: 'ionicons', name: 'flag' };
      case 'register':
        return { family: 'material', name: 'edit-note' };
      default:
        return { family: 'ionicons', name: 'location' };
    }
  };

  const isDriverDataComplete = (driverData?: any, vehicleData?: any) => {
    if (!driverData || !vehicleData) {
      return false;
    }

    const licenseComplete =
      Boolean(driverData.licenseNumber) &&
      Boolean(driverData.licenseExpiry) &&
      Boolean(driverData.department) &&
      Boolean(driverData.municipality) &&
      Boolean(driverData.profilePhoto) &&
      Boolean(driverData.licensePhotoFront) &&
      Boolean(driverData.licensePhotoBack);

    const vehicleComplete =
      Boolean(vehicleData.plate) &&
      Boolean(vehicleData.brand) &&
      Boolean(vehicleData.model) &&
      Boolean(vehicleData.year) &&
      Boolean(vehicleData.color) &&
      Boolean(vehicleData.type) &&
      Boolean(vehicleData.insurancePhoto) &&
      Boolean(vehicleData.registrationPhotoFront) &&
      Boolean(vehicleData.registrationPhotoBack);

    return licenseComplete && vehicleComplete;
  };

  const confirmStartOver = async () => {
    setStartingOver(true);

    try {
      await registrationService.discardPendingRegistration();
    } catch (error) {
      console.warn('⚠️ Error descartando el registro pendiente:', error);
    }

    try {
      await setRegistrationUploadsInProgress(false);
    } catch (error) {
      console.warn('⚠️ No se pudo limpiar el flag de uploads de registro:', error);
    }

    navigation.replace('RegisterNew');
  };

  const handleStartOver = () => {
    Alert.alert(
      t('authScreens.registrationCheckpoint.startOverConfirm.title'),
      t('authScreens.registrationCheckpoint.startOverConfirm.message'),
      [
        {
          text: t('authScreens.registrationCheckpoint.startOverConfirm.cancel'),
          style: 'cancel',
        },
        {
          text: t('authScreens.registrationCheckpoint.startOverConfirm.confirm'),
          style: 'destructive',
          onPress: () => {
            void confirmStartOver();
          },
        },
      ],
    );
  };

  const handleContinue = () => {
    if (!tempData) {
      navigation.replace('RegisterNew');
      return;
    }

    const {
      name,
      email,
      phone,
      password,
      role,
      method,
      authProvider,
      googleIdToken,
      phoneVerified,
      emailVerified,
      driverData,
      vehicleData,
      lastStep,
    } = tempData;

    if (!name || !method || !authProvider) {
      navigation.replace('RegisterNew');
      return;
    }

    const step: RegistrationLastStep = lastStep || 'register';

    if (step === 'register') {
      if ((authProvider === 'email/password' || authProvider === 'google') && email && !emailVerified) {
        navigation.replace('EmailVerification', {
          name,
          email,
          phone,
          password,
          role,
          method,
          authProvider,
          googleIdToken,
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          context: authProvider === 'google' ? 'register_google' : 'register_email',
        });
        return;
      }

      if (method === 'phone' && phone && !phoneVerified) {
        navigation.replace('PhoneVerification', {
          name,
          email,
          phone,
          password,
          method,
          authProvider,
          googleIdToken,
          role,
          phoneVerified: Boolean(phoneVerified),
        });
        return;
      }

      navigation.replace('RoleSelection', {
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: Boolean(emailVerified),
      });
      return;
    }

    if (step === 'roleSelection') {
      if ((authProvider === 'email/password' || authProvider === 'google') && email && !emailVerified) {
        navigation.replace('EmailVerification', {
          name,
          email,
          phone,
          password,
          role,
          method,
          authProvider,
          googleIdToken,
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          context: authProvider === 'google' ? 'register_google' : 'register_email',
        });
        return;
      }

      if (method === 'phone' && phone && !phoneVerified) {
        navigation.replace('PhoneVerification', {
          name,
          email,
          phone,
          password,
          method,
          authProvider,
          googleIdToken,
          role,
          phoneVerified: Boolean(phoneVerified),
        });
        return;
      }

      navigation.replace('RoleSelection', {
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: Boolean(emailVerified),
      });
      return;
    }

    if (step === 'googlePhone') {
      if (!phone || !googleIdToken) {
        navigation.replace('RegisterNew');
        return;
      }

      if (email && !emailVerified) {
        navigation.replace('EmailVerification', {
          name,
          email,
          phone,
          password,
          role,
          method,
          authProvider,
          googleIdToken,
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          context: 'register_google',
        });
        return;
      }

      navigation.replace('PhoneVerification', {
        name,
        email,
        phone,
        method: 'phone',
        authProvider: 'google',
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: Boolean(emailVerified),
      });
      return;
    }

    if (step === 'driverPhone') {
      if (!phone) {
        navigation.replace('DriverPhone', {
          name,
          email,
          phone: undefined,
          password,
          method,
          authProvider,
          googleIdToken,
          emailVerified: Boolean(emailVerified),
        });
        return;
      }

      navigation.replace('PhoneVerification', {
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        role: 'driver',
        phoneVerified: Boolean(phoneVerified),
        emailVerified: Boolean(emailVerified),
      });
      return;
    }

    if (step === 'phoneVerification') {
      if (role === 'driver') {
        if (!phone) {
          navigation.replace('DriverPhone', {
            name,
            email,
            phone: undefined,
            password,
            method,
            authProvider,
            googleIdToken,
            emailVerified: Boolean(emailVerified),
          });
          return;
        }

        navigation.replace('DriverData', {
          name,
          email,
          phone,
          password,
          role: 'driver',
          method,
          authProvider,
          googleIdToken,
          phoneVerified: true,
          emailVerified: Boolean(emailVerified),
        });
        return;
      }

      navigation.replace('RoleSelection', {
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: true,
        emailVerified: Boolean(emailVerified),
      });
      return;
    }

    if (step === 'emailVerification') {
      if (!email) {
        navigation.replace('RegisterNew');
        return;
      }

      navigation.replace('RoleSelection', {
        name,
        email,
        phone,
        password,
        method,
        authProvider,
        googleIdToken,
        phoneVerified: Boolean(phoneVerified),
        emailVerified: true,
      });
      return;
    }

    if (step === 'driverData') {
      if (role === 'driver' && phone) {
        const complete = isDriverDataComplete(driverData, vehicleData);
        if (complete) {
          navigation.replace('RegisterConfirm', {
            name,
            email,
            phone,
            password,
            role: 'driver',
            method,
            authProvider,
            googleIdToken,
            phoneVerified: Boolean(phoneVerified),
            emailVerified: Boolean(emailVerified),
            driverData,
            vehicleData,
          });
          return;
        }

        navigation.replace('DriverData', {
          name,
          email,
          phone,
          password,
          role: 'driver',
          method,
          authProvider,
          googleIdToken,
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          driverData,
          vehicleData,
          context: 'register_driver',
        });
        return;
      }

      navigation.replace('RegisterNew');
      return;
    }

    if (step === 'registerConfirm') {
      if (role === 'driver' && phone) {
        const complete = isDriverDataComplete(driverData, vehicleData);
        if (!complete) {
          navigation.replace('DriverData', {
            name,
            email,
            phone,
            password,
            role: 'driver',
            method,
            authProvider,
            googleIdToken,
            phoneVerified: Boolean(phoneVerified),
            emailVerified: Boolean(emailVerified),
            driverData,
            vehicleData,
            context: 'register_driver',
          });
          return;
        }

        navigation.replace('RegisterConfirm', {
          name,
          email,
          phone,
          password,
          role: 'driver',
          method,
          authProvider,
          googleIdToken,
          phoneVerified: Boolean(phoneVerified),
          emailVerified: Boolean(emailVerified),
          driverData,
          vehicleData,
        });
        return;
      }

      navigation.replace('RegisterNew');
      return;
    }

    navigation.replace('RegisterNew');
  };

  if (loading || !tempData) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
      </View>
    );
  }

  const stepLabel = resolveStepLabel(tempData);
  const stepIcon = resolveStepIcon(tempData);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <AnimatedCard style={styles.card}>
          <Text style={styles.title}>{t('authScreens.registrationCheckpoint.title')}</Text>
          <Text style={styles.subtitle}>
            {t('authScreens.registrationCheckpoint.subtitle', { name: tempData.name ?? '' })}
          </Text>

          <View style={styles.marker}>
            <View style={styles.markerDot} />
            <View style={styles.markerLine} />
            <View style={styles.markerBadge}>
              {stepIcon.family === 'material' ? (
                <MaterialIcons name={stepIcon.name} size={26} color={readableGold} />
              ) : (
                <Ionicons name={stepIcon.name} size={26} color={readableGold} />
              )}
            </View>
          </View>

          <Text style={styles.stepLabel}>{stepLabel}</Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {t('authScreens.registrationCheckpoint.info')}
            </Text>
          </View>

          <AnimatedCard delay={140} style={styles.actions}>
            <AnimatedButton
              title={t('authScreens.registrationCheckpoint.buttons.continue')}
              onPress={handleContinue}
              size="large"
              iconName="arrow-forward"
              color={colors.primary}
              style={styles.actionButton}
              textStyle={styles.actionButtonText}
              disabled={startingOver}
            />
            <AnimatedButton
              title={t('authScreens.registrationCheckpoint.buttons.startOver')}
              onPress={handleStartOver}
              size="large"
              variant="outline"
              iconName="restart-alt"
              color={readableGold}
              style={styles.actionButton}
              textStyle={styles.actionButtonText}
              loading={startingOver}
            />
          </AnimatedCard>
        </AnimatedCard>
      </View>
    </SafeAreaView>
  );
};

export default RegistrationCheckpointScreen;

const createStyles = (colors: any, isDark: boolean) => {
  const readableGold = isDark ? '#E8C46A' : '#76520F';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    card: {
      width: '100%',
      borderRadius: 28,
      paddingVertical: 32,
      paddingHorizontal: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 10,
      elevation: 6,
    },
    marker: {
      alignItems: 'center',
      marginTop: 4,
      marginBottom: 2,
    },
    markerDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(212, 175, 55, 0.45)',
    },
    markerLine: {
      width: 0,
      height: 22,
      borderLeftWidth: 2,
      borderStyle: 'dashed',
      borderColor: 'rgba(212, 175, 55, 0.4)',
      marginVertical: 4,
    },
    markerBadge: {
      width: 62,
      height: 62,
      borderRadius: 31,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.16)' : 'rgba(212, 175, 55, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(212, 175, 55, 0.4)',
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: readableGold,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    stepLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    infoBox: {
      width: '100%',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginTop: 4,
    },
    infoText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actions: {
      width: '100%',
      gap: 12,
      marginTop: 10,
    },
    actionButton: {
      borderRadius: 22,
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: '700',
    },
  });
};
