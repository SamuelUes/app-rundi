import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import proximityService from '../../../services/proximityService';
import { overlayManager } from '../../../native/overlay';

export function useOverlayPreference(t: (path: string) => string) {
  const [overlayToggleEnabled, setOverlayToggleEnabled] = useState<boolean>(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState<boolean>(Platform.OS !== 'android');
  const [overlayCheckingPermission, setOverlayCheckingPermission] = useState<boolean>(false);

  const loadOverlayPreference = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setOverlayToggleEnabled(false);
      setOverlayPermissionGranted(true);
      return;
    }

    try {
      const [enabled, hasPermission] = await Promise.all([
        proximityService.getOverlayEnabled(),
        overlayManager.hasPermission(),
      ]);
      if (enabled && !hasPermission) {
        await proximityService.setOverlayEnabled(false);
        setOverlayToggleEnabled(false);
      } else {
        setOverlayToggleEnabled(enabled);
      }
      setOverlayPermissionGranted(hasPermission);
    } catch (error) {
      console.warn('⚠️ Error cargando preferencia de overlay:', error);
    }
  }, []);

  const handleOverlayToggle = useCallback(async (nextValue: boolean) => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        t('driver.profile.overlay.alerts.notAvailableTitle'),
        t('driver.profile.overlay.alerts.notAvailableBody'),
      );
      return;
    }

    setOverlayCheckingPermission(true);
    try {
      if (nextValue) {
        await proximityService.setOverlayEnabled(true);
        setOverlayToggleEnabled(true);

        Alert.alert(
          t('driver.profile.overlay.alerts.enableTitle'),
          t('driver.profile.overlay.alerts.enableBody'),
        );
        await overlayManager.openSystemSettings();

        proximityService.invalidateOverlayCache();
        const currentPref = await proximityService.getOverlayEnabled();
        setOverlayToggleEnabled(currentPref);

        const hasPermission = await overlayManager.hasPermission();
        setOverlayPermissionGranted(hasPermission);
        await proximityService.debugLogOverlayState('activation-post-settings');

        if (!hasPermission) {
          await proximityService.setOverlayEnabled(false);
          setOverlayToggleEnabled(false);
          Alert.alert(
            t('driver.profile.overlay.alerts.permissionMissingTitle'),
            t('driver.profile.overlay.alerts.permissionMissingBody'),
          );
        } else {
          await proximityService.debugTriggerFallbackOverlay('activation');
        }
      } else {
        Alert.alert(
          t('driver.profile.overlay.alerts.disableTitle'),
          t('driver.profile.overlay.alerts.disableBody'),
        );
        await overlayManager.openSystemSettings();
        const hasPermission = await overlayManager.hasPermission();
        await proximityService.debugLogOverlayState('deactivation-post-settings');
        if (hasPermission) {
          Alert.alert(
            t('driver.profile.overlay.alerts.permissionStillOnTitle'),
            t('driver.profile.overlay.alerts.permissionStillOnBody'),
          );
        }
      }
    } catch (error: any) {
      console.error('❌ Error actualizando preferencia de overlay:', error);
      Alert.alert(
        t('driver.profile.overlay.alerts.errorTitle'),
        error?.message || t('driver.profile.overlay.alerts.errorBody'),
      );
      await loadOverlayPreference();
    } finally {
      setOverlayCheckingPermission(false);
    }
  }, [t, loadOverlayPreference]);

  return {
    overlayToggleEnabled,
    setOverlayToggleEnabled,
    overlayPermissionGranted,
    overlayCheckingPermission,
    loadOverlayPreference,
    handleOverlayToggle,
  };
}
