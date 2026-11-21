/**
 * User Management Service — v2 REST /v1/users/me.
 */

import { doc, getDoc } from 'firebase/firestore';
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { deleteMyData } from '../../api/users';
import i18n from '../../i18n';
import phoneAuthService from '../auth/phoneAuthService';

class UserManagementService {
  async deleteUserAccountWithEmail(
    email: string,
    password: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error(i18n.t('services.userManagementService.errors.notAuthenticated') as string);
      }

      const normalizedInputEmail = (email || '').trim().toLowerCase();
      const normalizedUserEmail = user.email.trim().toLowerCase();
      if (!normalizedInputEmail || normalizedInputEmail !== normalizedUserEmail) {
        throw new Error(i18n.t('services.userManagementService.errors.emailMismatch') as string);
      }

      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
      return await this.deleteCurrentAccountData();
    } catch (error: any) {
      return this.toDeleteResult(error);
    }
  }

  async deleteUserAccountWithPhone(
    phone: string,
    code: string,
    expectedPhone: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const matches = (value: string) => value.replace(/\D/g, '');
      if (!phone || !expectedPhone || matches(phone) !== matches(expectedPhone)) {
        throw new Error(i18n.t('shared.deleteAccount.errors.phoneMismatch') as string);
      }

      const verification = await phoneAuthService.confirmVerificationCode(phone, code);
      const verifiedPhone = verification.user?.phoneNumber || '';
      if (!verifiedPhone || matches(verifiedPhone) !== matches(expectedPhone)) {
        throw new Error(i18n.t('shared.deleteAccount.errors.phoneMismatch') as string);
      }

      await phoneAuthService.signOutCurrentUser().catch(() => undefined);
      return await this.deleteCurrentAccountData();
    } catch (error: any) {
      return this.toDeleteResult(error);
    }
  }

  private async deleteCurrentAccountData(): Promise<{ success: boolean; message: string }> {
    const auth = await getFirebaseAuth();
    if (!auth.currentUser) {
      throw new Error(i18n.t('services.userManagementService.errors.notAuthenticated') as string);
    }

    await deleteMyData();
    return {
      success: true,
      message: i18n.t('shared.deleteAccount.alerts.successMessage') as string,
    };
  }

  private toDeleteResult(error: any): { success: boolean; message: string } {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      return {
        success: false,
        message: i18n.t('services.userManagementService.errors.wrongPassword') as string,
      };
    }
    if (error.code === 'auth/user-not-found') {
      return {
        success: false,
        message: i18n.t('services.userManagementService.errors.userNotFound') as string,
      };
    }
    if (error.code === 'auth/too-many-requests') {
      return {
        success: false,
        message: i18n.t('services.userManagementService.errors.tooManyRequests') as string,
      };
    }
    return {
      success: false,
      message: error.message || (i18n.t('services.userManagementService.errors.deleteAccountFailed') as string),
    };
  }

  /**
   * Eliminación de datos personales (GDPR-style). En v2 el self-service es
   * POST /users/me/delete-data; la variante admin manualDeleteUserData queda
   * en el backoffice.
   */
  async callManualDeleteUserData(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const auth = getAuth();
      if (auth.currentUser?.uid === userId) {
        await deleteMyData();
        return { success: true, message: 'Datos eliminados' };
      }
      console.warn('[userManagementService] delete-data de terceros es operación admin en v2');
      return { success: false, message: 'Operación admin no disponible en el cliente v2' };
    } catch (error: any) {
      console.error('❌ Error en eliminación de datos:', error);
      return {
        success: false,
        message: error.message || (i18n.t('services.userManagementService.errors.deleteDataFailed') as string),
      };
    }
  }

  /**
   * Verifica si un usuario existe. En v2 DATA-MAIN_users solo es legible por
   * el owner → útil solo para el propio uid (otros ids devuelven false).
   */
  async checkUserExists(userId: string): Promise<boolean> {
    try {
      const firestore = await getFirebaseFirestore();
      const userDoc = await getDoc(doc(firestore, FS_COL.users, userId));
      return userDoc.exists();
    } catch (error) {
      console.error('Error verificando existencia de usuario:', error);
      return false;
    }
  }
}

export const userManagementService = new UserManagementService();
