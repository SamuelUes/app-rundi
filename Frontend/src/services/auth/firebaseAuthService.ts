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
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import client from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';

class FirebaseAuthService {
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
        throw new Error(data?.error || 'Registro inválido');
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
      throw new Error(error.message);
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
        throw new Error('Perfil de usuario no encontrado');
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
      throw new Error(error.message);
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
    try {
      const firestore = await getFirebaseFirestore();
      const userDoc = await getDoc(doc(firestore, 'users', uid));
      
      if (!userDoc.exists()) {
        throw new Error('Perfil no encontrado');
      }

      return userDoc.data();
    } catch (error: any) {
      console.error('❌ Error obteniendo perfil:', error);
      throw error;
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

    const firestore = await getFirebaseFirestore();
    let emailExists = false;
    let phoneExists = false;

    try {
      if (email) {
        const emailQuery = query(
          collection(firestore, 'users'),
          where('email', '==', email.trim().toLowerCase())
        );
        const emailSnap = await getDocs(emailQuery);
        emailExists = !emailSnap.empty;
      }

      if (phone) {
        const phoneQuery = query(
          collection(firestore, 'users'),
          where('phone', '==', phone.trim())
        );
        const phoneSnap = await getDocs(phoneQuery);
        phoneExists = !phoneSnap.empty;
      }

      return { emailExists, phoneExists };
    } catch (error: any) {
      console.error('❌ Error verificando existencia de usuario:', error);
      throw new Error(error?.message || 'No se pudo validar la disponibilidad de la cuenta');
    }
  }
}

export default new FirebaseAuthService();
