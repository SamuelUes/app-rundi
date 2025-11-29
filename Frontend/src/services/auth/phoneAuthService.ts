import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

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
    const normalized = this.normalizePhone(phone);

    if (!this.validatePhoneNumber(normalized)) {
      throw new Error(
        'Formato de teléfono inválido. Usa un número en formato internacional (+Código país y número).'
      );
    }

    try {
      console.log('📱 [phoneAuthService] Enviando código de verificación. Input:', phone);
      console.log('📱 [phoneAuthService] Número normalizado (E.164):', normalized);
      const confirmation = await auth().signInWithPhoneNumber(normalized);
      this.confirmations.set(normalized, confirmation);
    } catch (error: any) {
      console.error('❌ Error enviando código de verificación:', error);
      throw new Error(error?.message || 'No se pudo enviar el código SMS');
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

      if (options?.signOutAfterConfirm) {
        await auth().signOut();
      }

      return credential;
    } catch (error: any) {
      console.error('❌ Error confirmando código de verificación:', error);
      throw new Error(error?.message || 'Código inválido o expirado');
    }
  }

  clearConfirmation(phone: string) {
    const normalized = this.normalizePhone(phone);
    this.confirmations.delete(normalized);
  }
}

export default new PhoneAuthService();
