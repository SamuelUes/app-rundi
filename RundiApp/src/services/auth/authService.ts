/**
 * Auth Service — v2: Firebase Auth (email/password) + /v1/users/bootstrap.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { bootstrapUser } from '../../api/users';

class AuthService {
  /**
   * Registrar usuario: Firebase Auth + bootstrap del perfil operativo.
   */
  async register(email: string, password: string, name: string, phone: string, role: string) {
    const auth = await getFirebaseAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await bootstrapUser({
      name,
      email,
      phone,
      authProvider: 'email/password',
    });

    const user = {
      userId: credential.user.uid,
      uid: credential.user.uid,
      email,
      name,
      phone,
      role,
    };
    await AsyncStorage.setItem('user', JSON.stringify(user));
    return user;
  }

  /**
   * Iniciar sesión con Firebase Auth.
   */
  async login(email: string, password: string) {
    const auth = await getFirebaseAuth();
    const credential = await signInWithEmailAndPassword(auth, email, password);

    let profile: Record<string, any> = {};
    try {
      const db = await getFirebaseFirestore();
      const snap = await getDoc(doc(db, FS_COL.users, credential.user.uid));
      if (snap.exists()) profile = snap.data() as Record<string, any>;
    } catch {
      // perfil no disponible aún (bootstrap en curso)
    }

    const user = {
      userId: credential.user.uid,
      uid: credential.user.uid,
      email,
      ...profile,
    };
    await AsyncStorage.setItem('user', JSON.stringify(user));
    return user;
  }

  /**
   * Cerrar sesión.
   */
  async logout() {
    try {
      const auth = await getFirebaseAuth();
      await signOut(auth);
    } catch {
      // sign-out best-effort; la limpieza local corre igual
    }
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('user');
  }

  /**
   * Obtener usuario actual
   */
  getCurrentUser() {
    return AsyncStorage.getItem('user').then((userData) => (userData ? JSON.parse(userData) : null));
  }

  /**
   * Obtener token de autenticación (Firebase ID token).
   */
  async getToken() {
    const auth = await getFirebaseAuth();
    return auth.currentUser?.getIdToken() ?? null;
  }

  /**
   * Escuchar cambios en autenticación
   */
  onAuthStateChange(callback: (user: any) => void) {
    let unsubscribe: () => void = () => {};
    getFirebaseAuth()
      .then((auth) => {
        unsubscribe = onAuthStateChanged(auth, callback);
      })
      .catch(() => callback(null));
    return () => unsubscribe();
  }
}

export default new AuthService();
