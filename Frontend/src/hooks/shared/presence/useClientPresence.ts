import { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions, getFirebaseDatabase } from '../../../config/firebase';
import { ref, onDisconnect, get } from 'firebase/database';
import { useAuth } from '../auth/useAuth';
import sessionService from '../../../services/sessionService';
import alertService from '../../../services/alertService';
import backgroundLocationService from '../../../services/backgroundLocationService';

const DEFAULT_SERVICE_AREA_ID = 'ni-managua';

/**
 * useClientPresence
 * Mantiene un "heartbeat" del cliente en Realtime DB para habilitar lecturas de perfil.
 * - clientsLocations/{uid}: { latitude, longitude, isManual, timestamp, lastHeartbeat }
 * - presence/{uid}: { lastHeartbeat, role }
 */
export function useClientPresence() {
  const { user, userMode, loading, logout } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const actionsRef = useRef<null | {
    markActive: ReturnType<typeof httpsCallable>;
    markClosed: ReturnType<typeof httpsCallable>;
  }>(null);
  const disconnectSetupRef = useRef(false);
  const disconnectUidRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);

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

    // Confirma contra RTDB que la sesión realmente pasó a otro dispositivo
    // antes de cerrar sesión; los rechazos transitorios no son conflictos.
    const verifyRealConflict = async (): Promise<boolean> => {
      try {
        const diag = await sessionService.getSessionOwnershipDiagnostic();
        if (!diag.authReady) return false;
        if (diag.sessionExists === false) {
          try {
            await sessionService.startSession({ policy: 'deny', source: 'clientPresence:reclaim' });
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
        console.log('ℹ️ [clientPresence] Rechazo de sesión descartado: RTDB confirma este dispositivo');
        return;
      }
      sessionConflictHandled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      await backgroundLocationService.stopBackgroundLocationTracking();
      alertService.showSessionActiveAlert('No puedes seguir usando la cuenta: está activa en otro dispositivo.');
      await logout();
    };

    const setupOnDisconnect = async (uid: string) => {
      try {
        const database = await getFirebaseDatabase();

        let serviceAreaId = DEFAULT_SERVICE_AREA_ID;
        try {
          const snap = await get(ref(database, `sessions/${uid}/serviceAreaId`));
          const val = snap.val();
          if (typeof val === 'string' && val.trim()) {
            serviceAreaId = val.trim();
          }
        } catch {
 // fallback a default
        }

        // onDisconnect individuales por path (root .write=false bloquea multi-path desde raíz)
        await Promise.all([
          onDisconnect(ref(database, `clientsLocations/${uid}`)).remove(),
          onDisconnect(ref(database, `clientsInfo/${uid}`)).remove(),
          onDisconnect(ref(database, `presence/${uid}`)).remove(),
          onDisconnect(ref(database, `clientsLocationsByArea/${serviceAreaId}/${uid}`)).remove(),
          onDisconnect(ref(database, `clientsLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${uid}`)).remove(),
        ]);

        disconnectSetupRef.current = true;
        disconnectUidRef.current = uid;
      } catch {
 // best-effort
      }
    };

    const start = async () => {
      try {
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser || firebaseUser.uid !== user.id) return;
        const [functions, deviceId] = await Promise.all([
          getFirebaseFunctions(),
          sessionService.getDeviceId(),
        ]);
        const uid = firebaseUser.uid;

        const markActive = httpsCallable(functions, 'markAppActive');
        const markClosed = httpsCallable(functions, 'markAppClosed');

        actionsRef.current = { markActive, markClosed };
        deviceIdRef.current = deviceId;

        await runWithSessionRecovery(() =>
          markActive({
            role: 'client',
            deviceId,
            source: 'clientPresence:init',
          }),
        );

        // Configurar onDisconnect después de markAppActive exitoso
        await setupOnDisconnect(uid);

        if (cancelled) return;

        // Intervalo de heartbeat (55s)
        intervalRef.current = setInterval(async () => {
          try {
            // deviceId no cambia por sesión: reusar el obtenido en init.
            const devId = deviceIdRef.current ?? (await sessionService.getDeviceId());
            await runWithSessionRecovery(() =>
              markActive({
                role: 'client',
                deviceId: devId,
                source: 'clientPresence:heartbeat',
              }),
            );
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

      // Best-effort markAppClosed, onDisconnect es el respaldo confiable
      const actions = actionsRef.current;
      if (actions) {
        getFirebaseAuth()
          .then((auth) => {
            if (!auth.currentUser || auth.currentUser.uid !== user?.id) return;
            sessionService.getDeviceId().then((deviceId) => {
              actions.markClosed({ role: 'client', deviceId }).catch(() => {
                // Silenciar: onDisconnect limpiará automáticamente
              });
            }).catch(() => {});
          })
          .catch(() => {});
      }
    };
  }, [loading, logout, user?.id, userMode]);

  return null;
}
