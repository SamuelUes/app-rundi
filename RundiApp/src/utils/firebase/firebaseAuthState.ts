import { onAuthStateChanged, type Auth } from 'firebase/auth';

export function waitForFirebaseAuthInitialization(auth: Auth): Promise<void> {
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    let initialized = false;

    const finish = () => {
      if (initialized) return;
      initialized = true;
      unsubscribe?.();
      resolve();
    };

    unsubscribe = onAuthStateChanged(auth, finish);
    if (initialized) unsubscribe();
  });
}
