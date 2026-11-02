import { useState, useEffect, useCallback } from 'react';
import { Alert, Platform, AppState } from 'react-native';
import type { TFunction } from 'i18next';
import designatedDriverService from '../../../services/driver/designatedDriverService';
import proximityService from '../../../services/ride/proximityService';

interface UseDriverProfileHandlersParams {
  user: { id?: string; role?: string } | null;
  userMode: string | null;
  setUserMode: (mode: 'client' | 'driver') => Promise<void>;
  driverData: any;
  vehicles: any[];
  isDriverCapable: boolean;
  normalizedAccountStatus: string | null;
  normalizedDocumentStatus: string | null;
  hasActiveVehicle: boolean;
  designatedDriverRequestStatus: string | null;
  setDesignatedDriverRequestStatus: (status: string) => void;
  loadDriverData: () => Promise<void>;
  loadDesignatedDriverStatus: () => Promise<void>;
  loadEarningsStats: () => void;
  loadOverlayPreference: () => void;
  setOverlayToggleEnabled: (enabled: boolean) => void;
  voiceSettings: { enabled: boolean };
  voiceAssistantInitialized: boolean;
  setVoiceAssistantEnabled: (enabled: boolean) => Promise<void>;
  navigation: any;
  t: TFunction;
}

export function useDriverProfileHandlers({
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
}: UseDriverProfileHandlersParams) {
  const [loadingRequestStatus, setLoadingRequestStatus] = useState(false);
  const [voiceAssistantSwitch, setVoiceAssistantSwitch] = useState<boolean>(voiceSettings.enabled);

  useEffect(() => {
    if (!voiceAssistantInitialized) return;
    setVoiceAssistantSwitch(voiceSettings.enabled);
  }, [voiceAssistantInitialized, voiceSettings.enabled]);

  useEffect(() => {
    loadDriverData();
    loadDesignatedDriverStatus();
    loadEarningsStats();
    loadOverlayPreference();

    let unsubscribeOverlay: (() => void) | undefined;
    if (Platform.OS === 'android') {
      unsubscribeOverlay = proximityService.subscribeOverlayEnabled((enabled) => {
        setOverlayToggleEnabled(enabled);
      });
    }

    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        proximityService.invalidateOverlayCache();
        loadOverlayPreference();
      }
    });

    const unsubscribe = navigation.addListener('focus', () => {
      loadDriverData();
      loadDesignatedDriverStatus();
      loadEarningsStats();
      loadOverlayPreference();
    });

    return () => {
      unsubscribe();
      if (unsubscribeOverlay) {
        unsubscribeOverlay();
      }
      appStateListener.remove();
    };
  }, [navigation]);

  const handleVoiceAssistantToggle = async (value: boolean) => {
    setVoiceAssistantSwitch(value);
    try {
      await setVoiceAssistantEnabled(value);
    } catch (error) {
      console.error('❌ Error actualizando asistente de voz:', error);
      setVoiceAssistantSwitch((prev) => !prev);
    }
  };

  const handleModeButtonPress = async () => {
    if (!user) return;

    const targetMode: 'client' | 'driver' = userMode === 'driver' ? 'client' : 'driver';
    if (targetMode === userMode) return;

    if (targetMode === 'driver') {
      if (!isDriverCapable) {
        Alert.alert(
          t('driver.profile.mode.alerts.unavailableTitle'),
          t('driver.profile.mode.alerts.unavailableBody'),
        );
        return;
      }

      if (!driverData || vehicles.length === 0) {
        Alert.alert(
          t('driver.profile.mode.alerts.loadingTitle'),
          t('driver.profile.mode.alerts.loadingBody'),
        );
        return;
      }

      const accountOk = normalizedAccountStatus === 'active';
      const documentsOk = normalizedDocumentStatus === 'verified';
      const vehicleOk = hasActiveVehicle;

      if (!accountOk || !documentsOk || !vehicleOk) {
        const reasons: string[] = [];
        if (!accountOk) reasons.push(t('driver.profile.mode.alerts.reasons.account'));
        if (!documentsOk) reasons.push(t('driver.profile.mode.alerts.reasons.documents'));
        if (!vehicleOk) reasons.push(t('driver.profile.mode.alerts.reasons.vehicle'));

        const message = `${reasons.join('\n')}\n\n${t('driver.profile.mode.alerts.requirementsBody')}`;
        const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [
          { text: t('driver.profile.mode.alerts.close'), style: 'cancel' },
        ];

        if (!documentsOk) {
          buttons.push({
            text: t('driver.profile.mode.alerts.viewDocuments'),
            onPress: () => navigation.navigate('DriversDocumentsInspection'),
          });
        }

        if (!vehicleOk) {
          buttons.push({
            text: t('driver.profile.mode.alerts.viewVehicles'),
            onPress: () => navigation.navigate('CompleteVehicleInfo'),
          });
        }

        Alert.alert(t('driver.profile.mode.alerts.cannotEnableTitle'), message, buttons);
        return;
      }
    }

    try {
      await setUserMode(targetMode);
    } catch (error: any) {
      console.error('❌ Error actualizando modo de usuario:', error);
      Alert.alert(
        t('driver.profile.mode.alerts.errorTitle'),
        error?.message || t('driver.profile.mode.alerts.errorBody'),
      );
    }
  };

  const handleRequestDesignatedDriverAccess = async () => {
    try {
      setLoadingRequestStatus(true);
      const result = await designatedDriverService.requestDesignatedDriverAccess();
      await loadDesignatedDriverStatus();
      await loadDriverData();
      setDesignatedDriverRequestStatus('requested');
    } catch (error: any) {
      console.error('❌ Error solicitando acceso:', error);
      Alert.alert(
        t('driver.profile.designated.alerts.errorTitle'),
        error?.message || t('driver.profile.designated.alerts.errorBody'),
      );
    } finally {
      setLoadingRequestStatus(false);
    }
  };

  const handleGoToSupportComplaints = useCallback(() => {
    navigation.navigate('SupportComplaints');
  }, [navigation]);

  return {
    loadingRequestStatus,
    voiceAssistantSwitch,
    handleVoiceAssistantToggle,
    handleModeButtonPress,
    handleRequestDesignatedDriverAccess,
    handleGoToSupportComplaints,
  };
}
