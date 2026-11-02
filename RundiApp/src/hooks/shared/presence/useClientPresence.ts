import { useEffect, useRef } from 'react';
import { getFirebaseAuth } from '../../../config/firebase';
import { useAuth } from '../auth/useAuth';
import sessionService from '../../../services/user/sessionService';
import alertService from '../../../services/notification/alertService';
import backgroundLocationService from '../../../services/map/backgroundLocationService';
import { writePresence } from '../../../live/driverLive';

/**
 * useClientPresence (v2 — Firestore)
 * Heartbeat del cliente: REALTIME_user_sessions/{uid} + REALTIME_presence/{uid}.
 * No hay colección de ubicación de cliente fuera de viaje en v2 — el GPS del
 * cliente solo vive en trips_live/{tripId}/locations durante el viaje.
 */
export function useClientPresence() {
  const { user, userMode, loading, logout } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Solo para usuarios autenticados en modo cliente
    if (
      loading ||
      !user?.id ||
      (user.role !== 'client' && user.role !== 'admin') ||
      userMode !== 'client'
    ) {
      return;
    }

    let cancelled = false;
    let sessionConflictHandled = false;

    // Confirma contra Firestore que la sesión realmente pasó a otro dispositivo
    // antes de cerrar sesión; los rechazos transitorios no son conflictos.
    const verifyRealConflict = async (): Promise<boolean> => {
      try {
        const diag = await sessionService.getSessionOwnershipDiagnostic();
        if (!diag.authReady) return false;
        if (diag.sessionExists === false) {
          try {
            await sessionService.startSession({ policy: 'deny', mode: 'client', source: 'clientPresence:reclaim' });
            return false;
          } catch (err: any) {
            return sessionService.isSessionActiveElsewhereError(err);
          }
        }
        return diag.sameDevice === false;
      } catch {
        return false;
      }
    };

    const runWithSessionRecovery = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error: any) {
        if (!sessionService.isSessionActiveElsewhereError(error)) throw error;
        if (await verifyRealConflict()) throw error;
        await operation();
      }
    };

    const handleSessionConflict = async () => {
      if (sessionConflictHandled) return;
      if (!(await verifyRealConflict())) {
        console.log('ℹ️ [clientPresence] Rechazo de sesión descartado: Firestore confirma este dispositivo');
        return;
      }
      sessionConflictHandled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      await backgroundLocationService.stopBackgroundLocationTracking();
      alertService.showSessionActiveAlert('No puedes seguir usando la cuenta: está activa en otro dispositivo.');
      await logout();
    };

    const start = async () => {
      try {
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser || firebaseUser.uid !== user.id) return;
        const uid = firebaseUser.uid;

        await runWithSessionRecovery(() =>
          sessionService.startSession({ policy: 'deny', mode: 'client', source: 'clientPresence:init' }),
        );
        await writePresence(uid, 'online');

        if (cancelled) return;

        // Intervalo de heartbeat (55s)
        intervalRef.current = setInterval(async () => {
          try {
            await runWithSessionRecovery(() =>
              sessionService.heartbeatSession({ source: 'clientPresence:heartbeat' }),
            );
            await writePresence(uid, 'online');
          } catch (err) {
            if (sessionService.isSessionActiveElsewhereError(err)) {
              await handleSessionConflict();
              return;
            }
            console.warn('[useClientPresence] Heartbeat error:', (err as any)?.message || err);
          }
        }, 55 * 1000);
      } catch (error) {
        if (sessionService.isSessionActiveElsewhereError(error)) {
          await handleSessionConflict();
          return;
        }
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

      // Best-effort offline; el scheduler cubre el caso de kill.
      getFirebaseAuth()
        .then((auth) => {
          const uid = auth.currentUser?.uid;
          if (!uid || uid !== user?.id) return;
          writePresence(uid, 'offline').catch(() => {});
        })
        .catch(() => {});
    };
  }, [loading, logout, user?.id, userMode]);

  return null;
}
