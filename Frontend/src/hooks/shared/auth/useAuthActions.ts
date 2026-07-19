/**
 * useAuthActions - Hook for auth actions (login, register, logout, etc).
 * Extracted from AuthContext, uses authStore for state.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth, getFirebaseDatabase } from '../../../config/firebase';
import { ref, set, update, serverTimestamp } from 'firebase/database';
import { signInWithCustomToken } from 'firebase/auth';
import backendConfig from '../../../config/backendConfig';
import firebaseAuthService from '../../../services/auth/firebaseAuthService';
import localAuthService from '../../../services/auth/localAuthService';
import mainAuthService from '../../../services/auth/authService';
import backgroundLocationService from '../../../services/backgroundLocationService';
import sessionService from '../../../services/sessionService';
import alertService from '../../../services/alertService';
import { useAuthStore, User } from '../../../stores/authStore';
import { resolveUserModeFromRole, useUserMode } from './useUserMode';

function normalizeRoleValue(role: any): User['role'] | null {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (
    normalized === 'client' ||
    normalized === 'driver' ||
    normalized === 'designated_driver' ||
    normalized === 'admin'
  ) {
    return normalized as User['role'];
  }
  return null;
}

function normalizeUserData(raw: any): User {
  if (!raw) throw new Error('Datos de usuario inválidos');
  const id = raw.id || raw.userId || raw.uid;
  const email = raw.email || '';
  const name = raw.name || '';
  const role = normalizeRoleValue(raw.role) as User['role'];
  const phone = raw.phone;
  if (!id || !role) throw new Error('Respuesta de usuario incompleta');
  return { id, email, name, role, phone };
}

async function ensureTrackingIfNeeded(role?: User['role']) {
  if (role === 'driver' || role === 'designated_driver') {
    try {
      await backgroundLocationService.ensureBackgroundTrackingIntegrity();
    } catch (err) {
      console.warn('⚠️ No se pudo restaurar tracking:', err);
    }
  }
}

async function startSessionWithPolicy() {
  try {
    await sessionService.startSession({ policy: 'deny' });
  } catch (err: any) {
    if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
      return false;
    }
  }
  return true;
}

export function useAuthActions() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setLogoutInProgress = useAuthStore((s) => s.setLogoutInProgress);
  const { updateUserMode } = useUserMode();

  const authService = backendConfig.isFirebase() ? firebaseAuthService : localAuthService;

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const userData = await authService.login(email, password);
        const normalizedUser = normalizeUserData(userData);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);

        const sessionOk = await startSessionWithPolicy();
        if (!sessionOk) {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes iniciar sesión: la cuenta ya está activa en otro dispositivo.');
          throw new Error('SESSION_ACTIVE_ELSEWHERE');
        }
      } catch (error: any) {
        if (error?.code === 'ACCOUNT_DISABLED' || error?.message === 'ACCOUNT_DISABLED') {
          throw new Error('Tu cuenta está desactivada. Contacta soporte para reactivarla.');
        }
        throw error;
      }
    },
    [authService, setUser, updateUserMode],
  );

  const register = useCallback(
    async (registerData: any) => {
      try {
        const { email, password, name, phone, role, driverData, vehicleData } = registerData;
        if (!email || !password) throw new Error('Correo y contraseña requeridos');

        const userData = await authService.register(email, password, name, phone, role, driverData, vehicleData);

        if (userData?.needsManualLogin) {
          await login(email, password);
          return;
        }

        const normalizedUser = normalizeUserData(userData);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);

        const sessionOk = await startSessionWithPolicy();
        if (!sessionOk) {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes completar el registro: la cuenta ya está activa en otro dispositivo.');
          throw new Error('SESSION_ACTIVE_ELSEWHERE');
        }
      } catch (error) {
        console.error('Register error:', error);
        throw error;
      }
    },
    [authService, setUser, updateUserMode, login],
  );

  const logout = useCallback(async () => {
    const user = useAuthStore.getState().user;
    setLogoutInProgress(true);
    try {
      try {
        await backgroundLocationService.stopBackgroundLocationTracking();
      } catch (bgError) {
        console.log('⚠️ No se pudo detener tracking:', bgError);
      }

      try { await sessionService.endSession(); } catch {}

      const isDriverRole = user?.role === 'driver' || user?.role === 'designated_driver';
      if (isDriverRole && backendConfig.isFirebase()) {
        try {
          const auth = await getFirebaseAuth();
          const database = await getFirebaseDatabase();
          const firebaseUser = auth.currentUser;
          if (firebaseUser) {
            await set(ref(database, `driverLocations/${firebaseUser.uid}`), {
              status: 'offline',
              updatedAt: serverTimestamp(),
              lastSeen: serverTimestamp(),
            });
            await update(ref(database, `driversInfo/${firebaseUser.uid}`), {
              updatedAt: serverTimestamp(),
              lastSeen: serverTimestamp(),
            });
          }
        } catch (fbError) {
          console.log('⚠️ No se pudo actualizar Firebase:', fbError);
        }
      }

      await authService.logout();
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('userMode');
      setUser(null);
      useAuthStore.getState().setUserMode('client');
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      await AsyncStorage.removeItem('user');
    } finally {
      setLogoutInProgress(false);
    }
  }, [authService, setUser, setLogoutInProgress]);

  const loginWithGoogle = useCallback(
    async (userData: any) => {
      try {
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        const normalizedRole = (normalizeRoleValue(userData.role) || 'client') as User['role'];
        const currentUser = useAuthStore.getState().user;
        setUser(currentUser ? { ...currentUser, role: normalizedRole } : userData);
        await updateUserMode(resolveUserModeFromRole(normalizedRole));
        await ensureTrackingIfNeeded(normalizedRole);

        const sessionOk = await startSessionWithPolicy();
        if (!sessionOk) {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes iniciar sesión: la cuenta ya está activa en otro dispositivo.');
          throw new Error('SESSION_ACTIVE_ELSEWHERE');
        }
      } catch (error) {
        console.error('Google login error:', error);
        throw error;
      }
    },
    [authService, setUser, updateUserMode],
  );

  const registerWithGoogle = useCallback(
    async (userData: any, token?: string) => {
      try {
        const payload = userData?.user ? userData.user : userData;
        if (!payload) throw new Error('Datos inválidos');

        const normalizedUser = {
          id: payload.userId || payload.uid || payload.id,
          email: payload.email,
          name: payload.name,
          role: (normalizeRoleValue(payload.role) || 'client') as User['role'],
        };

        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        if (token) await AsyncStorage.setItem('authToken', token);
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);

        const sessionOk = await startSessionWithPolicy();
        if (!sessionOk) {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes completar el registro: la cuenta ya está activa en otro dispositivo.');
          throw new Error('SESSION_ACTIVE_ELSEWHERE');
        }
      } catch (error) {
        console.error('Google register error:', error);
        throw error;
      }
    },
    [authService, setUser, updateUserMode],
  );

  const loginWithPhoneAndSMS = useCallback(
    async (userData: any, token?: string) => {
      try {
        let effectiveId = userData.id || userData.uid || userData.userId;

        if (backendConfig.isFirebase() && token && userData.userId && !userData.id && !userData.uid) {
          try {
            const auth = await getFirebaseAuth();
            if (auth.currentUser?.uid) {
              effectiveId = auth.currentUser.uid;
            } else {
              const credential = await signInWithCustomToken(auth, token);
              if (credential?.user?.uid) effectiveId = credential.user.uid;
            }
          } catch (err: any) {
            console.warn('⚠️ Custom token sign-in failed:', err?.message);
          }
        } else if (backendConfig.isFirebase() && token && !userData.userId && (userData.id || userData.uid)) {
          try {
            const auth = await getFirebaseAuth();
            if (auth.currentUser?.uid) {
              effectiveId = auth.currentUser.uid;
            } else {
              const customToken = await firebaseAuthService.exchangeIdTokenForCustomToken(token);
              const credential = await signInWithCustomToken(auth, customToken);
              if (credential?.user?.uid) effectiveId = credential.user.uid;
            }
          } catch (err: any) {
            console.warn('⚠️ IdToken exchange failed:', err?.message);
          }
        }

        let profileData: any = null;
        try {
          profileData = await firebaseAuthService.getUserProfile(effectiveId);
        } catch (profileErr) {
          console.warn('⚠️ No se pudo obtener perfil:', profileErr);
        }

        const finalRole = normalizeRoleValue(profileData?.role) || normalizeRoleValue(userData.role) || 'client';
        const normalizedUser = {
          id: effectiveId,
          email: userData.email,
          name: profileData?.name || userData.name,
          phone: userData.phone,
          role: finalRole as User['role'],
        };

        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        if (token) await AsyncStorage.setItem('authToken', token);
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);

        const sessionOk = await startSessionWithPolicy();
        if (!sessionOk) {
          try { await authService.logout(); } catch {}
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('No puedes iniciar sesión: la cuenta ya está activa en otro dispositivo.');
          throw new Error('SESSION_ACTIVE_ELSEWHERE');
        }
      } catch (error) {
        console.error('Phone SMS login error:', error);
        throw error;
      }
    },
    [setUser, updateUserMode],
  );

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      return await mainAuthService.getToken();
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }, []);

  return {
    login,
    register,
    logout,
    loginWithGoogle,
    registerWithGoogle,
    loginWithPhoneAndSMS,
    getToken,
  };
}
