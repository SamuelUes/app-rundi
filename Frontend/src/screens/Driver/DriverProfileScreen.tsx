import React, { useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Animated,
  Switch,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { safeFormatDate } from '../../utils/safeFormatters';
import { ensureVehicleIconSource } from '../../utils/vehicleIcons';
import { useTranslation } from 'react-i18next';
import { useDriverProfile } from '../../hooks/driver/DriverProfileScreen/useDriverProfile';
import { useDriverEarnings } from '../../hooks/driver/EarningsScreen/useDriverEarnings';
import { useOverlayPreference } from '../../hooks/shared/overlay/useOverlayPreference';
import { useVehicleForm } from '../../hooks/driver/DriverProfileScreen/useVehicleForm';
import { useDriverPhoto } from '../../hooks/driver/DriverProfileScreen/useDriverPhoto';
import { useDriverProfileDerived } from '../../hooks/driver/DriverProfileScreen/useDriverProfileDerived';
import { useDriverProfileHandlers } from '../../hooks/driver/DriverProfileScreen/useDriverProfileHandlers';
import { formatCurrency, isVehicleComplete } from '../../utils/driverProfileHelpers';
import { createStyles } from './DriverProfileScreen.styles';
import { AddVehicleModal } from '../../components/driver/AddVehicleModal';
import { DriverProfileHeader } from '../../components/driver/DriverProfileHeader';
import { DriverProfileStats } from '../../components/driver/DriverProfileStats';

export default function DriverProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user, userMode, setUserMode } = useAuth();
  const { settings: voiceSettings, setEnabled: setVoiceAssistantEnabled, initialized: voiceAssistantInitialized } = useVoiceAssistant();

  const {
    loading,
    vehicles,
    setVehicles,
    driverData,
    stats: profileStats,
    profilePhoto,
    setProfilePhoto,
    selectedVehicleId,
    setSelectedVehicleId,
    designatedDriverRequestStatus,
    setDesignatedDriverRequestStatus,
    loadDriverData,
    loadDesignatedDriverStatus,
    loadSelectedVehicle,
  } = useDriverProfile(user?.id);

  const {
    dailyStats,
    stats: earningsStats,
    loadEarningsStats,
  } = useDriverEarnings();

  const {
    overlayToggleEnabled,
    setOverlayToggleEnabled,
    overlayPermissionGranted,
    overlayCheckingPermission,
    loadOverlayPreference,
    handleOverlayToggle,
  } = useOverlayPreference(t);

  const stats = { ...profileStats, ...earningsStats };

  const { uploadingPhoto, handleUploadPhoto } = useDriverPhoto(user?.id, setProfilePhoto, t);

  const {
    showAddVehicleModal,
    setShowAddVehicleModal,
    vehicleFormData,
    setVehicleFormData,
    addingVehicle,
    handleAddVehicle,
    handleSwitchVehicle,
  } = useVehicleForm(vehicles, selectedVehicleId, setSelectedVehicleId, setVehicles, loadDriverData, navigation, t);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const {
    normalizedDocumentStatus,
    normalizedAccountStatus,
    isDriverCapable,
    hasActiveVehicle,
    completeDocs,
    driverLicenseExpiry,
    documentStatusColor,
    documentStatusIconName,
    documentStatusText,
    documentButtonLabel,
    displayName,
    displayEmail,
    isDesignatedRequestPending,
    isDesignatedDriverApproved,
    isDesignatedRequestRejected,
    designatedStatusLabel,
    designatedStatusHelper,
    designatedButtonLabel,
    designatedButtonDisabled,
  } = useDriverProfileDerived({
    driverData,
    user,
    vehicles,
    selectedVehicleId,
    designatedDriverRequestStatus,
    loadingRequestStatus: false,
    t,
  });

  const {
    loadingRequestStatus,
    voiceAssistantSwitch,
    handleVoiceAssistantToggle,
    handleModeButtonPress,
    handleRequestDesignatedDriverAccess,
    handleGoToSupportComplaints,
  } = useDriverProfileHandlers({
    user,
    userMode,
    setUserMode,
    driverData,
    vehicles,
    isDriverCapable,
    normalizedAccountStatus,
    normalizedDocumentStatus,
    hasActiveVehicle,
    designatedDriverRequestStatus,
    setDesignatedDriverRequestStatus,
    loadDriverData,
    loadDesignatedDriverStatus,
    loadEarningsStats,
    loadOverlayPreference,
    setOverlayToggleEnabled,
    voiceSettings,
    voiceAssistantInitialized,
    setVoiceAssistantEnabled,
    navigation,
    t,
  });

  const renderAccountStatusBadge = () => {
    if (!normalizedAccountStatus) {
      return null;
    }

    let label = t('driver.profile.accountStatus.label');
    let badgeColor = '#9E9E9E';

    switch (normalizedAccountStatus) {
      case 'active':
        label = t('driver.profile.accountStatus.active');
        badgeColor = '#4CAF50';
        break;
      case 'pending':
        label = t('driver.profile.accountStatus.pending');
        badgeColor = '#FF9800';
        break;
      case 'suspended':
        label = t('driver.profile.accountStatus.suspended');
        badgeColor = '#f44336';
        break;
      case 'rejected':
        label = t('driver.profile.accountStatus.rejected');
        badgeColor = '#f44336';
        break;
      default:
        label = t('driver.profile.accountStatus.other', { status: normalizedAccountStatus });
        badgeColor = '#9E9E9E';
        break;
    }

    return (
      <View style={[styles.accountStatusBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.accountStatusBadgeText}>{label}</Text>
      </View>
    );
  };
  
  // Animaciones
  const cardScaleAnim = useMemo(() => new Animated.Value(0.95), []);
  const cardOpacityAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    // Animar entrada del card de Conductor Designado
    Animated.parallel([
      Animated.timing(cardScaleAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardScaleAnim, cardOpacityAnim]);

  useEffect(() => {
    if (user?.id) {
      loadSelectedVehicle(user.id);
    }
  }, [user?.id]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{t('driver.profile.loading.message')}</Text>
      </View>
    );
  }

  return (
    <>
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <DriverProfileHeader
        displayName={displayName}
        displayEmail={displayEmail}
        userId={user?.id}
        profilePhoto={profilePhoto}
        uploadingPhoto={uploadingPhoto}
        averageRating={stats.averageRating}
        accountStatusBadge={renderAccountStatusBadge()}
        onUploadPhoto={handleUploadPhoto}
        onGoBack={() => navigation.goBack()}
        onEditProfile={() => navigation.navigate('Account')}
        styles={styles}
        t={t}
      />

      {/* Content Card */}
      <View style={styles.contentCard}>
        <DriverProfileStats
          totalEarnings={stats.totalEarnings}
          todayEarnings={dailyStats.earnings}
          totalRides={stats.totalRides}
          todayRides={dailyStats.rides}
          averageRating={stats.averageRating}
          styles={styles}
          t={t}
        />
      {/* Mis Vehículos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.vehicles.title')}</Text>
        
        {vehicles && vehicles.length > 0 ? (
          <>
            {vehicles.map((vehicle) => {
              const isSelectedVehicle = selectedVehicleId === vehicle.id;
              const isApproved = Boolean(vehicle.is_active ?? vehicle.isActive);

              return (
                <View key={vehicle.id} style={[styles.vehicleCard, isSelectedVehicle && styles.vehicleCardActive]}>
                  <View style={styles.vehicleMainInfo}>
                    <View style={styles.vehicleIcon}>
                      <Image source={ensureVehicleIconSource(vehicle.type)} style={styles.vehicleIconImage} />
                    </View>
                    <View style={styles.vehicleInfo}>
                      <Text style={styles.vehicleName}>
                        {vehicle.brand} {vehicle.model}
                      </Text>
                      <Text style={styles.vehicleDetails}>
                        {vehicle.color} • {vehicle.year} • {vehicle.plate}
                      </Text>
                      {isSelectedVehicle && (
                        <Text style={styles.activeVehicleLabel}>{t('driver.profile.vehicles.selectedLabel')}</Text>
                      )}
                      {!isApproved && (
                        <Text style={styles.pendingVehicleLabel}>{t('driver.profile.vehicles.pendingLabel')}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.vehicleButtonsContainer}>
                    <TouchableOpacity 
                      style={[styles.verifyButton]}
                      onPress={() => navigation.navigate('VehicleVerification', { vehicleId: vehicle.id })}
                    >
                      <Text style={styles.verifyButtonText}>
                        {isVehicleComplete(vehicle)
                          ? t('driver.profile.vehicles.view')
                          : t('driver.profile.vehicles.verify')}
                      </Text>
                    </TouchableOpacity>
                    {vehicles.length > 1 && (
                      <TouchableOpacity 
                        style={[styles.changeButton, isSelectedVehicle && styles.changeButtonActive]}
                        onPress={() => handleSwitchVehicle(vehicle.id)}
                        disabled={isSelectedVehicle || !isApproved}
                      >
                        <Text style={[styles.changeButtonText, isSelectedVehicle && styles.changeButtonTextActive, (!isApproved && !isSelectedVehicle) && styles.changeButtonTextDisabled]}>
                          {isSelectedVehicle
                            ? t('driver.profile.vehicles.selected')
                            : isApproved
                              ? t('driver.profile.vehicles.switch')
                              : t('driver.profile.vehicles.unavailable')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <View style={styles.emptyVehiclesContainer}>
            <Text style={styles.emptyVehiclesText}>{t('driver.profile.vehicles.empty')}</Text>
          </View>
        )}

        <TouchableOpacity 
          style={styles.addVehicleButton}
          onPress={() => setShowAddVehicleModal(true)}
        >
          <Text style={styles.addVehicleButtonText}>{t('driver.profile.vehicles.addButton')}</Text>
        </TouchableOpacity>
      </View>

     

      {/* Documentos del Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.documents.title')}</Text>

        {driverData && (
          <View style={styles.documentCard}>
            <View style={styles.documentLeft}>
              <View style={[styles.statusIndicator, { backgroundColor: documentStatusColor }]}>
                <MaterialIcons name={documentStatusIconName} size={20} color="#fff" />
              </View>
              <View style={styles.documentInfo}>
                <MaterialIcons name="badge" size={28} color={colors.textSecondary} />
                <View>
                  <Text style={styles.documentName}>{t('driver.profile.documents.licenseName')}</Text>
                  <Text style={[styles.documentStatus, { color: documentStatusColor }]}>{documentStatusText}</Text>
                  {driverLicenseExpiry && (
                    <Text style={styles.documentExpiry}>
                      {t('driver.profile.documents.expires', { date: safeFormatDate(driverLicenseExpiry) })}
                    </Text>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => navigation.navigate('DriversDocumentsInspection')}
            >
              <Text style={styles.uploadButtonText}>{documentButtonLabel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Solicitar Conductor Designado */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.designated.title')}</Text>
        
        <View style={styles.designatedDriverCard}>
          <View style={styles.designatedDriverContent}>
            <Text style={styles.designatedDriverTitle}>{t('driver.profile.designated.heroTitle')}</Text>
            <Text style={styles.designatedDriverDescription}>
              {t('driver.profile.designated.heroDescription')}
            </Text>
            
            <View style={styles.designatedDriverBenefits}>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.rides')}</Text>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.higherFare')}</Text>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.premiumClients')}</Text>
              <Text style={styles.benefitItem}>{t('driver.profile.designated.benefits.keepRegular')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.designatedDriverButton,
              designatedButtonDisabled && styles.designatedDriverButtonDisabled
            ]}
            onPress={() => {
              // Si ya hay solicitud pendiente, no permitir enviar otra
              if (isDesignatedRequestPending) {
                Alert.alert(
                  t('driver.profile.designated.alerts.pendingTitle'),
                  t('driver.profile.designated.alerts.pendingBody'),
                );
                return;
              }

              if (isDesignatedDriverApproved) {
                Alert.alert(
                  t('driver.profile.designated.alerts.approvedTitle'),
                  t('driver.profile.designated.alerts.approvedBody'),
                );
                return;
              }

              if (isDesignatedRequestRejected) {
                Alert.alert(
                  t('driver.profile.designated.alerts.rejectedTitle'),
                  t('driver.profile.designated.alerts.rejectedBody'),
                );
                return;
              }

              Alert.alert(
                t('driver.profile.designated.alerts.confirmTitle'),
                t('driver.profile.designated.alerts.confirmBody'),
                [
                  { text: t('driver.profile.designated.alerts.confirmCancel'), style: 'cancel' },
                  {
                    text: t('driver.profile.designated.alerts.confirmSubmit'),
                    onPress: handleRequestDesignatedDriverAccess
                  }
                ]
              );
            }}
            disabled={designatedButtonDisabled}
          >
            {loadingRequestStatus ? (
              <LoadingIcon size={20} color="#fff" />
            ) : (
              <Text style={styles.designatedDriverButtonText}>
                {designatedButtonLabel}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.mode.title')}</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceIconWrapper}>
              <MaterialIcons name="directions-car" size={24} color={colors.primary} />
            </View>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceTitle}>{t('driver.profile.mode.title')}</Text>
              <Text style={styles.preferenceSubtitle}>
                {t('driver.profile.mode.description')}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.modeToggleButton,
                userMode === 'driver' ? styles.modeToggleButtonActive : null,
              ]}
              onPress={handleModeButtonPress}
            >
              <Text
                style={[
                  styles.modeToggleButtonText,
                  userMode === 'driver' ? styles.modeToggleButtonTextActive : null,
                ]}
              >
                {userMode === 'driver'
                  ? t('driver.profile.mode.switchToClient')
                  : t('driver.profile.mode.switchToDriver')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.overlay.title')}</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceIconWrapper}>
              <MaterialIcons name="notifications" size={24} color={colors.primary} />
            </View>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceTitle}>{t('driver.profile.overlay.subtitle')}</Text>
              <Text style={styles.preferenceSubtitle}>
                {t('driver.profile.overlay.description')}
              </Text>
              {Platform.OS === 'android' ? (
                <Text style={styles.preferenceHint}>
                  {overlayPermissionGranted
                    ? t('driver.profile.overlay.hintAndroidGranted')
                    : t('driver.profile.overlay.hintAndroidMissing')}
                </Text>
              ) : (
                <Text style={styles.preferenceHint}>
                  {t('driver.profile.overlay.hintIos')}
                </Text>
              )}
            </View>
            <Switch
              value={overlayToggleEnabled}
              onValueChange={handleOverlayToggle}
              disabled={Platform.OS !== 'android' || overlayCheckingPermission}
              thumbColor={overlayToggleEnabled ? '#ffffff' : '#f4f4f4'}
              trackColor={{ false: '#bdbdbd', true: colors.primary }}
            />
          </View>
        </View>
      </View>

      {/* Asistente de Voz */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('driver.profile.voice.title')}</Text>

        <View style={styles.voiceAssistantCard}>
          <View style={styles.voiceAssistantHeader}>
            <View style={styles.voiceAssistantTitleBlock}>
              <Text style={styles.voiceAssistantTitle}>{t('driver.profile.voice.cardTitle')}</Text>
              <Text style={styles.voiceAssistantSubtitle}>
                {t('driver.profile.voice.subtitle')}
              </Text>
            </View>
            <Switch
              value={voiceAssistantSwitch}
              onValueChange={handleVoiceAssistantToggle}
              thumbColor={voiceAssistantSwitch ? '#ffffff' : '#f4f4f4'}
              trackColor={{ false: '#bdbdbd', true: colors.primary }}
            />
          </View>

          <View style={styles.voiceAssistantBenefits}>
            <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.rides')}</Text>
            <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.arrivals')}</Text>
            <Text style={styles.voiceAssistantBenefit}>{t('driver.profile.voice.benefits.payments')}</Text>
          </View>

          <Text style={styles.voiceAssistantFooter}>
            {t('driver.profile.voice.footer')}
          </Text>
        </View>
      </View>

      {/* Información del Seguro */}
      {vehicles.length > 0 && vehicles[0].insuranceNumber && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('driver.profile.insurance.title')}</Text>

          <View style={styles.insuranceCard}>
            <View style={styles.insuranceRow}>
              <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.company')}</Text>
              <Text style={styles.insuranceValue}>{vehicles[0].insuranceCompany}</Text>
            </View>

            <View style={styles.insuranceRow}>
              <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.number')}</Text>
              <Text style={styles.insuranceValue}>{vehicles[0].insuranceNumber}</Text>
            </View>

            {vehicles[0].insuranceExpiry && (
              <View style={styles.insuranceRow}>
                <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.expiry')}</Text>
                <Text style={styles.insuranceValue}>
                  {safeFormatDate(vehicles[0].insuranceExpiry)}
                </Text>
              </View>
            )}

            {vehicles[0].insurancePhoto && (
              <View style={styles.insurancePhotoContainer}>
                <Text style={styles.insuranceLabel}>{t('driver.profile.insurance.photo')}</Text>
                <Image source={{ uri: vehicles[0].insurancePhoto }} style={styles.insurancePhoto} />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Opciones adicionales */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Earnings')}
        >
           <Image
              source={require('../../assets/icons/profit-icon/profiticon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>{t('driver.profile.options.viewEarnings')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => navigation.navigate('RideHistory')}
          >
            <Image
              source={require('../../assets/icons/historial-icon/historialicon2.png')}
              style={styles.optionIconImage}
            />
            <Text style={styles.optionText}>{t('driver.profile.options.rideHistory')}</Text>
            <Text style={styles.optionArrow}>›</Text>
          </TouchableOpacity>

        {/* Tarjetas desactivadas temporalmente
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('PaymentMethods')}
        >
           <Image
              source={require('../../assets/icons/payment-icon/paymenticon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>{t('driver.profile.options.paymentMethods')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>
        */}

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Settings')}
        >
           <Image
              source={require('../../assets/icons/settings-icon/settingsicon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>{t('driver.profile.options.settings')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate('Help')}
        >
            <Image
              source={require('../../assets/icons/help-icon/helpicon.png')}
              style={styles.optionIconImage}
            />
          <Text style={styles.optionText}>{t('driver.profile.options.help')}</Text>
          <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
           style={styles.optionCard}
            onPress={handleGoToSupportComplaints}
             >
             <Image
              source={require('../../assets/icons/report-icon/reporticon.png')}
              style={styles.optionIconImage}
             />
             <Text style={styles.optionText}>{t('shared.profile.support.title')}</Text>
                      {/* <Text style={styles.supportAccessSubtitle}>
                        {t('shared.profile.support.subtitle', 'Revisa y continúa conversaciones con soporte')}
                      </Text> */}
             <Text style={styles.optionArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
      </View>
    </ScrollView>

    <AddVehicleModal
      visible={showAddVehicleModal}
      onClose={() => setShowAddVehicleModal(false)}
      vehicleFormData={vehicleFormData}
      setVehicleFormData={setVehicleFormData}
      addingVehicle={addingVehicle}
      onSubmit={handleAddVehicle}
      currentYear={currentYear}
      colors={colors}
      styles={styles}
      t={t}
    />
    </>
  );
}
