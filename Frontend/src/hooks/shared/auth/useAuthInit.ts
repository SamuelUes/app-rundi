/**
 * useAuthInit - Hook for auth initialization logic.
 * Handles Firebase auth state listener and loading user from AsyncStorage.
 * Extracted from AuthContext.
 */

import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseAuth } from '../../../config/firebase';
import { User as FirebaseAuthUser } from 'firebase/auth';
import backendConfig from '../../../config/backendConfig';
import firebaseAuthService from '../../../services/auth/firebaseAuthService';
import sessionService from '../../../services/sessionService';
import alertService from '../../../services/alertService';
import storageCleanupService from '../../../services/storageCleanupService';
import { useAuthStore, User } from '../../../stores/authStore';
import { resolveUserModeFromRole } from './useUserMode';

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

async function ensureTrackingIfNeeded(role?: User['role']) {
  if (role === 'driver' || role === 'designated_driver') {
    try {
      await (await import('../../../services/backgroundLocationService')).default.ensureBackgroundTrackingIntegrity();
    } catch (err) {
      console.warn('⚠️ No se pudo restaurar tracking:', err);
    }
  }
}

export function useAuthInit() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setUserMode = useAuthStore((s) => s.setUserMode);

  useEffect(() => {
    storageCleanupService
      .ensureFreshInstallCleanup()
      .catch((err) => console.warn('⚠️ [AuthInit] cleanup error:', err))
      .finally(() => loadUser());

    if (backendConfig.isFirebase()) {
      const setupAuthListener = async () => {
        try {
          const unsubscribe = await firebaseAuthService.onAuthStateChange(async (firebaseUser) => {
            if (firebaseUser) {
              try {
                const userData = await firebaseAuthService.getUserProfile(firebaseUser.uid);
                const role = (normalizeRoleValue(userData.role) || 'client') as User['role'];
                setUser({
                  id: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  name: userData.name,
                  role,
                  phone: userData.phone,
                });
              } catch (profileError: any) {
                if (profileError?.code === 'ACCOUNT_DISABLED' || profileError?.message === 'ACCOUNT_DISABLED') {
                  try { await firebaseAuthService.logout(); } catch {}
                  await AsyncStorage.removeItem('user');
                  setUser(null);
                  setUserMode('client');
                  alertService.showErrorAlert('Tu cuenta está desactivada. Contacta soporte para reactivarla.');
                  return;
                }
                if (profileError?.code === 'PROFILE_NOT_FOUND') {
                  setUser(null);
                  setUserMode('client');
                  return;
                }
                console.error('[AuthInit] Error obteniendo perfil:', profileError);
              }
            } else {
              setUser(null);
              setUserMode('client');
            }
          });
          return unsubscribe;
        } catch (error) {
          console.error('Error configurando auth listener:', error);
          return () => {};
        }
      };

      const cleanupPromise = setupAuthListener();
      return () => {
        cleanupPromise.then((unsubscribe) => unsubscribe());
      };
    }
  }, []);

  const waitForFirebaseUser = async (
    expectedId?: string,
    timeoutMs: number = 4000,
  ): Promise<FirebaseAuthUser | null> => {
    const auth = await getFirebaseAuth();
    if (auth.currentUser && (!expectedId || auth.currentUser.uid === expectedId)) {
      return auth.currentUser;
    }

    return new Promise(async (resolve) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (unsubscribe) unsubscribe();
          resolve(null);
        }
      }, timeoutMs);

      try {
        unsubscribe = await firebaseAuthService.onAuthStateChange((firebaseUser) => {
          if (firebaseUser && (!expectedId || firebaseUser.uid === expectedId)) {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              unsubscribe?.();
              resolve(firebaseUser);
            }
          }
        });
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(null);
        }
      }
    });
  };

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('📱 Usuario cargado desde AsyncStorage:', parsedUser.role);

        if (!parsedUser.id && parsedUser.uid) {
          parsedUser.id = parsedUser.uid;
          await AsyncStorage.setItem('user', JSON.stringify(parsedUser));
        }

        const normalizedRole = normalizeRoleValue(parsedUser.role);
        if (!normalizedRole) {
          await AsyncStorage.removeItem('user');
          setUser(null);
          setLoading(false);
          return;
        }

        if (parsedUser.role !== normalizedRole) {
          parsedUser.role = normalizedRole;
          await AsyncStorage.setItem('user', JSON.stringify(parsedUser));
        }

        const firebaseUser = await waitForFirebaseUser(parsedUser.id);
        if (!firebaseUser || firebaseUser.uid !== parsedUser.id) {
          await AsyncStorage.removeItem('user');
          setUser(null);
          alertService.showErrorAlert('Tu sesión caducó. Por favor inicia sesión nuevamente.');
          setLoading(false);
          return;
        }

        setUser(parsedUser);
        try {
          const storedMode = await AsyncStorage.getItem('userMode');
          if (storedMode === 'client' || storedMode === 'driver') {
            setUserMode(storedMode);
          } else {
            const mode = resolveUserModeFromRole(parsedUser.role);
            setUserMode(mode);
          }
        } catch {
          const mode = resolveUserModeFromRole(parsedUser.role);
          setUserMode(mode);
        }
        await ensureTrackingIfNeeded(parsedUser.role);

        try {
          await sessionService.startSession({ policy: 'deny' });
        } catch (err: any) {
          if (err?.code === 'SESSION_ACTIVE_ELSEWHERE') {
            try { await firebaseAuthService.logout(); } catch {}
            await AsyncStorage.removeItem('user');
            setUser(null);
            alertService.showErrorAlert('No puedes acceder: tu cuenta ya está activa en otro dispositivo.');
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
}
