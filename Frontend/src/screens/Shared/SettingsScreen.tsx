import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFCM } from '../../context/FCMContext';
import LoadingOverlay from '../../components/LoadingOverlay';
import TermsAndConditionsModal from '../../components/TermsAndConditionsModal';
import phoneAuthService from '../../services/auth/phoneAuthService';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../context/LanguageContext';

const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button2x.png');

export default function SettingsScreen({ navigation }: any) {
  const { theme, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const { user, logout, logoutInProgress } = useAuth();
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM, sendTestNotification } = useFCM();
  const { t } = useTranslation();
  const { language, deviceLanguage, preference, changeLanguage } = useLanguage();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const notificationsEnabled = isFCMAvailable && hasPermission && isConfigured;

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
      backgroundColor: colors.background,
    },
      backButton: {
    width: 50,
    height: 50,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonIcon: {
    width: 35,
    height: 35,
  },
    header: {
      backgroundColor: colors.card,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginTop: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    section: {
      marginTop: 20,
      paddingVertical: 8,
    },
    notificationCard: {
      backgroundColor: colors.card,
      marginHorizontal: 20,
      marginBottom: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    notificationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    notificationDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      maxWidth: '85%',
    },
    notificationStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
    },
    statusIndicator: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: '#FF9800',
    },
    statusIndicatorActive: {
      backgroundColor: '#4CAF50',
    },
    statusIndicatorText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    notificationStatusText: {
      flex: 1,
      marginLeft: 12,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    noteBox: {
      marginTop: 16,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    noteTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    noteText: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    notificationButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    notificationButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
    },
    notificationButtonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
    },
    notificationButtonSecondaryText: {
      color: colors.primary,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      paddingHorizontal: 20,
      paddingVertical: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLast: {
      marginBottom: 20,
    },
    optionLeft: {
      flex: 1,
      marginRight: 12,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    optionDescription: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    themeOptions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    themeButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    themeButtonActive: {
      backgroundColor: '#2196F3',
      borderColor: '#2196F3',
    },
    themeButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    themeButtonTextActive: {
      color: '#FFFFFF',
    },
    languageOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 20,
      marginTop: 8,
      marginBottom: 12,
    },
    languageButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    languageButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    languageButtonText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    languageButtonTextActive: {
      color: '#FFFFFF',
    },
    arrow: {
      fontSize: 24,
      color: colors.textSecondary,
    },
    logoutButton: {
      backgroundColor: colors.error,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 40,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    logoutButtonText: {
      fontSize: 16,
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
          <Image source={BACK_BUTTON_ICON} style={styles.backButtonIcon} resizeMode="contain" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('settings.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {user?.name} • {roleLabel}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.sections.account')}</Text>

          <TouchableOpacity style={styles.option} onPress={handleNavigateToAccount}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>{t('settings.account.title')}</Text>
              <Text style={styles.optionDescription}>{t('settings.account.description')}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          {user?.role === 'client' && (
            <TouchableOpacity style={styles.option} onPress={handleUpgradeToDriver}>
              <View style={styles.optionLeft}>
                <Text style={styles.optionTitle}>{t('settings.account.upgradeTitle')}</Text>
                <Text style={styles.optionDescription}>{t('settings.account.upgradeDescription')}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={handleDeleteAccount}>
            <View style={styles.optionLeft}>
              <Text style={[styles.optionTitle, { color: colors.error }]}>{t('settings.account.deleteTitle')}</Text>
              <Text style={styles.optionDescription}>{t('settings.account.deleteDescription')}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.sections.privacy')}</Text>

          <TouchableOpacity style={styles.option}>
            <Text style={styles.optionTitle}>{t('settings.privacy.policy')}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, styles.optionLast]} onPress={handleOpenTerms}>
            <Text style={styles.optionTitle}>{t('settings.privacy.terms')}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.sections.language')}</Text>
          <View style={[styles.option, styles.optionLast]}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>{t('settings.language.title')}</Text>
              <Text style={styles.optionDescription}>{t('settings.language.description')}</Text>
            </View>
          </View>
          <View style={styles.languageOptions}>
            {languageOptions.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.languageButton,
                  (preference === option.value || (option.value !== 'device' && language === option.value)) &&
                    styles.languageButtonActive,
                ]}
                onPress={() => changeLanguage(option.value)}
              >
                <Text
                  style={[
                    styles.languageButtonText,
                    (preference === option.value || (option.value !== 'device' && language === option.value)) &&
                      styles.languageButtonTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.sections.about')}</Text>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>{t('settings.about.version')}</Text>
              <Text style={styles.optionDescription}>{t('settings.about.versionValue')}</Text>
            </View>
          </View>

          <View style={styles.option}>
            <View style={styles.optionLeft}>
              <Text style={styles.optionTitle}>{t('settings.about.domain')}</Text>
              <Text style={styles.optionDescription}>{t('settings.about.domainValue')}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.option, styles.optionLast]}>
            <Text style={styles.optionTitle}>{t('settings.about.licenses')}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.logoutButton, logoutInProgress && { opacity: 0.7 }]} onPress={handleLogout} disabled={logoutInProgress}>
          <Text style={styles.logoutButtonText}>{t('settings.actions.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <TermsAndConditionsModal
        visible={showTermsModal}
        requireCheck={false}
        saving={false}
        acceptLabel={t('settings.actions.accept')}
        onAccept={() => setShowTermsModal(false)}
        onRequestClose={() => setShowTermsModal(false)}
      />
    </View>
  );
}
