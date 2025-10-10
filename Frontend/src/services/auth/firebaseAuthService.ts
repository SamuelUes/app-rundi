/**
 * Firebase Auth Service
 * Implementación de autenticación con Firebase
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, firestore, functions } from '../../config/firebase';

class FirebaseAuthService {
  /**
   * Registrar usuario
   */
  async register(email: string, password: string, name: string, phone: string, role: string, driverData?: any, vehicleData?: any) {
    try {
      // Preparar datos para enviar
      const registerPayload: any = {
        email,
        password,
        name,
        phone,
        role,
      };

      // Agregar datos de conductor si existen
      if (role === 'driver' && driverData) {
        registerPayload.driverData = driverData;
      }

      // Agregar datos de vehículo si existen
      if (role === 'driver' && vehicleData) {
        registerPayload.vehicleData = vehicleData;
      }

      console.log('📤 Enviando datos de registro:', registerPayload);

      // Llamar a la Cloud Function de registro
      const registerFn = httpsCallable(functions, 'register');
      const result: any = await registerFn(registerPayload);

      console.log('✅ Usuario registrado en Firebase:', result.data);

      // Intentar login automático
      try {
        console.log('🔐 Haciendo login automático...');
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Login automático exitoso');

        // Retornar los datos del usuario
        return {
          uid: userCredential.user.uid,
          email: userCredential.user.email || email,
          name,
          phone,
          role,
        };
      } catch (loginError: any) {
        console.warn('⚠️ Login automático falló, pero el registro fue exitoso:', loginError.message);
        
        // Retornar datos del registro aunque el login falle
        return {
          uid: result.data.userId,
          email,
          name,
          phone,
          role,
          needsManualLogin: true, // Flag para indicar que necesita login manual
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
  getCurrentUser(): User | null {
    return auth.currentUser;
  }

  /**
   * Obtener token de autenticación
   */
  async getIdToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (user) {
      return await user.getIdToken();
    }
    return null;
  }

  /**
   * Escuchar cambios en el estado de autenticación
   */
  onAuthStateChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Obtener perfil de usuario
   */
  async getUserProfile(uid: string) {
    try {
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
}

export default new FirebaseAuthService();
