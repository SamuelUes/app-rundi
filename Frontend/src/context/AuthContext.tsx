import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth, getFirebaseDatabase } from '../config/firebase';
import { ref, set, update, serverTimestamp } from 'firebase/database';
import { signInWithCustomToken } from 'firebase/auth';
import backendConfig from '../config/backendConfig';
import firebaseAuthService from '../services/auth/firebaseAuthService';
import localAuthService from '../services/auth/localAuthService';
import mainAuthService from '../services/auth/authService';
import backgroundLocationService from '../services/backgroundLocationService';
import sessionService from '../services/sessionService';
import alertService from '../services/alertService';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'client' | 'driver' | 'admin' | 'designated_driver';
  /**
   * Roles disponibles:
   * - client: Usuario normal que puede solicitar viajes
   * - driver: Conductor regular que puede ofrecer viajes normales
   * - admin: Administrador del sistema con todos los permisos
   * - designated_driver: "Super-rol" que permite:
   *   1. Ofrecer viajes normales (igual que un driver regular)
   *   2. Adicionalmente, ofrecer servicio de conductor designado en fase beta
   */
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (userData: any, token?: string) => Promise<void>;
  loginWithPhoneAndSMS: (userData: any, token?: string) => Promise<void>;
  register: (registerData: any) => Promise<void>;
  registerWithGoogle: (userData: any, token?: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  logoutInProgress: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutInProgress, setLogoutInProgress] = useState(false);

  // Seleccionar el servicio según el modo
  const authService = backendConfig.isFirebase() ? firebaseAuthService : localAuthService;

  const ensureTrackingIfNeeded = async (role?: User['role']) => {
    if (role === 'driver' || role === 'designated_driver') {
      try {
        await backgroundLocationService.ensureBackgroundTrackingIntegrity();
      } catch (err) {
        console.warn('⚠️ No se pudo restaurar tracking en segundo plano:', err);
      }
    }
  };

  const normalizeUserData = (raw: any): User => {
    if (!raw) {
      throw new Error('Datos de usuario inválidos');
    }

    const id = raw.id || raw.userId || raw.uid;
    const email = raw.email || '';
    const name = raw.name || '';
    const role = raw.role as User['role'];

    if (!id || !role) {
      throw new Error('Respuesta de usuario incompleta');
    }

    return { id, email, name, role };
  };

  useEffect(() => {
    loadUser();
    
    // Si es Firebase, escuchar cambios de auth
    if (backendConfig.isFirebase()) {
      const setupAuthListener = async () => {
        try {
          const unsubscribe = await firebaseAuthService.onAuthStateChange(async (firebaseUser) => {
            if (firebaseUser) {
              const userData = await firebaseAuthService.getUserProfile(firebaseUser.uid);
              setUser({
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: userData.name,
                role: userData.role,
              });
            } else {
              setUser(null);
            }
          });
          
          return unsubscribe;
        } catch (error) {
          console.error('Error configurando listener de auth:', error);
          return () => {};
        }
      };

      const cleanupPromise = setupAuthListener();

      return () => {
        cleanupPromise.then(unsubscribe => unsubscribe());
      };
    }
  }, []);

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('📱 Usuario cargado desde AsyncStorage:', parsedUser.role);
        console.log('📱 Usuario completo:', JSON.stringify(parsedUser, null, 2));
        
        // Validar que el usuario tenga los campos necesarios
        if (!parsedUser.id && parsedUser.uid) {
          console.log('⚠️ Usuario sin campo id, normalizando...');
          parsedUser.id = parsedUser.uid;
          await AsyncStorage.setItem('user', JSON.stringify(parsedUser));
        }
        
        
        // Validar que el rol sea válido
        const validRoles = ['client', 'driver', 'designated_driver'];
        if (!validRoles.includes(parsedUser.role)) {
          console.log('⚠️ Rol inválido detectado:', parsedUser.role);
          console.log('🔄 Limpiando usuario para forzar nuevo login...');
          await AsyncStorage.removeItem('user');
          setUser(null);
          setLoading(false);
          return;
        }
        
        setUser(parsedUser);
        await ensureTrackingIfNeeded(parsedUser.role);

        // Intentar iniciar sesión de dispositivo (política DENY)
        try {
          await sessionService.startSession({ policy: 'deny' });
        } catch (err: any) {
          if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
            // Forzar logout local y Firebase
            try { await authService.logout(); } catch {}
            await AsyncStorage.removeItem('user');
            setUser(null);
            alertService.showErrorAlert('No puedes acceder: tu cuenta ya está activa en otro dispositivo. Cierra sesión en el otro teléfono para continuar.');
            setLoading(false);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const userData = await authService.login(email, password);

      const normalizedUser = normalizeUserData(userData);

      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));

      setUser(normalizedUser);
      await ensureTrackingIfNeeded(normalizedUser.role);

      // Sesión única (DENY)
      try {
        await sessionService.startSession({ policy: 'deny' });
      } catch (err: any) {
        if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
          // Revertir login
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes iniciar sesión: la cuenta ya está activa en otro dispositivo.');
          throw err;
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (registerData: any) => {
    try {
      const { email, password, name, phone, role, driverData, vehicleData } = registerData;

      if (!email || !password) {
        throw new Error('Correo y contraseña requeridos para registro tradicional');
      }

      const userData = await authService.register(
        email,
        password,
        name,
        phone,
        role,
        driverData,
        vehicleData
      );

      if (userData?.needsManualLogin) {
        await login(email, password);
        return;
      }

      const normalizedUser = normalizeUserData(userData);
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      await ensureTrackingIfNeeded(normalizedUser.role);

      // Sesión única (DENY)
      try {
        await sessionService.startSession({ policy: 'deny' });
      } catch (err: any) {
        if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes completar el registro: la cuenta ya está activa en otro dispositivo.');
          throw err;
        }
      }
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  };
  const logout = async () => {
    setLogoutInProgress(true);
    try {
      // Detener tracking en segundo plano antes de cerrar sesión
      try {
        await backgroundLocationService.stopBackgroundLocationTracking();
      } catch (bgError) {
        console.log('⚠️ No se pudo detener el tracking en segundo plano, continuando con logout');
      }

      // Cerrar sesión remota (best-effort)
      try { await sessionService.endSession(); } catch {}
      // Marcar como offline en Firebase antes de hacer logout (solo conductores)
      const isDriverRole = user?.role === 'driver' || user?.role === 'designated_driver';
      if (isDriverRole && backendConfig.isFirebase()) {
        try {
          const auth = await getFirebaseAuth();
          const database = await getFirebaseDatabase();
          const firebaseUser = auth.currentUser;
          if (firebaseUser) {
            const driverLocationRef = ref(database, `driverLocations/${firebaseUser.uid}`);
            await set(driverLocationRef, {
              status: 'offline',
              updatedAt: serverTimestamp(),
              lastSeen: serverTimestamp(),
            });
            const driverInfoRef = ref(database, `driversInfo/${firebaseUser.uid}`);
            await update(driverInfoRef, {
              updatedAt: serverTimestamp(),
              lastSeen: serverTimestamp(),
            });
            console.log('✅ Usuario marcado como offline en Firebase');
          }
        } catch (fbError) {
          // Ignorar errores de Firebase, continuar con logout
          console.log('⚠️ No se pudo actualizar status en Firebase, continuando con logout');
        }
      }
      
      await authService.logout();
      await AsyncStorage.removeItem('user');
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      // Forzar logout local aunque falle
      setUser(null);
      await AsyncStorage.removeItem('user');
    }
    finally {
      setLogoutInProgress(false);
    }
  };

  const loginWithGoogle = async (userData: any) => {
    try {
      console.log('🔐 Iniciando sesión con Google:', userData);
      
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      await ensureTrackingIfNeeded(userData.role);

      // Sesión única (DENY)
      try {
        await sessionService.startSession({ policy: 'deny' });
      } catch (err: any) {
        if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes iniciar sesión: la cuenta ya está activa en otro dispositivo.');
          throw err;
        }
      }
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const registerWithGoogle = async (userData: any, token?: string) => {
    try {
      console.log('📝 Registrando con Google:', userData);

      const payload = userData?.user ? userData.user : userData;

      if (!payload) {
        throw new Error('Datos de usuario inválidos al registrar con Google');
      }

      const normalizedUser = {
        id: payload.userId || payload.uid || payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
      };

      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));

      if (token) {
        await AsyncStorage.setItem('authToken', token);
      }

      setUser(normalizedUser);
      await ensureTrackingIfNeeded(normalizedUser.role);

      // Sesión única (DENY)
      try {
        await sessionService.startSession({ policy: 'deny' });
      } catch (err: any) {
        if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes completar el registro: la cuenta ya está activa en otro dispositivo.');
          throw err;
        }
      }
    } catch (error) {
      console.error('Google register error:', error);
      throw error;
    }
  };

  const loginWithPhoneAndSMS = async (userData: any, token?: string) => {
    try {
      console.log('📱 Iniciando sesión con teléfono y SMS:', userData);

      // Determinar ID efectivo usando todos los campos posibles
      let effectiveId = userData.id || userData.uid || userData.userId;

      // Caso especial: registro por SMS usando custom token
      // result.user viene con userId (sin id/uid) y result.token es un custom token
      if (
        backendConfig.isFirebase() &&
        token &&
        userData.userId &&
        !userData.id &&
        !userData.uid
      ) {
        try {
          const auth = await getFirebaseAuth();
          const credential = await signInWithCustomToken(auth, token);
          if (credential?.user?.uid) {
            effectiveId = credential.user.uid;
          }
          console.log('✅ Sesión Firebase iniciada con custom token para registro por SMS');
        } catch (err: any) {
          console.warn('⚠️ No se pudo iniciar sesión con custom token (registro SMS):', err?.message || err);
        }
      } else if (
        // Caso: login por SMS (token es un ID token de RN Firebase Auth)
        backendConfig.isFirebase() &&
        token &&
        !userData.userId &&
        (userData.id || userData.uid)
      ) {
        try {
          const customToken = await firebaseAuthService.exchangeIdTokenForCustomToken(token);
          const auth = await getFirebaseAuth();
          const credential = await signInWithCustomToken(auth, customToken);
          if (credential?.user?.uid) {
            effectiveId = credential.user.uid;
          }
          console.log('✅ Sesión Firebase Web iniciada usando idToken de RN (login SMS)');
        } catch (err: any) {
          console.warn(
            '⚠️ No se pudo sincronizar sesión con Firebase Web en login SMS:',
            err?.message || err,
          );
        }
      }

      const normalizedUser = {
        id: effectiveId,
        email: userData.email,
        name: userData.name,
        phone: userData.phone,
        role: userData.role,
      };

      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));

      if (token) {
        await AsyncStorage.setItem('authToken', token);
      }

      setUser(normalizedUser);
      await ensureTrackingIfNeeded(normalizedUser.role);

      console.log('✅ Login con SMS exitoso');

      // Sesión única (DENY)
      try {
        await sessionService.startSession({ policy: 'deny' });
      } catch (err: any) {
        if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes iniciar sesión: la cuenta ya está activa en otro dispositivo.');
          throw err;
        }
      }
    } catch (error) {
      console.error('Phone SMS login error:', error);
      throw error;
    }
  };

  const getToken = async (): Promise<string | null> => {
    try {
      return await mainAuthService.getToken();
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithPhoneAndSMS, register, registerWithGoogle, logout, getToken, logoutInProgress }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Mantener compatibilidad con código existente
export const useAuthContext = useAuth;
