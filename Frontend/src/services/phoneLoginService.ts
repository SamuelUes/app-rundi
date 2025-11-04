/**
 * Phone Login Service
 * Servicio para login con número telefónico y validación SMS
 */

import phoneAuthService from './auth/phoneAuthService';
import firebaseAuthService from './auth/firebaseAuthService';

class PhoneLoginService {
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

      await phoneAuthService.sendVerificationCode(phone);
      console.log('✅ Código SMS solicitado mediante Firebase Auth');
      
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

      const credential = await phoneAuthService.confirmVerificationCode(phone, code, {
        signOutAfterConfirm: false,
      });

      const firebaseUser = credential.user;
      if (!firebaseUser) {
        throw new Error('No se obtuvo usuario de Firebase tras confirmar el código');
      }

      const userProfile = await firebaseAuthService.getUserProfile(firebaseUser.uid);
      const idToken = await firebaseUser.getIdToken();

      console.log('✅ Login exitoso con Firebase Auth');

      return {
        success: true,
        user: {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: userProfile?.name || firebaseUser.displayName || 'Usuario',
          phone: firebaseUser.phoneNumber || phone,
          role: userProfile?.role || 'client',
        },
        token: idToken,
      };
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

      await phoneAuthService.sendVerificationCode(phone);

      return {
        success: true,
        message: 'Código reenviado correctamente',
      };
    } catch (error: any) {
      console.error('❌ Error reenviando código:', error);
      throw new Error(error.message || 'Error al reenviar código');
    }
  }
}

export default new PhoneLoginService();
