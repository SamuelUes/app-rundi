import * as LocalAuthentication from 'expo-local-authentication';
import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import i18n from '../i18n';

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
      const functions = await getFirebaseFunctions();
      const callable = httpsCallable(functions, 'createBiometricAuth');
      await callable({
        biometricType: payload.biometricType,
        rideId: payload.rideId,
        context: payload.context ?? 'ride_request',
        userType: payload.userType ?? 'client',
        success: payload.success ?? true,
        attemptNumber: payload.attemptNumber ?? 1,
        errorMessage: payload.errorMessage ?? null,
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
