import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth, getFirebaseDatabase } from '../config/firebase';
import { ref, set, serverTimestamp } from 'firebase/database';
import backendConfig from '../config/backendConfig';
import firebaseAuthService from '../services/auth/firebaseAuthService';
import localAuthService from '../services/auth/localAuthService';
import mainAuthService from '../services/auth/authService';

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
  loginWithGoogle: (userData: any) => Promise<void>;
  loginWithPhoneAndSMS: (userData: any, token?: string) => Promise<void>;
  register: (registerData: any) => Promise<void>;
  registerWithGoogle: (userData: any) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Seleccionar el servicio según el modo
  const authService = backendConfig.isFirebase() ? firebaseAuthService : localAuthService;

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
      
      console.log('🔐 Login userData recibido:', JSON.stringify(userData, null, 2));
      console.log('🔐 Rol del usuario:', userData?.role);
      
      // Normalizar userData: convertir uid a id si es necesario
      const normalizedUser = {
        id: userData.uid || userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
      };
      
      console.log('🔐 Usuario normalizado:', JSON.stringify(normalizedUser, null, 2));
      
      await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
      
      setUser(normalizedUser);
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (registerData: any) => {
    try {
      const { email, password, name, phone, role, driverData, vehicleData } = registerData;
      
      const userData = await authService.register(email, password, name, phone, role, driverData, vehicleData);
      
      // Si el login automático falló, hacer login manual
      if (userData.needsManualLogin) {
        console.log('⚠️ Haciendo login manual después del registro...');
        try {
          await login(email, password);
          console.log('✅ Login manual exitoso');
        } catch (loginError) {
          console.error('❌ Login manual falló:', loginError);
          // Aún así, el registro fue exitoso
          throw new Error('Registro exitoso, pero no se pudo iniciar sesión automáticamente. Por favor, inicia sesión manualmente.');
        }
      } else {
        // Login automático funcionó
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      }
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Marcar como offline en Firebase antes de hacer logout (solo conductores)
      if (user?.role === 'driver' && backendConfig.isFirebase()) {
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
  };

  const loginWithGoogle = async (userData: any) => {
    try {
      console.log('🔐 Iniciando sesión con Google:', userData);
      
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const registerWithGoogle = async (userData: any) => {
    try {
      console.log('📝 Registrando con Google:', userData);
      
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    } catch (error) {
      console.error('Google register error:', error);
      throw error;
    }
  };

  const loginWithPhoneAndSMS = async (userData: any, token?: string) => {
    try {
      console.log('📱 Iniciando sesión con teléfono y SMS:', userData);

      const normalizedUser = {
        id: userData.id || userData.uid,
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

      console.log('✅ Login con SMS exitoso');
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
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithPhoneAndSMS, register, registerWithGoogle, logout, getToken }}>
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
