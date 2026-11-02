/**
 * Firebase Auth Service (v2)
 * Firebase Auth + perfil en DATA-MAIN_users (vía API bootstrap / proyección).
 * El bridge RN-Firebase→JS SDK usa credenciales del propio SDK
 * (PhoneAuthProvider/GoogleAuthProvider.credential + signInWithCredential) —
 * ya no hay endpoint de custom token.
 */

import {
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
  reload,
  deleteUser,
  GoogleAuthProvider,
  PhoneAuthProvider,
  OAuthProvider,
  type AuthCredential, getAuth} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { firebaseConfig } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import * as usersApi from '../../api/users';
import * as driversApi from '../../api/drivers';
import * as platformApi from '../../api/platform';
import { devTiming } from '../../utils/devTiming';
import i18n from '../../i18n';

class FirebaseAuthService {
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.auth.firebaseAuthService.${path}`, options) as string;
  }
  /**
   * Registrar usuario: Firebase Auth → bootstrap (perfil SQL + proyección) →
   * para drivers, alta de perfil de conductor y vehículo por el API v2.
   */
  async register(email: string, password: string, name: string, phone: string, role: string, driverData?: any, vehicleData?: any) {
    try {
      const auth = await getFirebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      await usersApi.bootstrapUser({
        name,
        email,
        phone,
        authProvider: 'email/password',
      });

      if (role === 'driver' || role === 'designated_driver') {
        if (driverData) {
          await driversApi.registerDriver({
            licenseNumber: driverData.licenseNumber,
            licenseExpiry: driverData.licenseExpiry,
            profilePhoto: driverData.profilePhoto,
            licensePhotoFront: driverData.licensePhotoFront,
            licensePhotoBack: driverData.licensePhotoBack,
            department: driverData.department,
            municipality: driverData.licensePhotoBack !== undefined ? driverData.department : driverData.department,
          });
          // Propagar el claim role=driver emitido por el backend v2 antes de
          // tocar drivers_live/ofertas (reglas exigen isDriver).
          await getAuth().currentUser?.getIdToken(true);
        }
        if (vehicleData) {
          await driversApi.registerVehicle({
            plate: vehicleData.plate,
            brand: vehicleData.brand,
            model: vehicleData.model,
            year: vehicleData.year,
            color: vehicleData.color,
            type: vehicleData.type,
            fuelType: vehicleData.fuelType,
            passengers: vehicleData.passengers,
            is4x4: vehicleData.is4x4,
            vehiclePhoto: vehicleData.vehiclePhoto,
            registrationNumber: vehicleData.registrationNumber,
            registrationExpiry: vehicleData.registrationExpiry,
            insuranceNumber: vehicleData.insuranceNumber,
            insuranceCompany: vehicleData.insuranceCompany,
            insuranceExpiry: vehicleData.insuranceExpiry,
          });
        }
      }

      return {
        uid,
        email: credential.user.email || email,
        name,
        phone,
        role: role === 'designated_driver' ? 'driver' : role,
      };
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

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userData = await this.getUserProfile(user.uid);

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
   * Obtener perfil de usuario (DATA-MAIN_users/{uid})
   */
  async getUserProfile(uid: string) {
    const profileNotFoundMessage = this.tr('errors.profileNotFound');

    try {
      const firestoreStarted = Date.now();
      const firestore = await getFirebaseFirestore();
      devTiming('Profile', 'firestore', firestoreStarted);
      const readStarted = Date.now();
      const userDoc = await getDoc(doc(firestore, FS_COL.users, uid));
      devTiming('Profile', 'read', readStarted);

      if (!userDoc.exists()) {
        const error: any = new Error(profileNotFoundMessage);
        error.code = 'PROFILE_NOT_FOUND';
        throw error;
      }

      const data: any = userDoc.data();
      const isAccountDisabled =
        data?.accountDisabled === true ||
        String(data?.accountStatus || '').toLowerCase() === 'disabled' ||
        String(data?.status || '').toLowerCase() === 'disabled';

      if (isAccountDisabled) {
        const accountDisabledError: any = new Error('ACCOUNT_DISABLED');
        accountDisabledError.code = 'ACCOUNT_DISABLED';
        throw accountDisabledError;
      }

      // Normalización de role solo en memoria — el rol es privilegiado y lo
      // escribe el backend (claims + proyección), nunca el cliente.
      const rawRole = typeof data?.role === 'string' ? data.role : '';
      const normalizedRole = rawRole ? rawRole.trim().toLowerCase() : '';
      if (normalizedRole && normalizedRole !== rawRole) {
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
   * Actualizar perfil de usuario (PATCH /v1/users/me — whitelist del backend)
   */
  async updateUserProfile(uid: string, data: any) {
    try {
      await usersApi.updateMyProfile({
        name: data?.name,
        phone: data?.phone,
        email: data?.email,
        birthDate: data?.birthDate,
        profilePhoto: data?.profilePhoto,
        authProvider: data?.authProvider,
        notificationsEnabled: data?.notificationsEnabled,
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

    try {
      const data = await usersApi.checkUserAvailability(
        email ? email.trim().toLowerCase() : undefined,
        phone ? phone.trim() : undefined,
      );

      return {
        emailExists: !data.emailAvailable,
        phoneExists: !data.phoneAvailable,
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
      return await platformApi.hasVerifiedRegisterPhone(phoneNumber);
    } catch (error: any) {
      console.error('❌ Error verificando logs de verificación de registro:', error);
      // No romper el flujo de usuario: si falla, asumimos que no hay verificación previa
      return false;
    }
  }

  /**
   * Sign-in del JS SDK con credencial de teléfono obtenida del SDK nativo
   * (RN Firebase signInWithPhoneNumber → verificationId). Reemplaza al
   * callable exchangeIdTokenForCustomToken — las credenciales telefónicas
   * son a nivel de proyecto, no hace falta mintear custom token.
   */
  async signInWithPhoneVerification(verificationId: string, verificationCode: string) {
    const auth = await getFirebaseAuth();
    const credential = PhoneAuthProvider.credential(verificationId, verificationCode);
    const result = await signInWithCredential(auth, credential);
    console.log('✅ Sesión JS SDK sincronizada desde credencial telefónica');
    return result.user;
  }

  /**
   * Sign-in del JS SDK con un credential ya construido (phone/google/apple).
   */
  async signInJsWithCredential(credential: AuthCredential) {
    const auth = await getFirebaseAuth();
    const result = await signInWithCredential(auth, credential);
    return result.user;
  }

  /**
   * Asegurar que la sesión web de Firebase esté iniciada usando un ID token
   * de Google. Antes minteaba un custom token en el backend; ahora se
   * construye la credencial Google directamente en el cliente.
   */
  async ensureWebSessionFromIdToken(idToken: string): Promise<void> {
    if (!idToken || typeof idToken !== 'string') {
      return;
    }

    const auth = await getFirebaseAuth();

    if (auth.currentUser?.uid) {
      return;
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
    console.log('✅ Sesión Firebase Web sincronizada desde Google idToken');
  }

  /**
   * Sign-in JS SDK con idToken (+nonce opcional) de Apple.
   */
  async signInWithAppleIdToken(idToken: string, nonce?: string) {
    const auth = await getFirebaseAuth();
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce: nonce });
    const result = await signInWithCredential(auth, credential);
    return result.user;
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
   * Registrar una verificación SMS exitosa (log/historial en backend)
   */
  async logSmsVerification(params: {
    userId: string;
    phoneNumber: string;
    code?: string;
    context: 'register_phone' | 'login_phone' | 'add_phone' | string;
    attemptCount?: number;
  }): Promise<void> {
    const { phoneNumber, code, context } = params;

    if (!code) {
      // v2: el endpoint requiere code no vacío (400) — sin código no hay nada que loguear.
      console.warn('[FirebaseAuthService] logSmsVerification sin código — se omite');
      return;
    }

    try {
      await platformApi.logSmsCode(code, { phone: phoneNumber, context });
    } catch (error: any) {
      console.error('❌ Error registrando verificación SMS:', error);
      // No romper el flujo de usuario: esto es solo logging
    }
  }

  async logEmailVerification(params: {
    userId: string;
    email?: string;
    attemptCount?: number;
  }): Promise<void> {
    const { email } = params;

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

    // v2: no existe endpoint de verificación de email sin código
    // (sms_verification_codes.code es requerido). La verificación por email
    // queda registrada por Firebase Auth — aquí solo se hace log informativo.
    console.warn('[FirebaseAuthService] logEmailVerification sin endpoint v2 — se omite', { email: emailToLog });
  }
}

export default new FirebaseAuthService();
