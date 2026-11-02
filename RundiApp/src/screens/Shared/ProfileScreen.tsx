import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useFCM } from '../../context/FCMContext';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import phoneAuthService from '../../services/auth/phoneAuthService';
import { fetchDriverProfile } from '../../services/driver/driverProfilesService';
import { useTranslation } from 'react-i18next';
import { createStyles } from './ProfileScreen.styles';
import { ProfileHeader } from '../../components/shared/Profile/ProfileHeader';
import { ProfileModeSwitch } from '../../components/shared/Profile/ProfileModeSwitch';
import { ProfileConfigSection } from '../../components/shared/Profile/ProfileConfigSection';
import { ProfileLogoutAndInfo } from '../../components/shared/Profile/ProfileLogoutAndInfo';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, logoutInProgress, userMode, setUserMode } = useAuth();
  const { theme, setTheme, colors, isDark, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM } = useFCM();
  const notificationsEnabled = isFCMAvailable && hasPermission && isConfigured;
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
  const [switchingToDriver, setSwitchingToDriver] = useState(false);
  const { t } = useTranslation();

  const handleGoToSupportComplaints = () => {
    navigation.navigate('SupportComplaints');
  };

  const headerTitle = t('shared.profile.header.title');
  const headerEditLabel = t('shared.profile.header.edit');
  const userIdLabel = t('shared.profile.header.userId', { id: user?.id ?? '' });
  const roleLabel =
    user?.role === 'driver' || user?.role === 'designated_driver'
      ? t('shared.profile.header.role.driver')
      : t('shared.profile.header.role.client');
  const modeTitle = isDriverCapable ? t('shared.profile.mode.titleDriver') : t('shared.profile.mode.titleClient');
  const modeDescription = isDriverCapable
    ? t('shared.profile.mode.descriptionDriver')
    : t('shared.profile.mode.descriptionClient');
  const modeButtonLabel = switchingToDriver
    ? t('shared.profile.mode.switching')
    : isDriverCapable
    ? t('shared.profile.mode.buttonDriver')
    : t('shared.profile.mode.buttonClient');

  const handleToggleNotifications = async (value: boolean) => {
    try {
      if (value) {
        if (!isFCMAvailable) {
          Alert.alert(t('shared.profile.alerts.buildTitle'), t('shared.profile.alerts.buildMessage'));
          return;
        }
        await configureFCM();
      } else if (notificationsEnabled) {
        Alert.alert(t('shared.profile.alerts.disableTitle'), t('shared.profile.alerts.disableMessage'));
      }
    } catch (error) {
      console.warn('Error actualizando notificaciones', error);
    }
  };

  const handleThemeChange = (value: 'light' | 'dark' | 'auto') => {
    setTheme(value);
  };

  const checkDriverApprovalForModeSwitch = async (driverId: string) => {
    try {
      const profile = await fetchDriverProfile(driverId, { forceRefresh: true });
      if (!profile) {
        return null;
      }

      const rawAccountStatus = String(
        (profile as any)?.account_status || (profile as any)?.status || '',
      ).toLowerCase();

      const accountActive = ['active', 'verified', 'approved'].includes(rawAccountStatus);

      const rawDocumentsStatus = String((profile as any)?.documents_status || '').toLowerCase();
      const documentsVerified = ['verified', 'active', 'approved'].includes(rawDocumentsStatus);

      const vehicles: any[] | undefined = (profile as any)?.vehicles;
      const hasActiveVehicle = Array.isArray(vehicles)
        ? vehicles.some((v) => v && (v.isActive === true || (v as any).is_active === true))
        : false;

      return {
        allowed: accountActive && documentsVerified && hasActiveVehicle,
        accountActive,
        documentsVerified,
        hasActiveVehicle,
      };
    } catch (error) {
      console.error('Error verificando aprobación de conductor desde perfil:', error);
      return null;
    }
  };

  const handleUpgradeToDriver = async () => {
    if (!user) {
      return;
    }

    if (user.role !== 'client') {
      Alert.alert(
        t('shared.profile.alerts.upgradeNotAvailableTitle'),
        t('shared.profile.alerts.upgradeNotAvailableMessage'),
      );
      return;
    }

    const name = user.name || '';
    const email = user.email || '';
    const phone = user.phone || '';
    const normalizedPhone = phone.trim();

    try {
      if (normalizedPhone) {
        await phoneAuthService.sendVerificationCode(normalizedPhone);

        navigation.navigate('PhoneVerification', {
          name,
          email,
          phone: normalizedPhone,
          password: undefined,
          method: 'phone',
          authProvider: 'phone',
          googleIdToken: undefined,
          role: 'driver',
          phoneVerified: false,
          context: 'register_upgrade_driver',
        });
      } else {
        navigation.navigate('DriverPhone', {
          name,
          email,
          phone: undefined,
          password: undefined,
          method: 'phone',
          authProvider: 'phone',
          googleIdToken: undefined,
          context: 'register_upgrade_driver',
        });
      }
    } catch (error: any) {
      console.error('Error al enviar código SMS para upgrade a conductor desde perfil:', error);
      Alert.alert(
        t('shared.profile.alerts.smsErrorTitle'),
        error?.message || t('shared.profile.alerts.smsErrorMessage'),
      );
    }
  };

  const handleSwitchToDriverMode = async () => {
    if (!user || switchingToDriver) {
      return;
    }

    if (!isDriverCapable) {
      await handleUpgradeToDriver();
      return;
    }

    try {
      setSwitchingToDriver(true);

      const approval = user.id ? await checkDriverApprovalForModeSwitch(user.id) : null;

      if (approval && !approval.allowed) {
        const reasons: string[] = [];

        if (!approval.accountActive) {
          reasons.push(t('shared.profile.alerts.driverModeReasons.accountInactive'));
        }
        if (!approval.documentsVerified) {
          reasons.push(t('shared.profile.alerts.driverModeReasons.documentsPending'));
        }
        if (!approval.hasActiveVehicle) {
          reasons.push(t('shared.profile.alerts.driverModeReasons.vehicleMissing'));
        }

        Alert.alert(
          t('shared.profile.alerts.driverModeBlockedTitle'),
          `${reasons.join('\n')}\n\n${t('shared.profile.alerts.driverModeFooter')}`,
        );
        return;
      }

      await setUserMode('driver');
    } catch (error: any) {
      console.error('Error cambiando a modo conductor desde perfil:', error);
      Alert.alert('Error', t('shared.profile.alerts.driverModeError'));
    } finally {
      setSwitchingToDriver(false);
    }
  };

  const handleLogout = () => {
    if (logoutInProgress) {
      return;
    }
    Alert.alert(t('shared.profile.alerts.logoutTitle'), t('shared.profile.alerts.logoutMessage'), [
      { text: t('shared.profile.alerts.logoutCancel'), style: 'cancel' },
      {
        text: t('shared.profile.alerts.logoutConfirm'),
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text>{t('shared.profile.messages.noUser')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LoadingOverlay visible={logoutInProgress} message={t('shared.profile.loading.logout')} />
      <ProfileHeader
        headerTitle={headerTitle}
        headerEditLabel={headerEditLabel}
        userIdLabel={userIdLabel}
        roleLabel={roleLabel}
        userName={user.name}
        userEmail={user.email}
        onBack={() => {
          if (navigation.canGoBack && navigation.canGoBack()) {
            navigation.goBack();
          } else if (userMode === 'driver') {
            navigation.navigate('DriverHome');
          } else {
            navigation.navigate('ClientHome');
          }
        }}
        onEditProfile={() => navigation.navigate('Account')}
        styles={styles}
      />

      <View style={styles.contentCard}>
        {userMode === 'client' && (
          <ProfileModeSwitch
            modeTitle={modeTitle}
            modeDescription={modeDescription}
            modeButtonLabel={modeButtonLabel}
            switchingToDriver={switchingToDriver}
            isDriverCapable={isDriverCapable}
            colors={colors}
            onPress={isDriverCapable ? handleSwitchToDriverMode : handleUpgradeToDriver}
            styles={styles}
          />
        )}

        <ProfileConfigSection
          theme={theme}
          notificationsEnabled={notificationsEnabled}
          mapTrafficEnabled={mapTrafficEnabled}
          soundEnabled={soundEnabled}
          vibrationEnabled={vibrationEnabled}
          colors={colors}
          onThemeChange={handleThemeChange}
          onToggleNotifications={handleToggleNotifications}
          onToggleTraffic={setMapTrafficEnabled}
          onToggleSounds={(value) => {
            setSoundEnabled(value);
            setVibrationEnabled(value);
          }}
          onNavigateSettings={() => navigation.navigate('Settings')}
          onNavigateRideHistory={() => navigation.navigate('RideHistory')}
          onNavigatePayments={() => navigation.navigate('PaymentMethods')}
          onNavigateHelp={() => navigation.navigate('Help')}
          onNavigateSupport={handleGoToSupportComplaints}
          styles={styles}
          t={t}
        />

        <ProfileLogoutAndInfo onLogout={handleLogout} styles={styles} t={t} />

        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
}
