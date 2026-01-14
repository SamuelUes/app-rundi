/**
 * Phone Login Service
 * Servicio para login con número telefónico y validación SMS
 */

import phoneAuthService from './auth/phoneAuthService';
import firebaseAuthService from './auth/firebaseAuthService';
import i18n from '../i18n';

class PhoneLoginService {
  private tr(path: string) {
    return i18n.t(`services.phoneLoginService.${path}`) as string;
  }

  /**
   * Solicitar código SMS para login con teléfono
   * @param phone - Número telefónico en formato +505XXXXXXXX
   * @returns { success: boolean, message: string }
   */
  async requestLoginCode(phone: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('📱 Solicitando código SMS para login:', phone);

      // Validar formato de teléfono (E.164 genérico)
      const phoneRegex = /^\+\d{6,15}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        throw new Error(this.tr('errors.invalidPhoneFormat'));
      }

      await phoneAuthService.sendVerificationCode(phone);
      console.log('✅ Código SMS solicitado mediante Firebase Auth');
      
      return {
        success: true,
        message: this.tr('messages.codeSent'),
      };
    } catch (error: any) {
      console.error('❌ Error solicitando código:', error);
      throw new Error(error.message || this.tr('errors.requestFailed'));
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
        throw new Error(this.tr('errors.verifyCodeLength'));
      }

      const credential = await phoneAuthService.confirmVerificationCode(phone, code, {
        signOutAfterConfirm: false,
      });

      const firebaseUser = credential.user;
      if (!firebaseUser) {
        throw new Error(this.tr('errors.noFirebaseUser'));
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
          name: userProfile?.name || firebaseUser.displayName || this.tr('defaults.userName'),
          phone: firebaseUser.phoneNumber || phone,
          role: userProfile?.role || 'client',
        },
        token: idToken,
      };
    } catch (error: any) {
      console.error('❌ Error verificando código:', error);
      throw new Error(error.message || this.tr('errors.verifyFailed'));
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
        message: this.tr('messages.codeResent'),
      };
    } catch (error: any) {
      console.error('❌ Error reenviando código:', error);
      throw new Error(error.message || this.tr('errors.resendFailed'));
    }
  }
}

export default new PhoneLoginService();
