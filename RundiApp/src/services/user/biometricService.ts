import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { logBiometric } from '../../api/platform';
import i18n from '../../i18n';

type BiometricErrorCode =
  | 'NOT_SUPPORTED'
  | 'NOT_ENROLLED'
  | 'AUTH_FAILED'
  | 'UNKNOWN';

interface BiometricResult {
  success: boolean;
  error?: string;
  errorCode?: BiometricErrorCode;
  biometryType?: string;
  verifiedAt?: string;
  usedPinFallback?: boolean;
}

type BiometricUserType = 'client' | 'driver' | 'designated_driver';

type AppleSignInResult = {
  success: boolean;
  identityToken?: string | null;
  authorizationCode?: string | null;
  nonce?: string;
  user?: string;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  realUserStatus?: number;
  email?: string | null;
};

class BiometricService {
  private static t(key: string, fallback: string): string {
    const value = i18n.t(key) as string;
    if (!value || value === key) {
      return fallback;
    }
    return value;
  }

  /**
   * Verifica si el dispositivo soporta biometría
   */
  static async isAvailable(): Promise<boolean> {
    try {
      return await LocalAuthentication.hasHardwareAsync();
    } catch (error) {
      console.error('Error verificando biometría:', error);
      return false;
    }
  }

  /**
   * Obtiene el tipo de biometría disponible
   */
  static async getBiometryType(): Promise<string> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) return 'none';

      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

      // Preferir huella si está disponible, porque es el caso más común
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'fingerprint';
      }

      // Si no hay huella pero sí reconocimiento facial, usar face_id
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'face_id';
      }

      return 'biometric';
    } catch (error) {
      console.error('Error obteniendo tipo de biometría:', error);
      return 'unknown';
    }
  }

  /**
   * Autentica usando biometría
   */
  static async authenticate(
    reason: string = this.t('services.biometricService.prompts.reason', 'Confirm your identity'),
    fallbackLabel: string = this.t('services.biometricService.prompts.fallbackLabel', 'Use PIN')
  ): Promise<BiometricResult> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        return {
          success: false,
          error: this.t('services.biometricService.errors.notSupported', 'This device does not support biometrics.'),
          errorCode: 'NOT_SUPPORTED',
        };
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        return {
          success: false,
          error: this.t(
            'services.biometricService.errors.notEnrolled',
            'No biometric data is registered on this device.',
          ),
          errorCode: 'NOT_ENROLLED',
        };
      }

      const biometryType = await this.getBiometryType();

      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        requireConfirmation: false,
        promptMessage: reason,
        cancelLabel: this.t('common.actions.cancel', 'Cancel'),
        fallbackLabel,
      });

      if (result.success) {
        console.log('✅ Autenticación biométrica exitosa');
        return { success: true, biometryType, verifiedAt: new Date().toISOString() };
      } else {
        return {
          success: false,
          error: this.t('services.biometricService.errors.authFailed', 'Biometric authentication failed.'),
          errorCode: 'AUTH_FAILED',
        };
      }
    } catch (error: any) {
      console.error('❌ Error en autenticación:', error);
      return {
        success: false,
        error: error.message || this.t('services.biometricService.errors.unknown', 'Unknown error.'),
        errorCode: 'UNKNOWN',
      };
    }
  }

  private static async logBiometricVerification(payload: {
    biometricType: string;
    rideId?: string;
    context?: string;
    userType?: BiometricUserType;
    success?: boolean;
    attemptNumber?: number;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await logBiometric({
        biometricType: payload.biometricType,
        rideId: payload.rideId,
        context: payload.context ?? 'ride_request',
        userType: payload.userType ?? 'client',
        success: payload.success ?? true,
        attempt: payload.attemptNumber ?? 1,
        error: payload.errorMessage ?? undefined,
      });
    } catch (error) {
      console.warn('[BiometricService] No se pudo registrar autenticación biométrica', error);
    }
  }

  static async logAuthenticationAttempt(payload: {
    biometricType: string;
    rideId?: string;
    context?: string;
    userType?: BiometricUserType;
    success: boolean;
    attemptNumber: number;
    errorMessage?: string;
  }): Promise<void> {
    await this.logBiometricVerification(payload);
  }

  static async isAppleSignInAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }
    try {
      const AppleAuthentication = await import('expo-apple-authentication');
      return AppleAuthentication.isAvailableAsync();
    } catch (error) {
      console.warn('[BiometricService] expo-apple-authentication no disponible:', error);
      return false;
    }
  }

  static async authenticateWithApple(): Promise<BiometricResult & AppleSignInResult> {
    try {
      const AppleAuthentication = await import('expo-apple-authentication');

      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        return {
          success: false,
          error: this.t('services.biometricService.errors.appleNotAvailable', 'Sign in with Apple is not available on this device.'),
          errorCode: 'NOT_SUPPORTED',
        };
      }

      const nonce = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        state: nonce,
      });

      if (credential.identityToken) {
        console.log('✅ Autenticación con Apple exitosa');
        return {
          success: true,
          biometryType: 'apple_signin',
          verifiedAt: new Date().toISOString(),
          usedPinFallback: false,
          identityToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          nonce,
          user: credential.user,
          fullName: credential.fullName,
          realUserStatus: credential.realUserStatus,
          email: credential.email,
        };
      }

      return {
        success: false,
        error: this.t('services.biometricService.errors.appleNoToken', 'Apple Sign-In did not return an identity token.'),
        errorCode: 'AUTH_FAILED',
      };
    } catch (error: any) {
      if (error?.code === 'ERR_CANCELED' || error?.code === 'ERR_REQUEST_CANCELED') {
        return {
          success: false,
          error: this.t('services.biometricService.errors.appleCanceled', 'Apple Sign-In was canceled.'),
          errorCode: 'AUTH_FAILED',
        };
      }
      console.error('❌ Error en autenticación con Apple:', error);
      return {
        success: false,
        error: error?.message || this.t('services.biometricService.errors.unknown', 'Unknown error.'),
        errorCode: 'UNKNOWN',
      };
    }
  }

  static async authenticateWithPinFallback(
    reason: string = this.t('services.biometricService.prompts.reason', 'Confirm your identity'),
    fallbackLabel: string = this.t('services.biometricService.prompts.fallbackLabel', 'Use PIN'),
  ): Promise<BiometricResult> {
    try {
      const detectedBiometryType = await this.getBiometryType();
      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        requireConfirmation: false,
        promptMessage: reason,
        cancelLabel: this.t('common.actions.cancel', 'Cancel'),
        fallbackLabel,
      });

      if (result.success) {
        const warning = String((result as any)?.warning || '').toLowerCase();
        const usedPinFallback =
          warning.includes('fallback') || warning.includes('device') || detectedBiometryType === 'none';
        return {
          success: true,
          biometryType: detectedBiometryType === 'none' ? 'device_credential' : detectedBiometryType,
          verifiedAt: new Date().toISOString(),
          usedPinFallback,
        };
      }

      const rawError = String((result as any)?.error || '').toLowerCase();
      const mappedCode: BiometricErrorCode =
        rawError.includes('not_available') || rawError.includes('not supported')
          ? 'NOT_SUPPORTED'
          : rawError.includes('not_enrolled') || rawError.includes('not enrolled')
            ? 'NOT_ENROLLED'
            : 'AUTH_FAILED';

      const mappedErrorMessage =
        mappedCode === 'NOT_SUPPORTED'
          ? this.t('services.biometricService.errors.notSupported', 'This device does not support biometrics.')
          : mappedCode === 'NOT_ENROLLED'
            ? this.t(
                'services.biometricService.errors.notEnrolled',
                'No biometric data is registered on this device.',
              )
            : this.t('services.biometricService.errors.authFailed', 'Biometric authentication failed.');

      if (mappedCode === 'NOT_SUPPORTED' || mappedCode === 'NOT_ENROLLED') {
        try {
          const deviceCredentialResult = await LocalAuthentication.authenticateAsync({
            disableDeviceFallback: false,
            requireConfirmation: false,
            promptMessage: reason,
            cancelLabel: this.t('common.actions.cancel', 'Cancel'),
            fallbackLabel,
            biometricsSecurityLevel: 'weak',
          });

          if (deviceCredentialResult.success) {
            return {
              success: true,
              biometryType: 'device_credential',
              verifiedAt: new Date().toISOString(),
              usedPinFallback: true,
            };
          }
        } catch (deviceCredentialError) {
          console.warn('[BiometricService] Device credential fallback failed:', deviceCredentialError);
        }
      }

      return {
        success: false,
        error: mappedErrorMessage,
        errorCode: mappedCode,
        biometryType: detectedBiometryType === 'none' ? 'device_credential' : detectedBiometryType,
        usedPinFallback: detectedBiometryType === 'none',
      };
    } catch (error: any) {
      console.error('❌ Error en autenticación biométrica con fallback PIN:', error);
      return {
        success: false,
        error: error?.message || this.t('services.biometricService.errors.unknown', 'Unknown error.'),
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * Autentica con el método de seguridad del dispositivo (PIN, patrón,
   * contraseña o biometría). El sistema decide qué mostrar: en Android es el
   * prompt combinado (biometría + credencial), en iOS biometría con fallback
   * a código. Si no hay biometría enrolada, va directo a la credencial.
   */
  static async authenticateWithDeviceCredential(
    reason: string = this.t('services.biometricService.prompts.reason', 'Confirm your identity'),
    fallbackLabel: string = this.t('services.biometricService.prompts.fallbackLabel', 'Use PIN'),
  ): Promise<BiometricResult> {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        requireConfirmation: false,
        promptMessage: reason,
        cancelLabel: this.t('common.actions.cancel', 'Cancel'),
        fallbackLabel,
        biometricsSecurityLevel: 'weak',
      });

      if (result.success) {
        return {
          success: true,
          biometryType: 'device_credential',
          verifiedAt: new Date().toISOString(),
          usedPinFallback: true,
        };
      }

      const rawError = String((result as any)?.error || '').toLowerCase();
      const mappedCode: BiometricErrorCode =
        rawError.includes('not_available') || rawError.includes('not supported')
          ? 'NOT_SUPPORTED'
          : rawError.includes('not_enrolled') || rawError.includes('not enrolled')
            ? 'NOT_ENROLLED'
            : 'AUTH_FAILED';

      return {
        success: false,
        error:
          mappedCode === 'AUTH_FAILED'
            ? this.t('services.biometricService.errors.authFailed', 'Biometric authentication failed.')
            : this.t(
                'services.biometricService.errors.noDeviceSecurity',
                'This device has no security method configured.',
              ),
        errorCode: mappedCode,
        biometryType: 'device_credential',
        usedPinFallback: true,
      };
    } catch (error: any) {
      console.error('❌ Error en autenticación con credencial del dispositivo:', error);
      return {
        success: false,
        error: error?.message || this.t('services.biometricService.errors.unknown', 'Unknown error.'),
        errorCode: 'UNKNOWN',
      };
    }
  }

  /**
   * ¿El dispositivo tiene algún método de seguridad enrolado (PIN, patrón,
   * contraseña o biometría)? Falso solo si el dispositivo está completamente
   * abierto — en ese caso authenticateWithDeviceCredential no puede verificar.
   */
  static async hasDeviceCredential(): Promise<boolean> {
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      return level !== LocalAuthentication.SecurityLevel.NONE;
    } catch {
      return false;
    }
  }

  private static UNLOCK_KEY = 'rundi_biometric_unlock';

  static async isBiometricUnlockEnabled(): Promise<boolean> {
    try {
      return (await SecureStore.getItemAsync(this.UNLOCK_KEY)) === '1';
    } catch {
      return false;
    }
  }

  static async hasBiometricUnlockDecision(): Promise<boolean> {
    try {
      return (await SecureStore.getItemAsync(this.UNLOCK_KEY)) !== null;
    } catch {
      return false;
    }
  }

  static async setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(this.UNLOCK_KEY, enabled ? '1' : '0');
    } catch (error) {
      console.warn('[BiometricService] No se pudo guardar preferencia de desbloqueo:', error);
    }
  }

  static async authenticateAndLog(options: {
    reason?: string;
    fallbackLabel?: string;
    rideId?: string;
    context?: string;
    userType?: BiometricUserType;
  } = {}): Promise<BiometricResult> {
    const result = await this.authenticate(options.reason, options.fallbackLabel);
    if (result.success && result.biometryType) {
      await this.logBiometricVerification({
        biometricType: result.biometryType,
        rideId: options.rideId,
        context: options.context,
        userType: options.userType,
      });
    }
    return result;
  }
}

export default BiometricService;
