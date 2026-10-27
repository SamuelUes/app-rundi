import type { User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '../config/firebase';

export function isUnauthenticatedError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'unauthenticated' || code.endsWith('/unauthenticated') || message.includes('unauthenticated');
}

const FATAL_TOKEN_ERROR_CODES = new Set([
  'auth/user-token-expired',
  'auth/invalid-user-token',
  'auth/user-disabled',
  'auth/user-not-found',
]);

/**
 * Fuerza el refresh del ID token. Si el refresh falla con un error fatal de
 * sesión (p. ej. sesión persistida desde emuladores u otro proyecto, o usuario
 * deshabilitado), ningún callable podrá autenticarse: se cierra sesión para
 * que la app vuelva al login en lugar de fallar en cada request.
 */
export async function forceRefreshIdTokenOrSignOut(authUser: FirebaseUser): Promise<void> {
  try {
    await authUser.getIdToken(true);
  } catch (error: any) {
    if (FATAL_TOKEN_ERROR_CODES.has(String(error?.code || ''))) {
      console.warn('⚠️ [firebaseAuthReady] Sesión Firebase inválida; cerrando sesión para re-autenticar');
      const auth = await getFirebaseAuth();
      await auth.signOut();
    }
    throw error;
  }
}

export async function requireFirebaseAuthUser(expectedUid?: string): Promise<FirebaseUser> {
  const auth = await getFirebaseAuth();
  const user = auth.currentUser;
  if (!user || (expectedUid && user.uid !== expectedUid)) {
    throw new Error('Se requiere una sesión de Firebase válida');
  }
  return user;
}

export async function waitForFirebaseAuthUser(
  expectedUid?: string,
  timeoutMs = 6000,
): Promise<FirebaseUser | null> {
  const auth = await getFirebaseAuth();

  const current = auth.currentUser;
  if (current && (!expectedUid || current.uid === expectedUid)) {
    return current;
  }

  return await new Promise<FirebaseUser | null>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (user: FirebaseUser | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      unsubscribe?.();
      resolve(user);
    };

    timer = setTimeout(() => finish(null), timeoutMs);
    unsubscribe = auth.onAuthStateChanged((user) => {
      const typedUser = (user as FirebaseUser | null) ?? null;

      if (expectedUid) {
        if (!typedUser) {
          return;
        }
        if (typedUser.uid !== expectedUid) {
          return;
        }
        finish(typedUser);
        return;
      }

      finish(typedUser);
    });
  });
}
