import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { isNativeFirebaseSupported, loadNativeFirebaseAuth } from '../../utils/nativeFirebase';

class PhoneAuthService {
  private confirmations: Map<string, FirebaseAuthTypes.ConfirmationResult> = new Map();

  private normalizePhone(phone: string): string {
    const digitsOnly = phone.replace(/\s+/g, '');
    if (!digitsOnly.startsWith('+')) {
      return `+${digitsOnly}`;
    }
    return digitsOnly;
  }

  validatePhoneNumber(phone: string): boolean {
    const normalized = this.normalizePhone(phone);
    return /^\+\d{6,15}$/.test(normalized);
  }

  async sendVerificationCode(phone: string): Promise<void> {
    const nativeAuth = await this.getNativeAuthInstance();
    const normalized = this.normalizePhone(phone);

    if (!this.validatePhoneNumber(normalized)) {
      throw new Error(
        'Formato de teléfono inválido. Usa un número en formato internacional (+Código país y número).'
      );
    }

    try {
      console.log('📱 [phoneAuthService] Enviando código de verificación. Input:', phone);
      console.log('📱 [phoneAuthService] Número normalizado (E.164):', normalized);
      const confirmation = await nativeAuth.signInWithPhoneNumber(normalized);
      this.confirmations.set(normalized, confirmation);
    } catch (error: any) {
      console.error('❌ Error enviando código de verificación:', error);

      const code = error?.code || '';
      let message = 'No se pudo enviar el código SMS. Inténtalo nuevamente.';

      if (code === 'auth/invalid-phone-number') {
        message =
          'El número de teléfono no es válido. Verifica el formato internacional (+Código de país y número).';
      } else if (code === 'auth/too-many-requests') {
        message =
          'Has solicitado demasiados códigos en poco tiempo. Espera unos minutos antes de intentarlo de nuevo.';
      } else if (code === 'auth/quota-exceeded') {
        message =
          'Se alcanzó el límite de envíos de SMS por ahora. Inténtalo nuevamente más tarde.';
      } else if (typeof error?.message === 'string') {
        const text = error.message.toLowerCase();
        if (text.includes('network')) {
          message = 'No pudimos conectarnos para enviar el SMS. Revisa tu conexión e inténtalo otra vez.';
        }
      }

      throw new Error(message);
    }
  }

  async confirmVerificationCode(
    phone: string,
    code: string,
    options?: { signOutAfterConfirm?: boolean }
  ): Promise<FirebaseAuthTypes.UserCredential> {
    const normalized = this.normalizePhone(phone);
    const confirmation = this.confirmations.get(normalized);

    if (!confirmation) {
      throw new Error('No se encontró una solicitud de verificación activa. Pide un nuevo código.');
    }

    if (!code || code.length !== 6) {
      throw new Error('El código debe tener 6 dígitos.');
    }

    try {
      console.log('📱 [phoneAuthService] Confirmando código para número:', normalized);
      console.log('📱 [phoneAuthService] Código ingresado:', code);
      const credential = await confirmation.confirm(code);
      if (!credential) {
        throw new Error('No se pudo confirmar el código. Intenta nuevamente.');
      }

      this.confirmations.delete(normalized);

      return credential;
    } catch (error: any) {
      console.error('❌ Error confirmando código de verificación:', error);
      const codeName = error?.code || '';

      const nativeAuth = await this.getNativeAuthInstance();
      const autoVerifiedUser = nativeAuth.currentUser;
      if (
        (codeName === 'auth/session-expired' || codeName === 'auth/code-expired') &&
        autoVerifiedUser?.phoneNumber === normalized
      ) {
        console.log(
          'ℹ️ [phoneAuthService] Código marcado como expirado pero el usuario ya fue verificado automáticamente por Firebase.'
        );

        this.confirmations.delete(normalized);

        const fakeCredential = {
          user: autoVerifiedUser,
        } as FirebaseAuthTypes.UserCredential;

        return fakeCredential;
      }

      let message = 'El código ingresado no es válido. Revisa el SMS e inténtalo nuevamente.';

      if (codeName === 'auth/invalid-verification-code') {
        message = 'El código que ingresaste no coincide con el SMS. Verifícalo e inténtalo de nuevo.';
      } else if (codeName === 'auth/session-expired' || codeName === 'auth/code-expired') {
        message = 'El código ha expirado. Toca "Reenviar código" para obtener uno nuevo.';
      } else if (codeName === 'auth/too-many-requests') {
        message =
          'Has realizado demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
      } else if (typeof error?.message === 'string') {
        const text = error.message.toLowerCase();
        if (text.includes('network')) {
          message = 'No pudimos verificar el código por un problema de red. Revisa tu conexión.';
        }
      }

      throw new Error(message);
    }
  }

  clearConfirmation(phone: string) {
    const normalized = this.normalizePhone(phone);
    this.confirmations.delete(normalized);
  }

  private async getNativeAuthInstance() {
    if (!isNativeFirebaseSupported()) {
      throw new Error('La verificación por SMS solo está disponible en Development/Production builds.');
    }

    const nativeAuthModule = await loadNativeFirebaseAuth();
    if (!nativeAuthModule?.default) {
      throw new Error('Firebase Auth nativo no está disponible. Usa una Development Build.');
    }

    return nativeAuthModule.default();
  }
}

export default new PhoneAuthService();
