import type { ConfirmationResult, UserCredential } from '@react-native-firebase/auth';
import { isNativeFirebaseSupported, loadNativeFirebaseAuth } from '../../utils/nativeFirebase';
import i18n from '../../i18n';

class PhoneAuthService {
  private confirmations: Map<string, ConfirmationResult> = new Map();
  private tr(path: string, options?: Record<string, any>) {
    const key = `common.services.auth.phoneAuthService.${path}`;
    const value = i18n.t(key, options) as string;
    if (!value || value === key) {
      return i18n.t(key, { ...options, lng: 'en' }) as string;
    }
    return value;
  }

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
    const nativeAuthModule = await this.getNativeAuthModule();
    const normalized = this.normalizePhone(phone);

    if (!this.validatePhoneNumber(normalized)) {
      throw new Error(this.tr('errors.invalidPhoneFormat'));
    }

    try {
      console.log('📱 [phoneAuthService] Enviando código de verificación. Input:', phone);
      console.log('📱 [phoneAuthService] Número normalizado (E.164):', normalized);
      const confirmation = await nativeAuthModule.signInWithPhoneNumber(
        nativeAuthModule.getAuth(),
        normalized
      );
      this.confirmations.set(normalized, confirmation);
    } catch (error: any) {
      console.error('❌ Error enviando código de verificación:', error);

      const code = error?.code || '';
      let message = this.tr('errors.smsSendFailed');

      if (code === 'auth/invalid-phone-number') {
        message = this.tr('errors.invalidPhoneNumber');
      } else if (code === 'auth/too-many-requests') {
        message = this.tr('errors.smsTooManyRequests');
      } else if (code === 'auth/quota-exceeded') {
        message = this.tr('errors.smsQuotaExceeded');
      } else if (typeof error?.message === 'string') {
        const text = error.message.toLowerCase();
        if (text.includes('network')) {
          message = this.tr('errors.smsNetworkError');
        }
      }

      throw new Error(message);
    }
  }

  async confirmVerificationCode(
    phone: string,
    code: string,
    options?: { signOutAfterConfirm?: boolean }
  ): Promise<UserCredential> {
    const normalized = this.normalizePhone(phone);
    const confirmation = this.confirmations.get(normalized);

    if (!confirmation) {
      throw new Error(this.tr('errors.noActiveVerification'));
    }

    if (!code || code.length !== 6) {
      throw new Error(this.tr('errors.codeLength'));
    }

    try {
      console.log('📱 [phoneAuthService] Confirmando código para número:', normalized);
      console.log('📱 [phoneAuthService] Código ingresado:', code);
      const credential = await confirmation.confirm(code);
      if (!credential) {
        throw new Error(this.tr('errors.confirmFailed'));
      }

      this.confirmations.delete(normalized);

      return credential;
    } catch (error: any) {
      console.error('❌ Error confirmando código de verificación:', error);
      const codeName = error?.code || '';

      const nativeAuthModule = await this.getNativeAuthModule();
      const autoVerifiedUser = nativeAuthModule.getAuth().currentUser;
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
        } as UserCredential;

        return fakeCredential;
      }

      let message = this.tr('errors.confirmFailed');

      if (codeName === 'auth/invalid-verification-code') {
        message = this.tr('errors.invalidVerificationCode');
      } else if (codeName === 'auth/session-expired' || codeName === 'auth/code-expired') {
        message = this.tr('errors.codeExpired');
      } else if (codeName === 'auth/too-many-requests') {
        message = this.tr('errors.confirmTooManyRequests');
      } else if (typeof error?.message === 'string') {
        const text = error.message.toLowerCase();
        if (text.includes('network')) {
          message = this.tr('errors.confirmNetworkError');
        }
      }

      throw new Error(message);
    }
  }

  clearConfirmation(phone: string) {
    const normalized = this.normalizePhone(phone);
    this.confirmations.delete(normalized);
  }

  /**
   * Elimina la cuenta del usuario actualmente autenticado en el SDK nativo
   * (sesión creada al verificar un SMS con signInWithPhoneNumber).
   * Si se indica expectedPhone, solo elimina cuando coincide con el teléfono
   * del usuario, para no borrar una cuenta ajena a un registro pendiente.
   */
  async deleteCurrentUser(expectedPhone?: string): Promise<boolean> {
    if (!isNativeFirebaseSupported()) {
      return false;
    }

    const nativeAuthModule = await loadNativeFirebaseAuth();
    const currentUser = nativeAuthModule?.getAuth?.().currentUser;

    if (!currentUser) {
      return false;
    }

    if (expectedPhone) {
      const expected = this.normalizePhone(expectedPhone).replace(/\D/g, '');
      const current = (currentUser.phoneNumber || '').replace(/\D/g, '');
      if (!expected || expected !== current) {
        return false;
      }
    }

    await currentUser.delete();
    console.log('✅ Usuario nativo eliminado de Firebase Authentication');
    return true;
  }

  /**
   * Cierra la sesión del SDK nativo de Firebase Auth si existe.
   */
  async signOutCurrentUser(): Promise<void> {
    if (!isNativeFirebaseSupported()) {
      return;
    }

    const nativeAuthModule = await loadNativeFirebaseAuth();
    const auth = nativeAuthModule?.getAuth?.();

    if (auth?.currentUser) {
      await auth.signOut();
      console.log('✅ Sesión nativa de Firebase cerrada');
    }
  }

  private async getNativeAuthModule() {
    if (!isNativeFirebaseSupported()) {
      throw new Error(this.tr('errors.smsRequiresBuild'));
    }

    const nativeAuthModule = await loadNativeFirebaseAuth();
    if (!nativeAuthModule?.getAuth || !nativeAuthModule?.signInWithPhoneNumber) {
      throw new Error(this.tr('errors.nativeFirebaseUnavailable'));
    }

    return nativeAuthModule;
  }
}

export default new PhoneAuthService();
