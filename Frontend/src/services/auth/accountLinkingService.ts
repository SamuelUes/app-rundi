import {
  EmailAuthProvider,
  PhoneAuthProvider,
  linkWithCredential,
  updateEmail,
  updatePassword as firebaseUpdatePassword,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../config/firebase';
import {
  isNativeFirebaseSupported,
  loadNativeFirebaseApp,
  loadNativeFirebaseAuth,
} from '../../utils/nativeFirebase';
import i18n from '../../i18n';

interface PhoneLinkSession {
  phone: string;
  verificationId: string;
  createdAt: number;
}

class AccountLinkingService {
  private phoneLinkSessions: Map<string, PhoneLinkSession> = new Map();
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.auth.accountLinkingService.${path}`, options) as string;
  }

  private normalizePhone(phone: string): string {
    if (!phone) {
      return '';
    }
    const trimmed = phone.replace(/\s+/g, '');
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  private async ensureCurrentUser(): Promise<User> {
    const auth = await getFirebaseAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error(this.tr('errors.notAuthenticated'));
    }
    await currentUser.reload();
    return auth.currentUser!;
  }

  async reloadCurrentUser() {
    return this.ensureCurrentUser();
  }

  async getLinkedProviders(): Promise<string[]> {
    const user = await this.ensureCurrentUser();
    return user.providerData.map((provider) => provider.providerId);
  }

  async linkEmailAndPassword(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error(this.tr('validation.emailRequired'));
    }
    if (!password || password.length < 6) {
      throw new Error(this.tr('validation.passwordLength'));
    }

    const user = await this.ensureCurrentUser();
    const credential = EmailAuthProvider.credential(normalizedEmail, password);
    await linkWithCredential(user, credential);

    if (!user.email || user.email.toLowerCase() !== normalizedEmail) {
      await updateEmail(user, normalizedEmail);
    }

    await user.reload();

    return {
      email: normalizedEmail,
      providers: user.providerData.map((provider) => provider.providerId),
    };
  }

  async updatePassword(password: string) {
    if (!password || password.length < 6) {
      throw new Error(this.tr('validation.passwordLength'));
    }

    const user = await this.ensureCurrentUser();
    await firebaseUpdatePassword(user, password);
    await user.reload();
  }

  async sendPhoneLinkCode(phone: string) {
    if (!isNativeFirebaseSupported()) {
      throw new Error(this.tr('errors.smsRequiresNative'));
    }

    const normalizedPhone = this.normalizePhone(phone);
    if (!/^\+\d{6,15}$/.test(normalizedPhone)) {
      throw new Error(this.tr('validation.phoneFormat'));
    }

    const user = await this.ensureCurrentUser();
    console.log('[AccountLinkingService] sendPhoneLinkCode:start', {
      uid: user.uid,
      phone: normalizedPhone,
    });

    const nativeAuth = await this.getNativeAuthInstance();
    let verificationId: string | undefined;

    try {
      // timeout de auto-verificación de 60 segundos (valor razonable por defecto)
      const confirmation = await this.nativeVerifyPhoneNumber(nativeAuth, normalizedPhone, 60);
      const snapshot: any = confirmation as any;
      verificationId = snapshot?.verificationId;

      console.log('[AccountLinkingService] sendPhoneLinkCode:afterVerifyPhoneNumber', {
        uid: user.uid,
        phone: normalizedPhone,
        confirmation: snapshot,
        verificationId,
      });
    } catch (error: any) {
      console.error('[AccountLinkingService] sendPhoneLinkCode:error', {
        uid: user.uid,
        phone: normalizedPhone,
        code: error?.code,
        message: error?.message,
        error,
      });
      throw new Error(error?.message || this.tr('errors.sendCodeFailed'));
    }

    if (!verificationId) {
      console.error('[AccountLinkingService] sendPhoneLinkCode:missingVerificationId');
      throw new Error(this.tr('errors.missingVerificationId'));
    }

    this.phoneLinkSessions.set(user.uid, {
      phone: normalizedPhone,
      verificationId,
      createdAt: Date.now(),
    });

    console.log('[AccountLinkingService] sendPhoneLinkCode:sessionStored', {
      uid: user.uid,
      phone: normalizedPhone,
      verificationId,
    });

    return { phone: normalizedPhone };
  }

  async confirmPhoneLinkCode(code: string) {
    if (!code || code.length !== 6 || Number.isNaN(Number(code))) {
      throw new Error(this.tr('validation.codeLength'));
    }

    const user = await this.ensureCurrentUser();
    const session = this.phoneLinkSessions.get(user.uid);

    if (!session) {
      throw new Error(this.tr('errors.noActiveVerification'));
    }

    try {
      console.log('[AccountLinkingService] confirmPhoneLinkCode:start', {
        uid: user.uid,
        phone: session.phone,
      });
      const credential = PhoneAuthProvider.credential(session.verificationId, code);
      await linkWithCredential(user, credential);
      await user.reload();

      const providers = user.providerData.map((provider) => provider.providerId);

      console.log('[AccountLinkingService] confirmPhoneLinkCode:linked', {
        uid: user.uid,
        phone: session.phone,
        providers,
      });

      this.phoneLinkSessions.delete(user.uid);

      return {
        phone: session.phone,
        providers,
      };
    } catch (error: any) {
      this.phoneLinkSessions.delete(user.uid);
      throw error;
    }
  }

  clearPhoneLinkSession() {
    this.phoneLinkSessions.clear();
  }

  private nativeVerifyPhoneNumber = async (
    nativeAuth: any,
    phone: string,
    timeout: number,
  ): Promise<any> => {
    const nativeAuthModule = await loadNativeFirebaseAuth();
    if (!nativeAuthModule?.verifyPhoneNumber) {
      throw new Error(this.tr('errors.smsNotAvailableExpoGo'));
    }
    return nativeAuthModule.verifyPhoneNumber(nativeAuth, phone, timeout);
  };

  private async getNativeAuthInstance() {
    const nativeAppModule = await loadNativeFirebaseApp();
    const nativeAuthModule = await loadNativeFirebaseAuth();

    if (!nativeAppModule?.getApp || !nativeAuthModule?.getAuth) {
      throw new Error(this.tr('errors.nativeAccessFailed'));
    }

    const app = nativeAppModule.getApp();
    return nativeAuthModule.getAuth(app);
  }
}

export default new AccountLinkingService();
