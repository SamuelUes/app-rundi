import type { User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '../config/firebase';

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
