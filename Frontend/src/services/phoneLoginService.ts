/**
 * Phone Login Service
 * Servicio para login con número telefónico y validación SMS
 */

import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import smsService from './smsService';

class PhoneLoginService {
  private functions: any = null;

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  /**
   * Solicitar código SMS para login con teléfono
   * @param phone - Número telefónico en formato +505XXXXXXXX
   * @returns { success: boolean, message: string }
   */
  async requestLoginCode(phone: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('📱 Solicitando código SMS para login:', phone);

      // Validar formato de teléfono
      const phoneRegex = /^\+505\d{8}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        throw new Error('Formato de teléfono inválido. Debe ser +505 XXXX XXXX');
      }

      // Llamar a Cloud Function para solicitar código
      const functions = await this.getFunctions();
      const requestLoginCode = httpsCallable(functions, 'requestLoginCode');
      
      const result = await requestLoginCode({ phone });
      
      console.log('✅ Código SMS solicitado:', result.data);
      
      return {
        success: true,
        message: 'Código enviado a tu número telefónico',
      };
    } catch (error: any) {
      console.error('❌ Error solicitando código:', error);
      throw new Error(error.message || 'Error al solicitar código SMS');
    }
  }

  /**
   * Verificar código y hacer login
   * @param phone - Número telefónico
   * @param code - Código SMS de 6 dígitos
   * @returns { success: boolean, user: any, token: string }
   */
  async verifyCodeAndLogin(phone: string, code: string): Promise<any> {
    try {
      console.log('🔐 Verificando código y haciendo login:', phone);

      // Validar código
      if (!code || code.length !== 6) {
        throw new Error('Código debe tener 6 dígitos');
      }

      // Llamar a Cloud Function para verificar código y hacer login
      const functions = await this.getFunctions();
      const verifyLoginCode = httpsCallable(functions, 'verifyLoginCode');
      
      const result = await verifyLoginCode({ phone, code });
      
      console.log('✅ Login exitoso:', result.data);
      
      return result.data;
    } catch (error: any) {
      console.error('❌ Error verificando código:', error);
      throw new Error(error.message || 'Error al verificar código');
    }
  }

  /**
   * Reenviar código SMS
   * @param phone - Número telefónico
   * @returns { success: boolean, message: string }
   */
  async resendLoginCode(phone: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('📱 Reenviando código SMS:', phone);

      // Usar el servicio SMS existente
      const result = await smsService.resendCode(phone);
      
      return result;
    } catch (error: any) {
      console.error('❌ Error reenviando código:', error);
      throw new Error(error.message || 'Error al reenviar código');
    }
  }
}

export default new PhoneLoginService();
