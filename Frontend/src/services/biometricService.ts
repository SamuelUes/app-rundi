import * as LocalAuthentication from 'expo-local-authentication';
import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import i18n from '../i18n';

interface BiometricResult {
  success: boolean;
  error?: string;
  biometryType?: string;
  verifiedAt?: string;
}

class BiometricService {
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
    reason: string = i18n.t('services.biometricService.prompts.reason'),
    fallbackLabel: string = i18n.t('services.biometricService.prompts.fallbackLabel')
  ): Promise<BiometricResult> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        return { success: false, error: i18n.t('services.biometricService.errors.notSupported') as string };
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        return { success: false, error: i18n.t('services.biometricService.errors.notEnrolled') as string };
      }

      const biometryType = await this.getBiometryType();

      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        requireConfirmation: true,
        promptMessage: reason,
        cancelLabel: fallbackLabel,
      });

      if (result.success) {
        console.log('✅ Autenticación biométrica exitosa');
        return { success: true, biometryType, verifiedAt: new Date().toISOString() };
      } else {
        return { success: false, error: i18n.t('services.biometricService.errors.authFailed') as string };
      }
    } catch (error: any) {
      console.error('❌ Error en autenticación:', error);
      return { success: false, error: error.message || (i18n.t('services.biometricService.errors.unknown') as string) };
    }
  }

  private static async logBiometricVerification(payload: {
    biometricType: string;
    rideId?: string;
    context?: string;
    userType?: 'client' | 'driver';
  }): Promise<void> {
    try {
      const functions = await getFirebaseFunctions();
      const callable = httpsCallable(functions, 'createBiometricAuth');
      await callable({
        biometricType: payload.biometricType,
        rideId: payload.rideId,
        context: payload.context ?? 'ride_request',
        userType: payload.userType ?? 'client',
      });
    } catch (error) {
      console.warn('[BiometricService] No se pudo registrar autenticación biométrica', error);
    }
  }

  static async authenticateAndLog(options: {
    reason?: string;
    fallbackLabel?: string;
    rideId?: string;
    context?: string;
    userType?: 'client' | 'driver';
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
