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
  role: 'client' | 'driver' | 'admin';
}

interface AuthContextData {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (registerData: any) => Promise<void>;
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
        setUser(JSON.parse(userData));
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
      
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      
      setUser(userData);
    } catch (error) {
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

  const getToken = async (): Promise<string | null> => {
    try {
      // Usar el mainAuthService que tiene getToken()
      return await mainAuthService.getToken();
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, getToken }}>
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
