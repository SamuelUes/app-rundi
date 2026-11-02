import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { checkBackgroundLocationPermission } from '../../services/map/backgroundLocationService';
import { overlayManager } from '../../native/overlay';
import { ensureActivityRecognitionPermission } from '../system/activityPermission';
import { fetchDriverProfile } from '../../services/driver/driverProfilesService';
import proximityService from '../../services/ride/proximityService';
import { isNativeFirebaseSupported, loadNativeFirebaseAuth } from '../firebase/nativeFirebase';
import { waitForFirebaseAuthUser } from '../firebase/firebaseAuthReady';
import type { PreflightRegionInfo, PreflightRole } from '../../types/preflight';
import {
  DRIVER_BIOMETRIC_CONTEXT,
  DRIVER_BIOMETRIC_MAX_ATTEMPTS,
  markDriverBiometricSuccess,
  getDriverBiometricUserType,
  getLocalRegionFallback,
  type DriverApprovalResult,
  type NormalizedAccountStatus,
  type NormalizedDocumentsStatus,
} from './preflightHelpers';
import BiometricService from '../../services/user/biometricService';

export async function checkAuth(user: any): Promise<boolean> {
  try {
    if (!user?.id) {
      console.warn('⚠️ [Preflight] Usuario no autenticado en AuthContext');
      return false;
    }

    try {
      if (isNativeFirebaseSupported()) {
        const nativeAuthModule = await loadNativeFirebaseAuth();
        const rnAuth = nativeAuthModule?.getAuth?.();

        if (rnAuth) {
          const rnUser = rnAuth.currentUser;

          if (rnUser) {
            if (rnUser.uid === user.id) {
              console.log(`✅ [Preflight] Usuario autenticado vía RN Firebase Auth: ${user.id}`);
            } else {
              console.warn(
                '⚠️ [Preflight] Inconsistencia entre AuthContext y RN Firebase Auth:',
                'contextId=',
                user.id,
                'rnUid=',
                rnUser.uid,
              );
            }
          }
        }
      }
    } catch (rnError) {
      console.warn('⚠️ [Preflight] No se pudo verificar sesión con RN Firebase Auth:', rnError);
    }

    const firebaseUser = await waitForFirebaseAuthUser(user.id, 6000);

    if (!firebaseUser) {
      console.warn('⚠️ [Preflight] No hay sesión Firebase Auth activa');
      return false;
    }

    if (firebaseUser.uid !== user.id) {
      console.warn(
        '⚠️ [Preflight] Inconsistencia entre AuthContext y Firebase Auth:',
        'contextId=',
        user.id,
        'firebaseUid=',
        firebaseUser.uid,
      );
      return false;
    }

    console.log(`✅ [Preflight] Usuario autenticado (context + Firebase web): ${user.id}`);
    return true;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando sesión Firebase Auth:', error);
    return false;
  }
}

export async function checkNotifications(params?: {
  isFCMAvailable?: boolean;
  configureFCM?: () => Promise<void>;
}): Promise<boolean> {
  try {
    const { isFCMAvailable, configureFCM } = params || {};

    const permissions = await Notifications.getPermissionsAsync();
    let granted = permissions.status === 'granted';

    if (!granted) {
      const result = await Notifications.requestPermissionsAsync();
      granted = result.status === 'granted';
    }

    if (!granted) {
      return false;
    }

    if (isFCMAvailable && configureFCM) {
      void configureFCM().catch((fcmError) => {
        console.error('❌ [Preflight] Error configurando FCM tras conceder notificaciones:', fcmError);
      });
    }

    return true;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando notificaciones:', error);
    return false;
  }
}

export async function checkRegionAvailabilityPreflight(
  t: (key: string, opts?: any) => string,
): Promise<PreflightRegionInfo | null> {
  let latitude: number | null = null;
  let longitude: number | null = null;

  try {
    try {
      let position = await Location.getLastKnownPositionAsync();
      if (!position) {
        position = await Location.getCurrentPositionAsync({});
      }

      if (!position) {
        console.warn('⚠️ [Preflight] No se pudo obtener ubicación para verificación de región');
        return null;
      }

      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (locError: any) {
      console.warn(
        '⚠️ [Preflight] Ubicación actual no disponible. Verifica que los servicios de ubicación estén activos:',
        locError?.message || locError,
      );
      return null;
    }

    const { getRegionAvailability } = await import('../../api/platform');
    const { getFirebaseAuth } = await import('../../config/firebase');

    const auth = await getFirebaseAuth();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      console.warn('[Preflight] No hay sesión Firebase Auth; omitiendo checkRegionAvailability');
      return null;
    }

    try {
      await firebaseUser.getIdToken(true);
    } catch (tokenError) {
      console.warn('[Preflight] No se pudo refrescar token antes de checkRegionAvailability:', tokenError);
    }

    const res = await getRegionAvailability(latitude, longitude);

    const region: PreflightRegionInfo = {
      allowed: !!res?.available,
      serviceAreaId:
        typeof res?.areaId === 'string' && res.areaId.trim().length > 0
          ? res.areaId.trim()
          : null,
      areaName: typeof res?.areaName === 'string' ? res.areaName : undefined,
      latitude,
      longitude,
    };

    console.log('[Preflight] Región detectada:', region);
    return region;
  } catch (error: any) {
    console.error('❌ [Preflight] Error verificando región (HTTP):', error?.response?.data ?? error);

    if (latitude != null && longitude != null) {
      const region = getLocalRegionFallback(t, latitude, longitude);
      console.log('[Preflight] Región fallback local:', region);
      return region;
    }

    return null;
  }
}

export async function checkForegroundLocation(): Promise<boolean> {
  try {
    const permissions = await Location.getForegroundPermissionsAsync();
    console.log('[Preflight] Foreground permission current status:', {
      status: permissions.status,
      canAskAgain: (permissions as Record<string, unknown>).canAskAgain,
    });

    if (permissions.status === 'granted') {
      return true;
    }

    const result = await Location.requestForegroundPermissionsAsync();
    console.log('[Preflight] Foreground permission request result:', {
      status: result.status,
      canAskAgain: (result as Record<string, unknown>).canAskAgain,
    });
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando ubicación foreground:', error);
    return false;
  }
}

export async function checkBackgroundLocation(): Promise<boolean> {
  try {
    const granted = await checkBackgroundLocationPermission();
    console.log('[Preflight] Background permission existing:', granted);

    if (granted) {
      return true;
    }

    const result = await Location.requestBackgroundPermissionsAsync();
    console.log('[Preflight] Background permission request result:', {
      status: result.status,
      canAskAgain: (result as Record<string, unknown>).canAskAgain,
    });
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando ubicación background:', error);
    return false;
  }
}

export async function checkOverlay(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    if (typeof overlayManager?.hasPermission !== 'function') {
      console.warn('⚠️ [Preflight] Overlay module not available, skipping overlay check');
      return true;
    }

    const granted = await overlayManager.hasPermission();
    if (granted) {
      console.log('✅ [Preflight] Overlay permission granted');
      await proximityService.setOverlayEnabled(true);
      console.log('✅ [Preflight] Overlay preference activated');
      return true;
    }

    console.log('⚠️ [Preflight] Overlay permission not granted, requesting...');

    if (typeof overlayManager?.requestPermission === 'function') {
      const requested = await overlayManager.requestPermission();
      if (requested) {
        console.log('✅ [Preflight] Overlay permission granted after request');
        await proximityService.setOverlayEnabled(true);
        console.log('✅ [Preflight] Overlay preference activated');
        return true;
      }
    }

    console.error('❌ [Preflight] Overlay permission denied by user');
    throw new Error('Overlay permission denied. Please enable "Appear on top of other apps" in your device settings to receive ride requests.');
  } catch (error) {
    console.error('❌ [Preflight] Error verificando permiso de superposición:', error);
    throw error;
  }
}

export async function checkActivity(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    return await ensureActivityRecognitionPermission();
  } catch (error) {
    console.error('❌ [Preflight] Error verificando permiso de actividad:', error);
    return false;
  }
}

export async function checkDriverApprovalStatus(driverId: string): Promise<DriverApprovalResult | null> {
  try {
    const profile = await fetchDriverProfile(driverId, { forceRefresh: true });
    if (!profile) {
      return null;
    }

    const rawAccountStatus = String(
      (profile as Record<string, any>)?.account_status || (profile as Record<string, any>)?.status || '',
    ).toLowerCase();

    let accountStatus: NormalizedAccountStatus;
    if (['active', 'verified', 'approved'].includes(rawAccountStatus)) {
      accountStatus = 'active';
    } else if (rawAccountStatus === 'suspended') {
      accountStatus = 'suspended';
    } else if (['rejected', 'disabled', 'denied'].includes(rawAccountStatus)) {
      accountStatus = 'rejected';
    } else {
      accountStatus = 'pending';
    }

    const rawDocumentsStatus = String((profile as Record<string, any>)?.documents_status || '').toLowerCase();
    let documentsStatus: NormalizedDocumentsStatus;
    if (rawDocumentsStatus === 'verified' || rawDocumentsStatus === 'active' || rawDocumentsStatus === 'approved') {
      documentsStatus = 'verified';
    } else if (rawDocumentsStatus === 'suspended') {
      documentsStatus = 'suspended';
    } else if (rawDocumentsStatus === 'rejected') {
      documentsStatus = 'rejected';
    } else {
      documentsStatus = 'pending';
    }

    const vehicles: any[] | undefined = (profile as Record<string, any>)?.vehicles;
    const hasActiveVehicle = Array.isArray(vehicles)
      ? vehicles.some((v) => v && (v.isActive === true || (v as Record<string, unknown>).is_active === true))
      : false;

    const allowed = accountStatus === 'active' && documentsStatus === 'verified' && hasActiveVehicle;

    return {
      allowed,
      accountStatus,
      documentsStatus,
      hasActiveVehicle,
    };
  } catch (error) {
    console.error('❌ [Preflight] Error verificando aprobación de conductor:', error);
    return null;
  }
}

export async function checkDriverBiometricAccess(
  user: any,
  role: PreflightRole,
  t: (key: string, opts?: any) => string,
  onPhaseChange?: (payload: {
    phase: 'scanning' | 'pin_fallback' | 'apple_signin' | 'success' | 'failed';
    attempt: number;
    maxAttempts: number;
  }) => void,
): Promise<{ success: boolean; message?: string }> {
  const userType = getDriverBiometricUserType(user, role);
  if (!userType || !user?.id) {
    return { success: true };
  }

  const isIOS = Platform.OS === 'ios';
  const appleSignInAvailable = isIOS ? await BiometricService.isAppleSignInAvailable() : false;

  let lastErrorMessage = '';

  for (let attempt = 1; attempt <= DRIVER_BIOMETRIC_MAX_ATTEMPTS; attempt += 1) {
    onPhaseChange?.({
      phase: 'scanning',
      attempt,
      maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
    });

    const result = await BiometricService.authenticateWithPinFallback(
      t('shared.preflight.biometric.prompt'),
      t('shared.preflight.biometric.pinFallback'),
    );

    const success = result.success === true;
    const attemptError = result.error || t('shared.preflight.biometric.error');

    if (result.usedPinFallback) {
      onPhaseChange?.({
        phase: 'pin_fallback',
        attempt,
        maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
      });
    }

    await BiometricService.logAuthenticationAttempt({
      biometricType: result.biometryType || 'biometric',
      context: DRIVER_BIOMETRIC_CONTEXT,
      userType,
      success,
      attemptNumber: attempt,
      errorMessage: success ? undefined : attemptError,
    });

    if (success) {
      onPhaseChange?.({
        phase: 'success',
        attempt,
        maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
      });
      markDriverBiometricSuccess(user.id);
      return { success: true };
    }

    lastErrorMessage = attemptError;

    onPhaseChange?.({
      phase: 'failed',
      attempt,
      maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
    });

    if (result.errorCode === 'NOT_SUPPORTED' || result.errorCode === 'NOT_ENROLLED') {
      if (appleSignInAvailable) {
        onPhaseChange?.({
          phase: 'apple_signin',
          attempt,
          maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
        });

        const appleResult = await BiometricService.authenticateWithApple();
        const appleSuccess = appleResult.success === true;
        const appleError = appleResult.error || t('shared.preflight.biometric.error');

        await BiometricService.logAuthenticationAttempt({
          biometricType: 'apple_signin',
          context: DRIVER_BIOMETRIC_CONTEXT,
          userType,
          success: appleSuccess,
          attemptNumber: attempt,
          errorMessage: appleSuccess ? undefined : appleError,
        });

        if (appleSuccess) {
          onPhaseChange?.({
            phase: 'success',
            attempt,
            maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
          });
          markDriverBiometricSuccess(user.id);
          return { success: true };
        }

        lastErrorMessage = appleError;

        if (appleResult.errorCode === 'AUTH_FAILED') {
          if (attempt < DRIVER_BIOMETRIC_MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 450));
            continue;
          }
        }
      }

      return {
        success: false,
        message: t('shared.preflight.biometric.deviceSecurityRequired'),
      };
    }

    if (attempt < DRIVER_BIOMETRIC_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  if (appleSignInAvailable) {
    onPhaseChange?.({
      phase: 'apple_signin',
      attempt: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
      maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
    });

    const appleResult = await BiometricService.authenticateWithApple();
    const appleSuccess = appleResult.success === true;
    const appleError = appleResult.error || t('shared.preflight.biometric.error');

    await BiometricService.logAuthenticationAttempt({
      biometricType: 'apple_signin',
      context: DRIVER_BIOMETRIC_CONTEXT,
      userType,
      success: appleSuccess,
      attemptNumber: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
      errorMessage: appleSuccess ? undefined : appleError,
    });

    if (appleSuccess) {
      onPhaseChange?.({
        phase: 'success',
        attempt: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
        maxAttempts: DRIVER_BIOMETRIC_MAX_ATTEMPTS,
      });
      markDriverBiometricSuccess(user.id);
      return { success: true };
    }

    lastErrorMessage = appleError;
  }

  return {
    success: false,
    message: lastErrorMessage || t('shared.preflight.biometric.maxAttempts', { max: DRIVER_BIOMETRIC_MAX_ATTEMPTS }),
  };
}
