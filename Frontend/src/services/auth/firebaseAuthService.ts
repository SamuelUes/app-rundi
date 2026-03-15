/**
 * Firebase Auth Service
 * Implementación de autenticación con Firebase
 */

import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
  reload,
  deleteUser,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFirestore, getFirebaseFunctions } from '../../config/firebase';
import { firebaseConfig } from '../../config/firebase';
import client from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import i18n from '../../i18n';

class FirebaseAuthService {
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.auth.firebaseAuthService.${path}`, options) as string;
  }
  /**
   * Registrar usuario
   */
  async register(email: string, password: string, name: string, phone: string, role: string, driverData?: any, vehicleData?: any) {
    try {
      const payload: any = {
        email,
        password,
        name,
        phone,
        role,
        authProvider: 'email/password',
        method: 'email',
        driverData: role === 'driver' ? driverData : undefined,
        vehicleData: role === 'driver' ? vehicleData : undefined,
      };

      console.log('📤 Enviando datos de registro:', payload);

      const { data } = await client.post(ENDPOINTS.auth.register, payload);

      if (!data?.success || !data?.user) {
        throw new Error(data?.error || this.tr('errors.registerInvalid'));
      }

      const apiUser = data.user;
      const auth = await getFirebaseAuth();

      try {
        console.log('🔐 Haciendo login automático...');
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        return {
          uid: userCredential.user.uid,
          email: userCredential.user.email || apiUser.email || email,
          name: apiUser.name,
          phone: apiUser.phone || phone,
          role: apiUser.role,
        };
      } catch (loginError: any) {
        console.warn('⚠️ Login automático con email falló:', loginError.message);

        if (data.token) {
          try {
            const credentialUser = await signInWithCustomToken(auth, data.token);
            return {
              uid: credentialUser.user.uid,
              email: credentialUser.user.email || apiUser.email || email,
              name: apiUser.name,
              phone: apiUser.phone || phone,
              role: apiUser.role,
            };
          } catch (tokenError: any) {
            console.warn('⚠️ Login con custom token falló:', tokenError.message);
          }
        }

        return {
          uid: apiUser.userId,
          email: apiUser.email || email,
          name: apiUser.name,
          phone: apiUser.phone || phone,
          role: apiUser.role,
          needsManualLogin: true,
        };
      }
    } catch (error: any) {
      console.error('❌ Error en registro:', error);
      throw new Error(error.message || this.tr('errors.registerInvalid'));
    }
  }

  /**
   * Iniciar sesión
   */
  async login(email: string, password: string) {
    try {
      const auth = await getFirebaseAuth();
      const firestore = await getFirebaseFirestore();
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Obtener perfil de Firestore
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (!userDoc.exists()) {
        throw new Error(this.tr('errors.userProfileNotFound'));
      }

      const userData = userDoc.data();

      console.log('✅ Login exitoso:', user.uid);

      return {
        uid: user.uid,
        email: user.email,
        ...userData,
      };
    } catch (error: any) {
      console.error('❌ Error en login:', error);
      throw new Error(error.message);
    }
  }

  /**
   * Cerrar sesión
   */
  async logout() {
    try {
      const auth = await getFirebaseAuth();
      await signOut(auth);
      console.log('✅ Sesión cerrada');
    } catch (error: any) {
      console.error('❌ Error cerrando sesión:', error);
      throw new Error(error.message || this.tr('errors.sessionSyncFailed'));
    }
  }

  async deleteCurrentUser(): Promise<void> {
    const auth = await getFirebaseAuth();
    const user = auth.currentUser;

    if (!user) {
      return;
    }

    await deleteUser(user);
    console.log('✅ Usuario eliminado de Firebase Authentication');
  }

  /**
   * Obtener usuario actual
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const auth = await getFirebaseAuth();
      return auth.currentUser;
    } catch (error) {
      console.error('❌ Error obteniendo usuario actual:', error);
      return null;
    }
  }

  /**
   * Obtener token de autenticación
   */
  async getIdToken(): Promise<string | null> {
    try {
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (user) {
        return await user.getIdToken();
      }
      return null;
    } catch (error) {
      console.error('❌ Error obteniendo token:', error);
      return null;
    }
  }

  /**
   * Escuchar cambios en el estado de autenticación
   */
  async onAuthStateChange(callback: (user: User | null) => void) {
    const auth = await getFirebaseAuth();
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Obtener perfil de usuario
   */
  async getUserProfile(uid: string) {
    const profileNotFoundMessage = this.tr('errors.profileNotFound');

    try {
      const firestore = await getFirebaseFirestore();
      const userDoc = await getDoc(doc(firestore, 'users', uid));
      
      if (!userDoc.exists()) {
        const error: any = new Error(profileNotFoundMessage);
        error.code = 'PROFILE_NOT_FOUND';
        throw error;
      }

      const data: any = userDoc.data();
      const rawRole = typeof data?.role === 'string' ? data.role : '';
      const normalizedRole = rawRole ? rawRole.trim().toLowerCase() : '';

      if (
        normalizedRole &&
        normalizedRole !== rawRole &&
        (normalizedRole === 'client' ||
          normalizedRole === 'driver' ||
          normalizedRole === 'designated_driver' ||
          normalizedRole === 'admin')
      ) {
        try {
          await updateDoc(doc(firestore, 'users', uid), {
            role: normalizedRole,
          });
          data.role = normalizedRole;
        } catch (updateError: any) {
          console.warn('⚠️ No se pudo normalizar role en Firestore:', updateError?.message || updateError);
        }
      } else if (normalizedRole && normalizedRole !== rawRole) {
        data.role = normalizedRole;
      }

      return data;
    } catch (error: any) {
      const message = error?.message || profileNotFoundMessage;
      const isProfileMissing =
        message === profileNotFoundMessage || error?.code === 'PROFILE_NOT_FOUND';

      if (!isProfileMissing) {
        console.error('❌ Error obteniendo perfil:', error);
      } else {
        console.log('ℹ️ Perfil no encontrado en Firestore (probable registro pendiente).');
      }

      const forwardError: any = new Error(message);
      if (isProfileMissing) {
        forwardError.code = 'PROFILE_NOT_FOUND';
      }
      throw forwardError;
    }
  }

  /**
   * Actualizar perfil de usuario
   */
  async updateUserProfile(uid: string, data: any) {
    try {
      const firestore = await getFirebaseFirestore();
      await updateDoc(doc(firestore, 'users', uid), {
        ...data,
        updatedAt: new Date(),
      });

      console.log('✅ Perfil actualizado');
    } catch (error: any) {
      console.error('❌ Error actualizando perfil:', error);
      throw error;
    }
  }

  /**
   * Verificar si ya existe un usuario con el email y/o teléfono dados
   */
  async checkUserExists(params: { email?: string; phone?: string }): Promise<{
    emailExists: boolean;
    phoneExists: boolean;
  }> {
    const { email, phone } = params;
    const functions = await getFirebaseFunctions();

    try {
      const checkFn = httpsCallable(functions, 'checkUserAvailability');
      const result: any = await checkFn({
        email: email ? email.trim().toLowerCase() : undefined,
        phone: phone ? phone.trim() : undefined,
      });

      const data = result?.data || result;

      return {
        emailExists: Boolean(data?.emailExists),
        phoneExists: Boolean(data?.phoneExists),
      };
    } catch (error: any) {
      console.error('❌ Error verificando existencia de usuario:', error);
      throw new Error(error?.message || this.tr('errors.availabilityFailed'));
    }
  }

  /**
   * Verificar si existe al menos un log de verificación de registro
   * para un número telefónico dado (context: register_phone, verified: true).
   * Se usa para evitar pedir nuevamente SMS cuando ya se verificó antes.
   */
  async hasVerifiedRegisterPhoneLog(phoneNumber: string): Promise<boolean> {
    try {
      if (!phoneNumber || typeof phoneNumber !== 'string') {
        return false;
      }

      const functions = await getFirebaseFunctions();
      const checkFn = httpsCallable(functions, 'hasVerifiedRegisterPhoneLog');
      const result: any = await checkFn({ phoneNumber });
      const data = result?.data || result;

      return Boolean(data?.hasVerified);
    } catch (error: any) {
      console.error('❌ Error verificando logs de verificación de registro:', error);
      // No romper el flujo de usuario: si falla, asumimos que no hay verificación previa
      return false;
    }
  }

  /**
   * Intercambiar un ID token (por ejemplo, de React Native Firebase Auth)
   * por un custom token utilizable por Firebase Auth Web.
   * Esto permite sincronizar la sesión entre ambos SDKs.
   */
  async exchangeIdTokenForCustomToken(idToken: string): Promise<string> {
    if (!idToken || typeof idToken !== 'string') {
      throw new Error(this.tr('errors.invalidIdToken'));
    }

    const functions = await getFirebaseFunctions();

    try {
      const exchangeFn = httpsCallable(functions, 'exchangeIdTokenForCustomToken');
      const result: any = await exchangeFn({ idToken });
      const data = result?.data || result;

      const customToken = data?.customToken;
      if (typeof customToken !== 'string' || !customToken) {
        throw new Error(this.tr('errors.customTokenMissing'));
      }

      return customToken;
    } catch (error: any) {
      console.error('❌ Error obteniendo custom token desde idToken:', error);
      throw new Error(error?.message || this.tr('errors.sessionSyncFailed'));
    }
  }

  /**
   * Asegurar que la sesión web de Firebase esté iniciada usando un ID token válido.
   * Se usa antes de acceder a Firestore para evitar errores de permisos.
   */
  async ensureWebSessionFromIdToken(idToken: string): Promise<void> {
    if (!idToken || typeof idToken !== 'string') {
      return;
    }

    const auth = await getFirebaseAuth();

    if (auth.currentUser?.uid) {
      return;
    }

    const customToken = await this.exchangeIdTokenForCustomToken(idToken);
    await signInWithCustomToken(auth, customToken);
    console.log('✅ Sesión Firebase Web sincronizada desde idToken');
  }

  async ensureEmailVerificationSession(email: string, password: string): Promise<User> {
    const auth = await getFirebaseAuth();
    const normalizedEmail = (email || '').trim().toLowerCase();
    const currentUser = auth.currentUser;

    if (!normalizedEmail) {
      throw new Error('EMAIL_REQUIRED');
    }

    if (currentUser?.email?.toLowerCase() === normalizedEmail) {
      return currentUser;
    }

    if (!password) {
      throw new Error('EMAIL_PASSWORD_REQUIRED');
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      return credential.user;
    } catch (loginError: any) {
      const code = loginError?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        const created = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        return created.user;
      }
      throw loginError;
    }
  }

  async sendEmailVerificationCode(): Promise<void> {
    const auth = await getFirebaseAuth();
    const user = auth.currentUser;

    if (!user?.email) {
      throw new Error('NO_AUTH_USER_EMAIL');
    }

    console.log('📧 [EmailVerification] Enviando correo de verificación...', {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      providers: user.providerData?.map((provider) => provider.providerId) || [],
      firebaseProjectId: firebaseConfig.projectId,
      firebaseAuthDomain: firebaseConfig.authDomain,
    });

    await sendEmailVerification(user);

    console.log('✅ [EmailVerification] Correo de verificación enviado correctamente', {
      uid: user.uid,
      email: user.email,
      sentAt: new Date().toISOString(),
    });
  }

  async applyEmailVerificationCode(oobCode: string): Promise<void> {
    const auth = await getFirebaseAuth();
    const safeCode = (oobCode || '').trim();

    if (!safeCode) {
      throw new Error('OOB_CODE_REQUIRED');
    }

    await applyActionCode(auth, safeCode);
    if (auth.currentUser) {
      await reload(auth.currentUser);
    }
  }

  async isCurrentUserEmailVerified(): Promise<{ verified: boolean; user: User | null }> {
    const auth = await getFirebaseAuth();
    const user = auth.currentUser;

    if (!user) {
      return { verified: false, user: null };
    }

    await reload(user);
    return { verified: Boolean(user.emailVerified), user };
  }

  /**
   * Registrar en Supabase una verificación SMS exitosa (log/historial)
   */
  async logSmsVerification(params: {
    userId: string;
    phoneNumber: string;
    code?: string;
    context: 'register_phone' | 'login_phone' | 'add_phone' | string;
    attemptCount?: number;
  }): Promise<void> {
    const { userId, phoneNumber, code, context, attemptCount } = params;

    const functions = await getFirebaseFunctions();

    try {
      const logFn = httpsCallable(functions, 'logSmsVerificationCode');
      await logFn({
        userId,
        phoneNumber,
        code,
        context,
        attemptCount: typeof attemptCount === 'number' ? attemptCount : 1,
      });
    } catch (error: any) {
      console.error('❌ Error registrando verificación SMS en Supabase:', error);
      // No romper el flujo de usuario: esto es solo logging
    }
  }

  async logEmailVerification(params: {
    userId: string;
    email?: string;
    attemptCount?: number;
  }): Promise<void> {
    const { userId, email, attemptCount } = params;

    const normalizedProvidedEmail = (email || '').trim().toLowerCase();
    let emailToLog = normalizedProvidedEmail;

    if (!emailToLog) {
      try {
        const auth = await getFirebaseAuth();
        emailToLog = (auth.currentUser?.email || '').trim().toLowerCase();
      } catch (sessionError) {
        console.warn('[FirebaseAuthService] No se pudo obtener auth.currentUser para log email:', sessionError);
      }
    }

    if (!emailToLog) {
      console.warn('[FirebaseAuthService] No se pudo registrar verificación: email vacío');
      return;
    }

    const functions = await getFirebaseFunctions();

    try {
      const logFn = httpsCallable(functions, 'logSmsVerificationCode');
      await logFn({
        userId,
        email: emailToLog,
        mail: emailToLog,
        isEmail: true,
        code: '',
        context: '',
        attemptCount: typeof attemptCount === 'number' ? attemptCount : 1,
      });
    } catch (error: any) {
      console.error('❌ Error registrando verificación por correo en Supabase:', error);
    }
  }
}

export default new FirebaseAuthService();
