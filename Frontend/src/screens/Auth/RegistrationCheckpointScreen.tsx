import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import registrationService from '../../services/auth/registrationService';
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
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

  const handleStartOver = async () => {
    try {
      await registrationService.clearTemporaryData();
    } catch (error) {}

    navigation.replace('RegisterNew');
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
      </View>
    );
  }

  if (!tempData) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
      </View>
    );
  }

  const stepLabel = resolveStepLabel(tempData);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('authScreens.registrationCheckpoint.title')}</Text>
        <Text style={styles.subtitle}>
          {t('authScreens.registrationCheckpoint.subtitle', { name: tempData.name ?? '' })}
        </Text>
        <Text style={styles.stepLabel}>{stepLabel}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {t('authScreens.registrationCheckpoint.info')}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
            <Text style={styles.primaryButtonText}>
              {t('authScreens.registrationCheckpoint.buttons.continue')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleStartOver}>
            <Text style={styles.secondaryButtonText}>
              {t('authScreens.registrationCheckpoint.buttons.startOver')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default RegistrationCheckpointScreen;

const createStyles = (colors: any) => {
  const gold = '#D4AF37';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    card: {
      width: '100%',
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: gold,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 12,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actions: {
      width: '100%',
      gap: 10,
      marginTop: 8,
    },
    primaryButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    secondaryButtonText: {
      color: gold,
      fontSize: 15,
      fontWeight: '600',
    },
  });
};
