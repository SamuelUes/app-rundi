import * as LocalAuthentication from 'expo-local-authentication';

interface BiometricResult {
  success: boolean;
  error?: string;
  biometryType?: string;
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
      
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        return 'face_id';
      }
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        return 'fingerprint';
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
    reason: string = 'Confirma tu identidad',
    fallbackLabel: string = 'Usar PIN'
  ): Promise<BiometricResult> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        return { success: false, error: 'Dispositivo no soporta biometría' };
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        return { success: false, error: 'No hay biometría registrada' };
      }

      const biometryType = await this.getBiometryType();

      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        requireConfirmation: true,
      });

      if (result.success) {
        console.log('✅ Autenticación biométrica exitosa');
        return { success: true, biometryType };
      } else {
        return { success: false, error: 'Autenticación fallida' };
      }
    } catch (error: any) {
      console.error('❌ Error en autenticación:', error);
      return { success: false, error: error.message || 'Error desconocido' };
    }
  }
}

export default BiometricService;
