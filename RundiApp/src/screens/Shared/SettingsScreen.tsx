import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useFCM } from '../../context/FCMContext';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import TermsAndConditionsModal from '../../components/shared/TermsAndConditionsModal';
import phoneAuthService from '../../services/auth/phoneAuthService';
import BiometricService from '../../services/user/biometricService';
import { useTranslation } from 'react-i18next';
import { useLanguageStore } from '../../stores/languageStore';
import { SettingsAccountSection } from '../../components/shared/Settings/SettingsAccountSection';
import { SettingsConfigSection } from '../../components/shared/Settings/SettingsConfigSection';
import { SettingsLanguageSection } from '../../components/shared/Settings/SettingsLanguageSection';
import { SettingsPrivacySection } from '../../components/shared/Settings/SettingsPrivacySection';
import { SettingsAboutSection } from '../../components/shared/Settings/SettingsAboutSection';

const SETTINGS_FONT = '';

export default function SettingsScreen({ navigation }: any) {
  const { theme, setTheme, colors, isDark, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const { user, logout, logoutInProgress } = useAuth();
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM, sendTestNotification } = useFCM();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const language = useLanguageStore((s) => s.language);
  const deviceLanguage = useLanguageStore((s) => s.deviceLanguage);
  const preference = useLanguageStore((s) => s.preference);
  const changeLanguage = useLanguageStore((s) => s.changeLanguage);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [biometricUnlockAvailable, setBiometricUnlockAvailable] = useState(false);
  const [biometricUnlockEnabled, setBiometricUnlockEnabled] = useState(false);

  const notificationsEnabled = isFCMAvailable && hasPermission && isConfigured;

  useEffect(() => {
    void BiometricService.isAvailable().then(setBiometricUnlockAvailable);
    void BiometricService.isBiometricUnlockEnabled().then(setBiometricUnlockEnabled);
  }, []);

  const handleToggleBiometricUnlock = async (value: boolean) => {
    const result = value
      ? await BiometricService.authenticate(t('shared.biometricLock.promptReason'))
      : // Apagar el candado exige el mismo chequeo que la lock screen: sin
        // verificación no se toca la preferencia.
        await BiometricService.authenticateWithDeviceCredential(
          t('shared.biometricLock.disableReason'),
        );
    if (!result.success) {
      return;
    }
    await BiometricService.setBiometricUnlockEnabled(value);
    setBiometricUnlockEnabled(value);
  };

  const handleToggleNotifications = async (value: boolean) => {
    try {
      if (value) {
        if (!isFCMAvailable) {
          Alert.alert(t('settings.alerts.buildTitle'), t('settings.alerts.buildMessage'));
          return;
        }
        await configureFCM();
      } else if (notificationsEnabled) {
        Alert.alert(t('settings.alerts.disableTitle'), t('settings.alerts.disableMessage'));
      }
    } catch (error) {
      console.warn(t('settings.alerts.genericError'), error);
    }
  };

  const handleThemeChange = (value: 'light' | 'dark' | 'auto') => {
    setTheme(value);
  };

  const handleNavigateToAccount = () => {
    navigation.navigate('Account' as any);
  };

  const handleDeleteAccount = () => {
    navigation.navigate('DeleteAccount');
  };

  const handleOpenTerms = () => {
    setShowTermsModal(true);
  };

  const handleUpgradeToDriver = async () => {
    if (!user) {
      return;
    }

    if (user.role !== 'client') {
      Alert.alert(t('settings.alerts.notAvailableTitle'), t('settings.alerts.notAvailableMessage'));
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
      console.error('Error al enviar código SMS para upgrade a conductor:', error);
      Alert.alert(t('settings.alerts.smsErrorTitle'), error?.message || t('settings.alerts.smsErrorMessage'));
    }
  };

  const handleLogout = () => {
    if (logoutInProgress) {
      return;
    }
    Alert.alert(t('settings.actions.logoutTitle'), t('settings.actions.logoutMessage'), [
      { text: t('settings.actions.cancel'), style: 'cancel' },
      {
        text: t('settings.actions.confirm'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.replace('Login');
        },
      },
    ]);
  };

  const roleLabel = useMemo(() => {
    if (!user?.role) return t('settings.roles.default');
    const map: Record<string, string> = {
      driver: t('settings.roles.driver'),
      client: t('settings.roles.client'),
      designated_driver: t('settings.roles.designated_driver'),
      admin: t('settings.roles.admin'),
    };
    return map[user.role] || t('settings.roles.default');
  }, [user?.role, t]);

  const languageOptions = useMemo(
    () => [
      { value: 'device' as const, label: t('settings.language.deviceDefault', { language: languageName(deviceLanguage) }) },
      { value: 'en' as const, label: t('settings.language.options.en') },
      { value: 'es' as const, label: t('settings.language.options.es') },
      { value: 'zh' as const, label: t('settings.language.options.zh') },
    ],
    [deviceLanguage, t],
  );

  function languageName(code: string) {
    const map: Record<string, string> = {
      en: t('settings.language.options.en'),
      es: t('settings.language.options.es'),
      zh: t('settings.language.options.zh'),
    };
    return map[code] || code;
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#211A10' : 'rgba(204, 180, 136, 0.91)',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255, 255, 255, 0.26)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      backgroundColor: 'rgba(211, 153, 46, 0.94)',
      paddingVertical: 18,
      paddingHorizontal: 18,
      marginTop: insets.top + 8,
      marginHorizontal: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.24)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 8,
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontFamily: SETTINGS_FONT,
      fontSize: 24,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    headerSubtitle: {
      fontFamily: SETTINGS_FONT,
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.85)',
      marginTop: 3,
    },
    scrollContent: {
      paddingTop: 4,
      paddingBottom: insets.bottom + 32,
    },
    section: {
      marginTop: 16,
      marginHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 6,
    },
    sectionTitle: {
      fontFamily: SETTINGS_FONT,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 0.2,
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginBottom: 8,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    rowLast: {
      marginBottom: 4,
    },
    rowDisabled: {
      opacity: 0.5,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? 'rgba(201, 163, 90, 0.22)' : 'rgba(179, 135, 55, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    rowIconDanger: {
      backgroundColor: isDark ? 'rgba(239, 83, 80, 0.16)' : 'rgba(255, 68, 68, 0.10)',
    },
    rowBody: {
      flex: 1,
      marginRight: 8,
    },
    rowTitle: {
      fontFamily: SETTINGS_FONT,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    rowTitleDanger: {
      color: colors.error,
    },
    rowDescription: {
      fontFamily: SETTINGS_FONT,
      fontSize: 12.5,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },
    themeRow: {
      marginHorizontal: 12,
      marginBottom: 8,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    themeRowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    segmentedTrack: {
      flexDirection: 'row',
      marginTop: 12,
      padding: 3,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.06)',
    },
    segment: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontFamily: SETTINGS_FONT,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    segmentTextActive: {
      color: '#FFFFFF',
    },
    languageOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 12,
      marginTop: 2,
      marginBottom: 8,
    },
    languageButton: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    languageButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    languageButtonText: {
      fontFamily: SETTINGS_FONT,
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    languageButtonTextActive: {
      color: '#FFFFFF',
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#D64545',
      marginHorizontal: 16,
      marginTop: 24,
      marginBottom: 24,
      paddingVertical: 15,
      borderRadius: 16,
    },
    logoutButtonText: {
      fontFamily: SETTINGS_FONT,
      fontSize: 15.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });

  return (
    <View style={styles.container}>
      <LoadingOverlay visible={logoutInProgress} message={t('settings.loading.logout')} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('shared.paymentMethods.header.goBack')}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('settings.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {user?.name} • {roleLabel}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SettingsAccountSection
          userRole={user?.role}
          colors={colors}
          onNavigateToAccount={handleNavigateToAccount}
          onUpgradeToDriver={handleUpgradeToDriver}
          onDeleteAccount={handleDeleteAccount}
          t={t}
          styles={styles}
        />

        <SettingsConfigSection
          theme={theme}
          notificationsEnabled={notificationsEnabled}
          mapTrafficEnabled={mapTrafficEnabled}
          soundEnabled={soundEnabled}
          vibrationEnabled={vibrationEnabled}
          biometricUnlockAvailable={biometricUnlockAvailable}
          biometricUnlockEnabled={biometricUnlockEnabled}
          showBiometricUnlock={
            user?.role !== 'driver' && user?.role !== 'designated_driver'
          }
          colors={colors}
          onThemeChange={handleThemeChange}
          onToggleNotifications={handleToggleNotifications}
          onToggleTraffic={setMapTrafficEnabled}
          onToggleSoundVibration={(value) => {
            setSoundEnabled(value);
            setVibrationEnabled(value);
          }}
          onToggleBiometricUnlock={handleToggleBiometricUnlock}
          t={t}
          styles={styles}
        />

        <SettingsLanguageSection
          languageOptions={languageOptions}
          preference={preference}
          language={language}
          colors={colors}
          onChangeLanguage={changeLanguage}
          t={t}
          styles={styles}
        />

        <SettingsPrivacySection
          colors={colors}
          onOpenTerms={handleOpenTerms}
          t={t}
          styles={styles}
        />

        <SettingsAboutSection
          colors={colors}
          t={t}
          styles={styles}
        />

        <TouchableOpacity
          style={[styles.logoutButton, logoutInProgress && { opacity: 0.7 }]}
          onPress={handleLogout}
          disabled={logoutInProgress}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
          <Text style={styles.logoutButtonText}>{t('settings.actions.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <TermsAndConditionsModal
        visible={showTermsModal}
        requireCheck={false}
        showDocumentSelector
        defaultDocumentType="general"
        saving={false}
        acceptLabel={t('settings.actions.accept')}
        onAccept={() => setShowTermsModal(false)}
        onRequestClose={() => setShowTermsModal(false)}
      />
    </View>
  );
}
