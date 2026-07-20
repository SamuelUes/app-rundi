import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { isNativeFirebaseSupported, loadNativeFirebaseAuth } from '../../utils/nativeFirebase';
import i18n from '../../i18n';

class PhoneAuthService {
  private confirmations: Map<string, FirebaseAuthTypes.ConfirmationResult> = new Map();
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
    const nativeAuth = await this.getNativeAuthInstance();
    const normalized = this.normalizePhone(phone);

    if (!this.validatePhoneNumber(normalized)) {
      throw new Error(this.tr('errors.invalidPhoneFormat'));
    }

    try {
      console.log('📱 [phoneAuthService] Enviando código de verificación. Input:', phone);
      console.log('📱 [phoneAuthService] Número normalizado (E.164):', normalized);
      const confirmation = await nativeAuth.signInWithPhoneNumber(normalized);
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
  ): Promise<FirebaseAuthTypes.UserCredential> {
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

  private async getNativeAuthInstance() {
    if (!isNativeFirebaseSupported()) {
      throw new Error(this.tr('errors.smsRequiresBuild'));
    }

    const nativeAuthModule = await loadNativeFirebaseAuth();
    if (!nativeAuthModule?.default) {
      throw new Error(this.tr('errors.nativeFirebaseUnavailable'));
    }

    return (nativeAuthModule.getAuth ? nativeAuthModule.getAuth() : nativeAuthModule.default());
  }
}

export default new PhoneAuthService();
