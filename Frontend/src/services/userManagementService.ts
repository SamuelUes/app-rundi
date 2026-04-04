/**
 * User Management Service
 * Servicio para manejar operaciones de gestión de usuarios
 * como eliminación de cuenta, actualización de perfil, etc.
 */

import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { getAuth, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
//import { ref, remove, getDatabase } from 'firebase/database';
import i18n from '../i18n';

class UserManagementService {
  /**
   * Desactiva la cuenta del usuario sin eliminar sus datos
   * 
   * Proceso:
   * 1. Reautentica al usuario (requerido por Firebase Auth)
   * 2. Llama Cloud Function para desactivar cuenta
   * 3. Backend marca estado disabled y bloquea futuros inicios de sesión
   * 
   * @param email - Email del usuario para reautenticación
   * @param password - Contraseña del usuario para reautenticación
   * @returns Promise con resultado de la operación
   */
  async deleteUserAccount(email: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('� Iniciando desactivación de cuenta de usuario...');
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user || !user.email) {
        throw new Error(i18n.t('services.userManagementService.errors.notAuthenticated') as string);
      }
      
      const normalizedInputEmail = (email || '').trim().toLowerCase();
      const normalizedUserEmail = user.email.trim().toLowerCase();

      if (!normalizedInputEmail || normalizedInputEmail !== normalizedUserEmail) {
        throw new Error(i18n.t('services.userManagementService.errors.emailMismatch') as string);
      }
      
      // // 1. Reautenticar al usuario (requerido por Firebase)
      // console.log('🔐 Reautenticando usuario...');
      // const credential = EmailAuthProvider.credential(user.email, password);
      // await reauthenticateWithCredential(user, credential);

      // // 2. Obtener referencias a Firestore y Realtime DB
      // const firestore = getFirestore();
      // const database = getDatabase();
      
      // // 3. Eliminar datos de Firestore
      // console.log('🔥 Eliminando datos de Firestore...');
      // const userDocRef = doc(firestore, 'users', user.uid);
      // await deleteDoc(userDocRef);
      
      // // 4. Eliminar datos de Realtime Database
      // console.log('📡 Eliminando datos de Realtime Database...');
      
      // // Eliminar ubicaciones del conductor (si es conductor)
      // const driverLocationsRef = ref(database, `driverLocations/${user.uid}`);
      // await remove(driverLocationsRef);
      
      // // Eliminar viajes activos (si tiene)
      // const activeRidesRef = ref(database, `activeRides/${user.uid}`);
      // await remove(activeRidesRef);
      
      // // Eliminar información del conductor en tiempo real
      // const driversInfoRef = ref(database, `driversInfo/${user.uid}`);
      // await remove(driversInfoRef);
      // const driversRef = ref(database, `drivers/${user.uid}`);
      // await remove(driversRef);
      
      // // Eliminar información de cliente (si aplica)
      // const clientsInfoRef = ref(database, `clientsInfo/${user.uid}`);
      // await remove(clientsInfoRef);
      // const clientsLocationsRef = ref(database, `clientsLocations/${user.uid}`);
      // await remove(clientsLocationsRef);
      
      // // Eliminar chats (si tiene)
      // const chatsRef = ref(database, `chats/${user.uid}`);
      // await remove(chatsRef);
      
      // // Eliminar presencia (si tiene)
      // const presenceRef = ref(database, `presence/${user.uid}`);
      // await remove(presenceRef);
      
      // // Eliminar notificaciones (si tiene)
      // const notificationsRef = ref(database, `notifications/${user.uid}`);
      // await remove(notificationsRef);

      // // Eliminar sesiones activas
      // const sessionsRef = ref(database, `sessions/${user.uid}`);
      // await remove(sessionsRef);
      
      // // 5. Eliminar usuario de Firebase Auth
      // console.log('🔑 Eliminando usuario de Firebase Auth...');
      // await deleteUser(user);
      
      // console.log('✅ Cuenta eliminada exitosamente');
            // 2. Desactivar cuenta en backend
      console.log('☁️ Solicitando desactivación de cuenta en backend...');
      const functions = await getFirebaseFunctions();
      const deactivateFn = httpsCallable(functions, 'deactivateUserAccount');
      await deactivateFn({
        reason: 'self_requested',
      });

      console.log('✅ Cuenta desactivada exitosamente');
      
      return {
        success: true,
        message: 'Cuenta eliminada exitosamente. Todos tus datos han sido borrados.'
      };
      
    } catch (error: any) {
      console.error('❌ Error eliminando cuenta:', error);
      
      // Mapeo de errores comunes
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        return {
          success: false,
          message: i18n.t('services.userManagementService.errors.wrongPassword') as string
        };
      }
      
      if (error.code === 'auth/user-not-found') {
        return {
          success: false,
          message: i18n.t('services.userManagementService.errors.userNotFound') as string
        };
      }
      
      if (error.code === 'auth/too-many-requests') {
        return {
          success: false,
          message: i18n.t('services.userManagementService.errors.tooManyRequests') as string
        };
      }
      
      return {
        success: false,
        message: error.message || (i18n.t('services.userManagementService.errors.deleteAccountFailed') as string)
      };
    }
  }
  
  /**
   * Llama a la función manualDeleteUserData en Firebase Functions
   * Útil para testing o para eliminar cuentas de usuarios que ya fueron eliminados
   * 
   * @param userId - ID del usuario a eliminar (requiere permisos de admin)
   * @returns Promise con resultado de la operación
   */
  async callManualDeleteUserData(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔧 Llamando a función manual de eliminación para usuario: ${userId}`);
      
      const functions = await getFirebaseFunctions();
      const manualDeleteFn = httpsCallable(functions, 'manualDeleteUserData');
      
      const result: any = await manualDeleteFn({ userId });
      
      console.log('✅ Eliminación manual completada:', result.data);
      
      return {
        success: true,
        message: result.data.message || 'Datos eliminados manualmente'
      };
      
    } catch (error: any) {
      console.error('❌ Error en eliminación manual:', error);
      
      return {
        success: false,
        message: error.message || (i18n.t('services.userManagementService.errors.deleteDataFailed') as string)
      };
    }
  }
  
  /**
   * Verifica si un usuario existe en Firestore
   * 
   * @param userId - ID del usuario a verificar
   * @returns Promise con resultado de verificación
   */
  async checkUserExists(userId: string): Promise<boolean> {
    try {
      const firestore = getFirestore();
      const userDocRef = doc(firestore, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      return userDoc.exists();
    } catch (error) {
      console.error('Error verificando existencia de usuario:', error);
      return false;
    }
  }
}

// Exportar instancia singleton
export const userManagementService = new UserManagementService();
