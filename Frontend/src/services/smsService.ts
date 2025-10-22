/**
 * SMS Service
 * Servicio para manejar validación de números telefónicos via SMS
 */

import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

class SmsService {
  /**
   * Validar formato de teléfono Nicaragua (+505)
   * Formato: +505 XXXX XXXX (8 dígitos después del código)
   */
  validatePhoneFormat(phone: string): boolean {
    const phoneRegex = /^\+505\d{8}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  /**
   * Formatear teléfono al formato estándar
   * Entrada: +505 8765 4321 o +50587654321
   * Salida: +50587654321
   */
  formatPhone(phone: string): string {
    // Remover espacios
    let formatted = phone.replace(/\s/g, '');
    
    // Si no empieza con +, agregarlo
    if (!formatted.startsWith('+')) {
      formatted = '+' + formatted;
    }
    
    return formatted;
  }

  /**
   * Enviar código SMS a un número telefónico
   * @param phone - Número telefónico en formato +505XXXXXXXX
   * @returns Promesa con resultado del envío
   */
  async sendSmsCode(phone: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('📱 Enviando código SMS a:', phone);

      // Validar formato
      if (!this.validatePhoneFormat(phone)) {
        throw new Error('Formato de teléfono inválido. Usa +505 XXXX XXXX');
      }

      // Formatear teléfono
      const formattedPhone = this.formatPhone(phone);

      // Llamar a Cloud Function
      const functions = await getFirebaseFunctions();
      const sendSmsFn = httpsCallable(functions, 'sendSmsCode');

      const result: any = await sendSmsFn({
        phone: formattedPhone,
      });

      console.log('✅ Código SMS enviado:', result.data);

      return {
        success: true,
        message: result.data.message || 'Código enviado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error enviando SMS:', error);

      // Mapeo de errores
      if (error.message && error.message.includes('Formato')) {
        return {
          success: false,
          message: error.message,
        };
      }

      if (error.code === 'functions/invalid-argument') {
        return {
          success: false,
          message: 'Número telefónico inválido',
        };
      }

      if (error.code === 'functions/resource-exhausted') {
        return {
          success: false,
          message: 'Demasiados intentos. Por favor intenta más tarde.',
        };
      }

      return {
        success: false,
        message: error.message || 'Error al enviar código SMS',
      };
    }
  }

  /**
   * Verificar código SMS
   * @param phone - Número telefónico
   * @param code - Código de 6 dígitos
   * @returns Promesa con resultado de verificación
   */
  async verifyCode(phone: string, code: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔐 Verificando código SMS...');

      // Validar formato de teléfono
      if (!this.validatePhoneFormat(phone)) {
        throw new Error('Formato de teléfono inválido');
      }

      // Validar formato de código
      if (!code || code.length !== 6 || isNaN(Number(code))) {
        throw new Error('Código debe ser 6 dígitos');
      }

      // Formatear teléfono
      const formattedPhone = this.formatPhone(phone);

      // Llamar a Cloud Function
      const functions = await getFirebaseFunctions();
      const verifySmsCodeFn = httpsCallable(functions, 'verifySmsCode');

      const result: any = await verifySmsCodeFn({
        phone: formattedPhone,
        code: code,
      });

      console.log('✅ Código verificado:', result.data);

      return {
        success: true,
        message: result.data.message || 'Código verificado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error verificando código:', error);

      // Mapeo de errores
      if (error.message && error.message.includes('Código')) {
        return {
          success: false,
          message: error.message,
        };
      }

      if (error.code === 'functions/invalid-argument') {
        return {
          success: false,
          message: 'Código inválido',
        };
      }

      if (error.code === 'functions/failed-precondition') {
        return {
          success: false,
          message: 'Código expirado. Por favor solicita uno nuevo.',
        };
      }

      if (error.code === 'functions/permission-denied') {
        return {
          success: false,
          message: 'Demasiados intentos fallidos. Por favor intenta más tarde.',
        };
      }

      return {
        success: false,
        message: error.message || 'Error al verificar código',
      };
    }
  }

  /**
   * Reenviar código SMS
   * @param phone - Número telefónico
   * @returns Promesa con resultado del reenvío
   */
  async resendCode(phone: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('📱 Reenviando código SMS a:', phone);

      // Validar formato
      if (!this.validatePhoneFormat(phone)) {
        throw new Error('Formato de teléfono inválido');
      }

      // Formatear teléfono
      const formattedPhone = this.formatPhone(phone);

      // Llamar a Cloud Function
      const functions = await getFirebaseFunctions();
      const resendSmsFn = httpsCallable(functions, 'resendSmsCode');

      const result: any = await resendSmsFn({
        phone: formattedPhone,
      });

      console.log('✅ Código reenviado:', result.data);

      return {
        success: true,
        message: result.data.message || 'Código reenviado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error reenviando código:', error);

      return {
        success: false,
        message: error.message || 'Error al reenviar código',
      };
    }
  }
}

export default new SmsService();
