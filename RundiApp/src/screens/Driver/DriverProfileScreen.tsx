import React, { useMemo, useEffect, useState } from 'react';
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useVoiceAssistant } from '../../context/VoiceAssistantContext';
import { safeFormatDate } from '../../utils/format/safeFormatters';
import { ensureVehicleIconSource } from '../../utils/driver/vehicleIcons';
import { useTranslation } from 'react-i18next';
import { useDriverProfile } from '../../hooks/driver/DriverProfileScreen/useDriverProfile';
import { useDriverEarnings } from '../../hooks/driver/EarningsScreen/useDriverEarnings';
import { useOverlayPreference } from '../../hooks/shared/overlay/useOverlayPreference';
import { useVehicleForm } from '../../hooks/driver/DriverProfileScreen/useVehicleForm';
import { useDriverPhoto } from '../../hooks/driver/DriverProfileScreen/useDriverPhoto';
import { useDriverProfileDerived } from '../../hooks/driver/DriverProfileScreen/useDriverProfileDerived';
import { useDriverProfileHandlers } from '../../hooks/driver/DriverProfileScreen/useDriverProfileHandlers';
import { formatCurrency, isVehicleComplete } from '../../utils/driver/driverProfileHelpers';
import { createStyles } from './DriverProfileScreen.styles';
import { AddVehicleModal } from '../../components/driver/AddVehicleModal';
import { DriverProfileHeader } from '../../components/driver/DriverProfileHeader';
import { DriverProfileStats } from '../../components/driver/DriverProfileStats';
import { DriverProfileVehicles } from '../../components/driver/DriverProfile/DriverProfileVehicles';
import { DriverProfileDocuments } from '../../components/driver/DriverProfile/DriverProfileDocuments';
import { DriverProfileRideFeatures } from '../../components/driver/DriverProfile/DriverProfileRideFeatures';
import { DriverProfileModeToggle, DriverProfileOverlay, DriverProfileVoiceAssistant } from '../../components/driver/DriverProfile/DriverProfilePreferences';
import { DriverProfileInsurance } from '../../components/driver/DriverProfile/DriverProfileInsurance';
import { DriverProfileOptions } from '../../components/driver/DriverProfile/DriverProfileOptions';
import { VirtualDocuments } from '../../components/driver/DriverProfile/VirtualDocuments';

export default function DriverProfileScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [showVirtualDocuments, setShowVirtualDocuments] = useState(false);
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

        <DriverProfileVehicles
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSwitchVehicle={handleSwitchVehicle}
          onVerifyVehicle={(vehicleId) => navigation.navigate('VehicleVerification', { vehicleId })}
          onAddVehicle={() => setShowAddVehicleModal(true)}
          t={t}
          styles={styles}
        />

        <DriverProfileDocuments
          driverData={driverData}
          documentStatusColor={documentStatusColor}
          documentStatusIconName={documentStatusIconName}
          documentStatusText={documentStatusText}
          documentButtonLabel={documentButtonLabel}
          driverLicenseExpiry={driverLicenseExpiry}
          onUploadDocuments={() => navigation.navigate('DriversDocumentsInspection')}
          onViewVirtualDocuments={() => setShowVirtualDocuments(true)}
          t={t}
          styles={styles}
        />

        <DriverProfileRideFeatures
          userId={user?.id}
          isDesignatedRequestPending={isDesignatedRequestPending}
          isDesignatedDriverApproved={isDesignatedDriverApproved}
          isDesignatedRequestRejected={isDesignatedRequestRejected}
          designatedButtonLabel={designatedButtonLabel}
          designatedButtonDisabled={designatedButtonDisabled}
          loadingRequestStatus={loadingRequestStatus}
          onRequestDesignatedDriver={handleRequestDesignatedDriverAccess}
          t={t}
          styles={styles}
        />

        <DriverProfileModeToggle
          userMode={userMode}
          colors={colors}
          onModeButtonPress={handleModeButtonPress}
          t={t}
          styles={styles}
        />

        <DriverProfileOverlay
          overlayToggleEnabled={overlayToggleEnabled}
          overlayPermissionGranted={overlayPermissionGranted}
          overlayCheckingPermission={overlayCheckingPermission}
          colors={colors}
          onOverlayToggle={handleOverlayToggle}
          t={t}
          styles={styles}
        />

        <DriverProfileVoiceAssistant
          voiceAssistantSwitch={voiceAssistantSwitch}
          colors={colors}
          onVoiceAssistantToggle={handleVoiceAssistantToggle}
          t={t}
          styles={styles}
        />

        <DriverProfileInsurance
          vehicles={vehicles}
          t={t}
          styles={styles}
        />

        <DriverProfileOptions
          onEarnings={() => navigation.navigate('Earnings')}
          onRideHistory={() => navigation.navigate('RideHistory')}
          onSettings={() => navigation.navigate('Settings')}
          onHelp={() => navigation.navigate('Help')}
          onSupportComplaints={handleGoToSupportComplaints}
          t={t}
          styles={styles}
        />

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
    <VirtualDocuments
      visible={showVirtualDocuments}
      onClose={() => setShowVirtualDocuments(false)}
      vehicleId={selectedVehicleId}
      profilePhoto={profilePhoto}
      driver={driverData}
    />
    </>
  );
}
