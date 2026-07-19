/**
 * Auth Context - Backward-compatible wrapper around authStore (Zustand) + hooks.
 * Use useAuthStore directly in new code. This wrapper exists for legacy imports.
 */

import React, { ReactNode } from 'react';
import { useAuthStore, User } from '../stores/authStore';
import { useAuthActions } from '../hooks/shared/auth/useAuthActions';
import { useAuthInit } from '../hooks/shared/auth/useAuthInit';
import { useUserMode } from '../hooks/shared/auth/useUserMode';

export type { User };

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
  userMode: 'client' | 'driver';
  setUserMode: (mode: 'client' | 'driver') => Promise<void>;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  useAuthInit();
  return <>{children}</>;
};

export function useAuth(): AuthContextData {
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

// Mantener compatibilidad con código existente
export const useAuthContext = useAuth;
