import {
  EmailAuthProvider,
  PhoneAuthProvider,
  linkWithCredential,
  updateEmail,
  updatePassword as firebaseUpdatePassword,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../config/firebase';
import { getApp } from '@react-native-firebase/app';
import { getAuth as getNativeAuth, PhoneAuthProvider as NativePhoneAuthProvider } from '@react-native-firebase/auth';

interface PhoneLinkSession {
  phone: string;
  verificationId: string;
  createdAt: number;
}

class AccountLinkingService {
  private phoneLinkSessions: Map<string, PhoneLinkSession> = new Map();

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
      throw new Error('Usuario no autenticado');
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
      throw new Error('Correo electrónico requerido');
    }
    if (!password || password.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
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
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }

    const user = await this.ensureCurrentUser();
    await firebaseUpdatePassword(user, password);
    await user.reload();
  }

  async sendPhoneLinkCode(phone: string) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!/^\+\d{6,15}$/.test(normalizedPhone)) {
      throw new Error('Formato de teléfono inválido. Usa +505 XXXX XXXX');
    }

    const user = await this.ensureCurrentUser();
    const nativeAuth = getNativeAuth(getApp());
    const phoneProvider = new NativePhoneAuthProvider(nativeAuth);
    const verificationId = await phoneProvider.verifyPhoneNumber(normalizedPhone);

    this.phoneLinkSessions.set(user.uid, {
      phone: normalizedPhone,
      verificationId,
      createdAt: Date.now(),
    });

    return { phone: normalizedPhone };
  }

  async confirmPhoneLinkCode(code: string) {
    if (!code || code.length !== 6 || Number.isNaN(Number(code))) {
      throw new Error('El código debe tener 6 dígitos');
    }

    const user = await this.ensureCurrentUser();
    const session = this.phoneLinkSessions.get(user.uid);

    if (!session) {
      throw new Error('No se encontró una verificación activa. Envía un nuevo código.');
    }

    try {
      const credential = PhoneAuthProvider.credential(session.verificationId, code);
      await linkWithCredential(user, credential);
      await user.reload();

      this.phoneLinkSessions.delete(user.uid);

      return {
        phone: session.phone,
        providers: user.providerData.map((provider) => provider.providerId),
      };
    } catch (error: any) {
      this.phoneLinkSessions.delete(user.uid);
      throw error;
    }
  }

  clearPhoneLinkSession() {
    this.phoneLinkSessions.clear();
  }
}

export default new AccountLinkingService();
