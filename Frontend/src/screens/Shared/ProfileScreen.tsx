import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useFCM } from '../../context/FCMContext';
import { ProfileSkeleton } from '../../components/ui/SkeletonLoader';
import Button from '../../components/ui/Button';
import driversService from '../../services/driversService';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import phoneAuthService from '../../services/auth/phoneAuthService';
import { fetchDriverProfile } from '../../services/driverProfilesService';
import { useTranslation } from 'react-i18next';
import { ProfileHeader } from '../../components/shared/Profile/ProfileHeader';
import { ProfileModeSwitch } from '../../components/shared/Profile/ProfileModeSwitch';
import { ProfileConfigSection } from '../../components/shared/Profile/ProfileConfigSection';
import { ProfileLogoutAndInfo } from '../../components/shared/Profile/ProfileLogoutAndInfo';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, logoutInProgress, userMode, setUserMode } = useAuth();
  const { theme, setTheme, colors, mapTrafficEnabled, setMapTrafficEnabled } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
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

  const getVehicleTypeLabel = (type?: string | null) => {
    const normalized = type?.toLowerCase();
    switch (normalized) {
      case 'sedan':
        return t('shared.profile.vehicle.typeLabels.sedan');
      case 'suv':
        return t('shared.profile.vehicle.typeLabels.suv');
      case 'van':
        return t('shared.profile.vehicle.typeLabels.van');
      case 'moto':
      case 'motorcycle':
        return t('shared.profile.vehicle.typeLabels.moto');
      default:
        return normalized
          ? t('shared.profile.vehicle.typeLabels.other', { type })
          : t('shared.profile.vehicle.typeLabels.other', { type: t('shared.profile.vehicle.infoLabels.type') });
    }
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

  // Cargar perfil del conductor solo cuando el usuario es conductor y está en modo conductor
  useEffect(() => {
    const loadDriverProfile = async () => {
      if (isDriverCapable && userMode === 'driver' && user?.id) {
        await loadDriverProfileData();
      }
    };

    loadDriverProfile();
  }, [isDriverCapable, userMode, user]);

  const loadDriverProfileData = async () => {
    if (!user?.id) return;

    setLoadingProfile(true);
    try {
      // Obtener perfil del conductor autenticado
      const profile = await driversService.getMyDriverProfile();
      console.log('Perfil de conductor cargado:', profile);
      console.log('Datos del vehículo:', profile?.driver?.vehicle);
      setDriverProfile(profile);
    } catch (error) {
      console.error('Error cargando perfil de conductor:', error);
      setDriverProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

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
    <ScrollView style={styles.container}>
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
            onPress={isDriverCapable ? handleSwitchToDriverMode : handleUpgradeToDriver}
            styles={styles}
          />
        )}
        {/* Información del Vehículo (solo modo conductor) */}
        {false && userMode === 'driver' && isDriverCapable && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('shared.profile.vehicle.title')}</Text>
              <TouchableOpacity 
                style={styles.refreshIcon}
                onPress={loadDriverProfileData}
                disabled={loadingProfile}
              >
                <MaterialIcons name={loadingProfile ? 'hourglass-empty' : 'refresh'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            
            {loadingProfile ? (
              <View style={styles.loadingContainer}>
                <LoadingIcon size={20} color={colors.primary} />
                <Text style={styles.loadingText}>{t('shared.profile.loading.vehicle')}</Text>
                <Text style={styles.loadingSubtext}>{t('shared.profile.vehicle.loadingSubtitle')}</Text>
              </View>
            ) : driverProfile?.driver?.vehicle ? (
              <>
                {/* Mostrar un mensaje especial para conductores verificados */}
                {driverProfile.driver.status === 'verified' && (
                  <View style={styles.successCard}>
                    <MaterialIcons name="check-circle" size={32} color="#4CAF50" />
                    <View style={styles.successContent}>
                      <Text style={styles.successTitle}>{t('shared.profile.vehicle.successTitle')}</Text>
                      <Text style={styles.successText}>{t('shared.profile.vehicle.successText')}</Text>
                    </View>
                  </View>
                )}

                {/* Verificar si falta información importante Y no está verificado */}
                {driverProfile.driver.status !== 'verified' && 
                 (!driverProfile.driver.vehicle.vehicle_photo || 
                  (!driverProfile.driver.vehicle.registration_photo_front || !driverProfile.driver.vehicle.registration_photo_back) || 
                  !driverProfile.driver.vehicle.insurance_photo) && (
                  <View style={styles.warningCard}>
                    <MaterialIcons name="warning" size={32} color="#FF9800" />
                    <View style={styles.warningContent}>
                      <Text style={styles.warningTitle}>{t('shared.profile.vehicle.warningTitle')}</Text>
                      <Text style={styles.warningText}>{t('shared.profile.vehicle.warningText')}</Text>
                      {!driverProfile?.driver?.vehicle?.vehicle_photo && (
                        <Text style={styles.warningItem}>
                          {driverProfile?.driver?.vehicle?.type === 'moto'
                            ? t('shared.profile.vehicle.missingPhotoMoto')
                            : t('shared.profile.vehicle.missingPhotoCar')}
                        </Text>
                      )}
                      {(!driverProfile?.driver?.vehicle?.registration_photo_front || !driverProfile?.driver?.vehicle?.registration_photo_back) && (
                        <Text style={styles.warningItem}>{t('shared.profile.vehicle.missingRegistration')}</Text>
                      )}
                      {!driverProfile?.driver?.vehicle?.insurance_photo && (
                        <Text style={styles.warningItem}>{t('shared.profile.vehicle.missingInsurance')}</Text>
                      )}
                      <TouchableOpacity 
                        style={styles.completeButton}
                        onPress={() => navigation.navigate('CompleteVehicleInfo')}
                      >
                        <Text style={styles.completeButtonText}>{t('shared.profile.vehicle.completeButton')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}><MaterialIcons name="directions-car" size={16} color={colors.textSecondary} /> {t('shared.profile.vehicle.infoLabels.brand')}</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.brand}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}><MaterialIcons name="directions-car" size={16} color={colors.textSecondary} /> {t('shared.profile.vehicle.infoLabels.model')}</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.model}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}><MaterialIcons name="calendar-today" size={16} color={colors.textSecondary} /> {t('shared.profile.vehicle.infoLabels.year')}</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.year}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}><MaterialIcons name="palette" size={16} color={colors.textSecondary} /> {t('shared.profile.vehicle.infoLabels.color')}</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.color}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}><MaterialIcons name="pin" size={16} color={colors.textSecondary} /> {t('shared.profile.vehicle.infoLabels.plate')}</Text>
                    <Text style={styles.infoValue}>{driverProfile.driver.vehicle.plate}</Text>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}><MaterialIcons name="directions-car" size={16} color={colors.textSecondary} /> {t('shared.profile.vehicle.infoLabels.type')}</Text>
                    <Text style={styles.infoValue}>{getVehicleTypeLabel(driverProfile.driver.vehicle.type)}</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.warningCard}>
                <MaterialIcons name="warning" size={32} color="#FF9800" />
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>{t('shared.profile.vehicle.emptyTitle')}</Text>
                  <Text style={styles.warningText}>{t('shared.profile.vehicle.emptyText')}</Text>
                  <View style={styles.warningButtons}>
                    <TouchableOpacity 
                      style={styles.refreshButton}
                      onPress={loadDriverProfileData}
                      disabled={loadingProfile}
                    >
                      <Text style={styles.refreshButtonText}>
                        {loadingProfile ? `🔄 ${t('shared.profile.vehicle.refresh')}` : `🔄 ${t('shared.profile.vehicle.refresh')}`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.completeButton}
                      onPress={() => navigation.navigate('CompleteVehicleInfo')}
                    >
                      <Text style={styles.completeButtonText}>{t('shared.profile.vehicle.register')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
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
          onNavigateHelp={() => navigation.navigate('Help')}
          onNavigateSupport={handleGoToSupportComplaints}
          styles={styles}
          t={t}
        />

        <ProfileLogoutAndInfo onLogout={handleLogout} styles={styles} t={t} />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(204, 180, 136, 0.91)',
  },
  header: {
    backgroundColor: 'rgba(211, 153, 46, 0.81)',
    paddingVertical: 65,
    paddingHorizontal: 24,
    alignItems: 'stretch',
    marginBottom: -20,
    borderRadius: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  contentCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingBottom: 32,
    marginTop: -16,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    width: 24,
    height: 24,
   // tintColor: colors.card,
    resizeMode: 'contain',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
  },
  headerTopSpacer: {
    width: 36,
    height: 36,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#725dc0ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 1)',
    marginBottom: 4,
  },
  memberId: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 1)',
  },
  headerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  roleBadge: {
    backgroundColor: 'rgba(230, 230, 230, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
  },
  editProfileBadge: {
    backgroundColor: 'rgba(93, 95, 179, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    paddingLeft: 2,
    marginLeft: 6,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  editProfileText: {
    marginLeft: 12,
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    marginTop: 14,
    paddingHorizontal: 20,  
    paddingVertical: 14,
    
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: -20,
    padding: 12,
  },
  themeChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginLeft: 8,
  },
  themeChipActive: {
    backgroundColor: 'rgba(202, 151, 57, 1)',
    borderColor: 'rgba(209, 165, 84, 1)',
  },
  themeChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  themeChipTextActive: {
    color: '#ffffffff',
  },
  refreshIcon: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  refreshIconText: {
    fontSize: 16,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 2,
    textAlign: 'right',
  },
  infoValueSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    flex: 2,
    textAlign: 'right',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  warningCard: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 12,
    lineHeight: 20,
  },
  warningItem: {
    fontSize: 13,
    color: '#856404',
    marginLeft: 8,
    marginBottom: 4,
  },
  warningButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  successCard: {
    backgroundColor: '#D4EDDA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#C3E6CB',
  },
  successIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  successContent: {
    flex: 1,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#155724',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#155724',
    marginBottom: 12,
    lineHeight: 20,
  },
  completeButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    flex: 1,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modeUseTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  modeUseButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modeUseButtonDisabled: {
    opacity: 0.7,
  },
  modeUseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  optionCard: {
    paddingVertical: 24,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  optionIconImage: {
    width: 25,
    height: 25,
    marginRight: 14,
    resizeMode: 'contain',
    tintColor: colors.text,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  optionArrow: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  logoutContainer: {
    paddingHorizontal: 24,
    marginTop: 32,
    marginBottom: 24,
    alignItems: 'center',
    paddingVertical: 24,
  },
  logoutButton: {
    backgroundColor: colors.error,
  },
  appInfo: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  appVersion: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  appCopyright: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
