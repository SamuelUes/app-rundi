import { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '../config/firebase';
import { useAuth } from '../context/AuthContext';

/**
 * useClientPresence
 * Mantiene un "heartbeat" del cliente en Realtime DB para habilitar lecturas de perfil.
 * - clientLocations/{uid}: { latitude, longitude, isManual, timestamp, lastHeartbeat }
 * - presence/{uid}: { lastHeartbeat, role }
 */
export function useClientPresence() {
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const actionsRef = useRef<null | {
    markActive: ReturnType<typeof httpsCallable>;
    markClosed: ReturnType<typeof httpsCallable>;
  }>(null);

  useEffect(() => {
    // Solo para clientes autenticados
    if (!user?.id || user.role !== 'client') {
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const auth = await getFirebaseAuth();
        const functions = await getFirebaseFunctions();
        const uid = auth.currentUser?.uid || user.id;
        if (!uid) return;

        const markActive = httpsCallable(functions, 'markAppActive');
        const markClosed = httpsCallable(functions, 'markAppClosed');

        actionsRef.current = { markActive, markClosed };

        await markActive({
          role: 'client',
          location: {
            latitude: 0,
            longitude: 0,
            isManual: false,
          },
        });

        if (cancelled) return;

        // Intervalo de heartbeat (55s)
        intervalRef.current = setInterval(async () => {
          try {
            await markActive({
              role: 'client',
            });
          } catch (err) {
            console.warn('[useClientPresence] Heartbeat error:', (err as any)?.message || err);
          }
        }, 55 * 1000);
      } catch (error) {
        console.warn('[useClientPresence] setup error:', (error as any)?.message || error);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      const actions = actionsRef.current;
      if (actions) {
        actions.markClosed({ role: 'client' }).catch((err: any) => {
          console.warn('[useClientPresence] markAppClosed error:', err?.message || err);
        });
      }
    };
  }, [user?.id, user?.role]);

  return null;
}
