/**
 * Hook de autenticación — fachada delgada sobre authStore (Zustand) + hooks de acciones.
 * Reemplazo directo del legacy `context/AuthContext.tsx` (sin Provider, sin Context).
 *
 * Expone la misma API que `useAuth` anterior para que los consumidores no cambien.
 */
import { useAuthStore, User } from '../../../stores/authStore';
import { useAuthActions } from './useAuthActions';
import { useUserMode } from './useUserMode';

export type { User };

export interface AuthApi {
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
  userMode: 'client' | 'driver';
  setUserMode: (mode: 'client' | 'driver') => Promise<void>;
}

export function useAuth(): AuthApi {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const logoutInProgress = useAuthStore((s) => s.logoutInProgress);
  const { userMode, updateUserMode } = useUserMode();
  const { login, register, logout, loginWithGoogle, registerWithGoogle, loginWithPhoneAndSMS, getToken } =
    useAuthActions();

  return {
    user,
    loading,
    login,
    loginWithGoogle,
    loginWithPhoneAndSMS,
    register,
    registerWithGoogle,
    logout,
    getToken,
    logoutInProgress,
    userMode,
    setUserMode: updateUserMode,
  };
}

// Compatibilidad con código que importaba useAuthContext del legacy.
export const useAuthContext = useAuth;
