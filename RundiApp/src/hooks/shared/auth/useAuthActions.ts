/**
 * useAuthActions - Hook for auth actions (login, register, logout, etc).
 * Extracted from AuthContext, uses authStore for state.
 */

import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth } from '../../../config/firebase';
import { writePresence } from '../../../live/driverLive';
import { deactivateAvailability } from '../../../api/compliance';
import { signInWithCustomToken } from 'firebase/auth';
import backendConfig from '../../../config/backendConfig';
import firebaseAuthService from '../../../services/auth/firebaseAuthService';
import localAuthService from '../../../services/auth/localAuthService';
import mainAuthService from '../../../services/auth/authService';
import backgroundLocationService from '../../../services/map/backgroundLocationService';
import sessionService from '../../../services/user/sessionService';
import fcmService from '../../../services/notification/fcmService';
import { clearVoipToken } from '../../../native/voip';
import preflightService from '../../../services/ride/preflightService';
import { clearPreflightResult } from '../../../stores/preflightStore';
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
  const profilePhoto = raw.profilePhoto || raw.profile_photo || raw.photoURL || raw.photoUrl;
  if (!id || !role) throw new Error('Respuesta de usuario incompleta');
  return { id, email, name, role, phone, profilePhoto };
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

async function startSessionWithPolicy(authService: any, setUser: (user: User | null) => void) {
  if (!backendConfig.isFirebase()) return;

  try {
    await sessionService.startSession({ policy: 'deny', source: 'authActions' });
  } catch (err: any) {
    try { await authService.logout(); } catch {}
    await AsyncStorage.removeItem('user');
    setUser(null);

    if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
      const error = new Error('SESSION_ACTIVE_ELSEWHERE');
      (error as any).code = 'SESSION_ACTIVE_ELSEWHERE';
      throw error;
    }

    throw err;
  }
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
        await startSessionWithPolicy(authService, setUser);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);
      } catch (error: any) {
        const accountStatusError =
          error?.code === 'ACCOUNT_DISABLED' ||
          error?.code === 'ACCOUNT_DEACTIVATED' ||
          error?.code === 'ACCOUNT_DELETED' ||
          ['ACCOUNT_DISABLED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_DELETED'].includes(error?.message);
        if (accountStatusError) {
          const auth = await getFirebaseAuth();
          await auth.signOut().catch(() => undefined);
          throw new Error('Esta cuenta ya no puede iniciar sesión.');
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
        await startSessionWithPolicy(authService, setUser);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);
      } catch (error) {
        console.error('Register error:', error);
        throw error;
      }
    },
    [authService, setUser, updateUserMode, login],
  );

  const logout = useCallback(async () => {
    const user = useAuthStore.getState().user;
    preflightService.clearCache();
    clearPreflightResult();
    setLogoutInProgress(true);
    try {
      try {
        await backgroundLocationService.stopBackgroundLocationTracking();
      } catch (bgError) {
        console.log('⚠️ No se pudo detener tracking:', bgError);
      }

      const isDriverRole = user?.role === 'driver' || user?.role === 'designated_driver';
      if (isDriverRole && backendConfig.isFirebase()) {
        try {
          const auth = await getFirebaseAuth();
          const firebaseUser = auth.currentUser;
          if (firebaseUser) {
            // Sesión de disponibilidad revocada por REST + presencia offline
            // (reemplaza driversLocations/driversInfo; best-effort: si el API
            // no responde el sweep backend igual cierra la sesión).
            await deactivateAvailability().catch(() => {});
            await writePresence(firebaseUser.uid, 'offline');
          }
        } catch (fbError) {
          console.log('⚠️ No se pudo actualizar Firebase:', fbError);
        }
      }

      // Los docs fcmTokens/voipTokens solo se pueden borrar con la sesión
      // Firebase aún viva (rules exigen isOwner): esto va ANTES de
      // authService.logout(), que hace signOut. Si quedan huérfanos, el
      // backend sigue mandando push de la cuenta cerrada a este dispositivo.
      try {
        await fcmService.clearToken();
        await clearVoipToken(user?.id ?? null);
      } catch (pushError) {
        console.log('⚠️ No se pudieron limpiar tokens push:', pushError);
      }

      try { await sessionService.endSession(); } catch {}
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
        const normalizedRole = (normalizeRoleValue(userData.role) || 'client') as User['role'];
        await startSessionWithPolicy(authService, setUser);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        const currentUser = useAuthStore.getState().user;
        setUser(currentUser ? { ...currentUser, ...userData, role: normalizedRole } : userData);
        await updateUserMode(resolveUserModeFromRole(normalizedRole));
        await ensureTrackingIfNeeded(normalizedRole);
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
          profilePhoto: payload.profilePhoto || payload.profile_photo || payload.photoURL || payload.photoUrl,
        };

        await startSessionWithPolicy(authService, setUser);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        if (token) await AsyncStorage.setItem('authToken', token);
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);
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
              // v2: no hay exchange idToken→custom token; se intenta el token
              // directamente como custom token (si el backend local lo emite).
              const credential = await signInWithCustomToken(auth, token);
              if (credential?.user?.uid) effectiveId = credential.user.uid;
            }
          } catch (err: any) {
            console.warn('⚠️ Custom token sign-in failed:', err?.message);
          }
        }

        let profileData: any = null;
        try {
          profileData = await firebaseAuthService.getUserProfile(effectiveId);
        } catch (profileErr: any) {
          const accountStatusError =
            ['ACCOUNT_DISABLED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_DELETED'].includes(profileErr?.code) ||
            ['ACCOUNT_DISABLED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_DELETED'].includes(profileErr?.message);
          if (accountStatusError) {
            await authService.logout().catch(() => undefined);
            await AsyncStorage.removeItem('user');
            setUser(null);
            throw new Error('Esta cuenta ya no puede iniciar sesión.');
          }
          console.warn('⚠️ No se pudo obtener perfil:', profileErr);
        }

        const finalRole = normalizeRoleValue(profileData?.role) || normalizeRoleValue(userData.role) || 'client';
        const normalizedUser = {
          id: effectiveId,
          email: userData.email,
          name: profileData?.name || userData.name,
          phone: userData.phone,
          role: finalRole as User['role'],
          profilePhoto: profileData?.profilePhoto || profileData?.profile_photo || profileData?.photoURL || profileData?.photoUrl,
        };

        await startSessionWithPolicy(authService, setUser);
        await AsyncStorage.setItem('user', JSON.stringify(normalizedUser));
        if (token) await AsyncStorage.setItem('authToken', token);
        setUser(normalizedUser);
        await updateUserMode(resolveUserModeFromRole(normalizedUser.role));
        await ensureTrackingIfNeeded(normalizedUser.role);
      } catch (error) {
        console.error('Phone SMS login error:', error);
        throw error;
      }
    },
    [authService, setUser, updateUserMode],
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
