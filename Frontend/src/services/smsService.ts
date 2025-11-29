/**
 * SMS Service (wrapper sobre Firebase Auth Phone)
 * Mantiene la interfaz previa pero reutiliza phoneAuthService.
 */

import phoneAuthService from './auth/phoneAuthService';

const E164_PHONE_REGEX = /^\+\d{6,15}$/;

class SmsService {
  private normalizePhone(phone: string): string {
    const trimmed = phone.replace(/\s+/g, '');
    if (!trimmed) {
      return '';
    }

    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  validatePhoneFormat(phone: string): boolean {
    const normalized = this.normalizePhone(phone);
    return E164_PHONE_REGEX.test(normalized);
  }

  formatPhone(phone: string): string {
    return this.normalizePhone(phone);
  }

  async sendSmsCode(phone: string): Promise<{ success: boolean; message: string }> {
    const formattedPhone = this.formatPhone(phone);

    if (!this.validatePhoneFormat(formattedPhone)) {
      return {
        success: false,
        message: 'Formato de teléfono inválido. Usa formato internacional (+Código país y número).',
      };
    }

    try {
      console.log('📱 Enviando código SMS (Firebase Auth) a:', formattedPhone);
      await phoneAuthService.sendVerificationCode(formattedPhone);

      return {
        success: true,
        message: 'Código enviado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error enviando SMS (Firebase Auth):', error);
      return {
        success: false,
        message: error?.message || 'Error al enviar código SMS',
      };
    }
  }

  async verifyCode(phone: string, code: string): Promise<{ success: boolean; message: string }> {
    const formattedPhone = this.formatPhone(phone);

    if (!this.validatePhoneFormat(formattedPhone)) {
      return {
        success: false,
        message: 'Formato de teléfono inválido. Usa formato internacional (+Código país y número).',
      };
    }

    if (!code || code.length !== 6 || Number.isNaN(Number(code))) {
      return {
        success: false,
        message: 'Código debe ser 6 dígitos',
      };
    }

    try {
      console.log('🔐 Verificando código SMS (Firebase Auth)...');
      await phoneAuthService.confirmVerificationCode(formattedPhone, code, {
        signOutAfterConfirm: true,
      });

      return {
        success: true,
        message: 'Código verificado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error verificando código (Firebase Auth):', error);
      return {
        success: false,
        message: error?.message || 'Error al verificar código',
      };
    }
  }

  async resendCode(phone: string): Promise<{ success: boolean; message: string }> {
    const formattedPhone = this.formatPhone(phone);

    if (!this.validatePhoneFormat(formattedPhone)) {
      return {
        success: false,
        message: 'Formato de teléfono inválido. Usa formato internacional (+Código país y número).',
      };
    }

    try {
      console.log('📱 Reenviando código SMS (Firebase Auth) a:', formattedPhone);
      await phoneAuthService.sendVerificationCode(formattedPhone);

      return {
        success: true,
        message: 'Código reenviado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error reenviando código (Firebase Auth):', error);
      return {
        success: false,
        message: error?.message || 'Error al reenviar código',
      };
    }
  }
}

export default new SmsService();
