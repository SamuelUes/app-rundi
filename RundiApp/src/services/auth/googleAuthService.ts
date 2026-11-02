/**
 * Google Auth Service
 * Implementación de autenticación con Google usando Firebase
 */

import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  User, getAuth} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { bootstrapUser, upgradeToDriver } from '../../api/users';
import { registerDriver, registerVehicle } from '../../api/drivers';
import * as WebBrowser from 'expo-web-browser';
import i18n from '../../i18n';

// Completar el flujo de autenticación web
WebBrowser.maybeCompleteAuthSession();

class GoogleAuthService {
  private tr(path: string, options?: Record<string, any>) {
    return i18n.t(`services.auth.googleAuthService.${path}`, options) as string;
  }
  /**
   * Nota: Google.useAuthRequest es un hook de React y se usa en useGoogleAuth.ts
   * Este servicio maneja la lógica de autenticación con Firebase
   */

  /**
   * Registrar con Google
   * Crea un nuevo usuario usando Google Sign-In
   */
  async registerWithGoogle(
    googleIdToken: string,
    name: string,
    email: string,
    role: string,
    driverData?: any,
    vehicleData?: any
  ) {
    try {
      console.log('🔐 Registrando con Google...');

      const auth = await getFirebaseAuth();
      const firestore = await getFirebaseFirestore();

      // Crear credencial de Google
      const credential = GoogleAuthProvider.credential(googleIdToken);

      // Registrar en Firebase Auth
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      console.log('✅ Usuario registrado en Firebase Auth:', user.uid);

      // Preparar datos para la Cloud Function
      const registerPayload: any = {
        email: user.email || email,
        name: name || user.displayName || 'Usuario Google',
        phone: '', // Google no proporciona teléfono
        role,
        authProvider: 'google', // Indicar que es registro con Google
      };

      // Agregar datos de conductor si existen
      if (role === 'driver' && driverData) {
        registerPayload.driverData = driverData;
      }

      // Agregar datos de vehículo si existen
      if (role === 'driver' && vehicleData) {
        registerPayload.vehicleData = vehicleData;
      }

      console.log('📤 Registrando perfil en backend v2:', registerPayload);

      await bootstrapUser({
        name: registerPayload.name,
        email: registerPayload.email,
        phone: registerPayload.phone || undefined,
        authProvider: 'google',
      });
      if (role === 'driver' && driverData) {
        await upgradeToDriver();
        await registerDriver(driverData);
        // El claim role=driver llega con el próximo token — forzar refresh
        // antes de cualquier escritura en drivers_live/offers.
        await getAuth().currentUser?.getIdToken(true);
        if (vehicleData) {
          await registerVehicle(vehicleData as any);
        }
      }

      console.log('✅ Registro completado en backend v2');

      // Retornar datos del usuario
      return {
        uid: user.uid,
        email: user.email || email,
        name: name || user.displayName || 'Usuario Google',
        phone: '',
        role,
        authProvider: 'google',
      };
    } catch (error: any) {
      console.error('❌ Error en registro con Google:', error);
      throw new Error(error.message || this.tr('errors.registerFailed'));
    }
  }

  /**
   * Iniciar sesión con Google
   * Autentica un usuario existente con Google
   */
  async loginWithGoogle(googleIdToken: string) {
    try {
      console.log('🔐 Iniciando sesión con Google...');

      const auth = await getFirebaseAuth();
      const firestore = await getFirebaseFirestore();

      // Crear credencial de Google
      const credential = GoogleAuthProvider.credential(googleIdToken);

      // Iniciar sesión en Firebase Auth
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      console.log('✅ Login con Google exitoso:', user.uid);

      const userRef = doc(firestore, FS_COL.users, user.uid);
      const userDoc = await getDoc(userRef);

      // Si el perfil no existe en Firestore, delegamos al frontend para que pase por RoleSelection
      if (!userDoc.exists()) {
        const displayName =
          user.displayName || (user.email ? user.email.split('@')[0] : 'Usuario Google');

        if (!user.email) {
          throw new Error(this.tr('errors.emailMissing'));
        }

        return {
          uid: user.uid,
          email: user.email,
          name: displayName,
          phone: user.phoneNumber || undefined,
          isNew: true,
        };
      }

      const userData = userDoc.data();

      return {
        uid: user.uid,
        email: user.email,
        ...userData,
        isNew: false,
      };
    } catch (error: any) {
      console.error('❌ Error en login con Google:', error);
      throw new Error(error.message || this.tr('errors.loginFailed'));
    }
  }

  /**
   * Desconectar Google
   */
  async logout() {
    try {
      const auth = await getFirebaseAuth();
      await signOut(auth);
      console.log('✅ Sesión cerrada');
    } catch (error: any) {
      console.error('❌ Error cerrando sesión:', error);
      throw new Error(error.message || this.tr('errors.loginFailed'));
    }
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
   * Obtener perfil de usuario
   */
  async getUserProfile(uid: string) {
    try {
      const firestore = await getFirebaseFirestore();
      const userDoc = await getDoc(doc(firestore, FS_COL.users, uid));

      if (!userDoc.exists()) {
        throw new Error(this.tr('errors.profileNotFound'));
      }

      return userDoc.data();
    } catch (error: any) {
      console.error('❌ Error obteniendo perfil:', error);
      throw new Error(error.message || this.tr('errors.profileNotFound'));
    }
  }
}

export default new GoogleAuthService();
