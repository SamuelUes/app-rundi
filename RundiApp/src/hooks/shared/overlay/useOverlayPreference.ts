import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import proximityService from '../../../services/ride/proximityService';
import { overlayManager } from '../../../native/overlay';

const isSupported = Platform.OS === 'android' || Platform.OS === 'ios';
const isIOS = Platform.OS === 'ios';

export function useOverlayPreference(t: (path: string) => string) {
  const [overlayToggleEnabled, setOverlayToggleEnabled] = useState<boolean>(false);
  const [overlayPermissionGranted, setOverlayPermissionGranted] = useState<boolean>(isSupported);
  const [overlayCheckingPermission, setOverlayCheckingPermission] = useState<boolean>(false);

  const loadOverlayPreference = useCallback(async () => {
    if (!isSupported) {
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
    if (!isSupported) {
      Alert.alert(
        t('driver.profile.overlay.alerts.notAvailableTitle'),
        t('driver.profile.overlay.alerts.notAvailableBody'),
      );
      return;
    }

    setOverlayCheckingPermission(true);
    try {
      if (Platform.OS === 'ios') {
        if (nextValue) {
          await proximityService.setOverlayEnabled(true);
          setOverlayToggleEnabled(true);

          // El primer Activity.request dispara el prompt del sistema si nunca se pidió.
          await proximityService.debugTriggerFallbackOverlay('activation-ios');

          const hasPermission = await overlayManager.hasPermission();
          setOverlayPermissionGranted(hasPermission);
          if (!hasPermission) {
            Alert.alert(
              t('driver.profile.overlay.alerts.enableTitleIos'),
              t('driver.profile.overlay.alerts.enableBodyIos'),
            );
            await overlayManager.openSystemSettings();
            const recheck = await overlayManager.hasPermission();
            setOverlayPermissionGranted(recheck);
            if (!recheck) {
              await proximityService.setOverlayEnabled(false);
              setOverlayToggleEnabled(false);
              Alert.alert(
                t('driver.profile.overlay.alerts.permissionMissingTitle'),
                t('driver.profile.overlay.alerts.permissionMissingBodyIos'),
              );
            }
          }
        } else {
          // setOverlayEnabled(false) ya termina la Live Activity vía hideOverlayBubble.
          await proximityService.setOverlayEnabled(false);
          setOverlayToggleEnabled(false);
        }
        return;
      }

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
