import { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions, getFirebaseDatabase } from '../../../config/firebase';
import { ref, onDisconnect, get } from 'firebase/database';
import { useAuth } from '../auth/useAuth';
import sessionService from '../../../services/sessionService';

const DEFAULT_SERVICE_AREA_ID = 'ni-managua';

/**
 * useClientPresence
 * Mantiene un "heartbeat" del cliente en Realtime DB para habilitar lecturas de perfil.
 * - clientsLocations/{uid}: { latitude, longitude, isManual, timestamp, lastHeartbeat }
 * - presence/{uid}: { lastHeartbeat, role }
 */
export function useClientPresence() {
  const { user, userMode, loading } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const actionsRef = useRef<null | {
    markActive: ReturnType<typeof httpsCallable>;
    markClosed: ReturnType<typeof httpsCallable>;
  }>(null);
  const disconnectSetupRef = useRef(false);
  const disconnectUidRef = useRef<string | null>(null);

  useEffect(() => {
    // Solo para usuarios autenticados en modo cliente
    if (loading || !user?.id || userMode !== 'client') {
      return;
    }

    let cancelled = false;

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
        const functions = await getFirebaseFunctions();
        const uid = auth.currentUser?.uid || user.id;
        if (!uid) return;

        const markActive = httpsCallable(functions, 'markAppActive');
        const markClosed = httpsCallable(functions, 'markAppClosed');

        actionsRef.current = { markActive, markClosed };

        const deviceId = await sessionService.getDeviceId();
        await markActive({
          role: 'client',
          deviceId,
        });

        // Configurar onDisconnect después de markAppActive exitoso
        await setupOnDisconnect(uid);

        if (cancelled) return;

        // Intervalo de heartbeat (55s)
        intervalRef.current = setInterval(async () => {
          try {
            const devId = await sessionService.getDeviceId();
            await markActive({
              role: 'client',
              deviceId: devId,
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

      // Best-effort markAppClosed, onDisconnect es el respaldo confiable
      const actions = actionsRef.current;
      if (actions) {
        getFirebaseAuth()
          .then((auth) => {
            if (!auth.currentUser) return;
            sessionService.getDeviceId().then((deviceId) => {
              actions.markClosed({ role: 'client', deviceId }).catch(() => {
                // Silenciar: onDisconnect limpiará automáticamente
              });
            }).catch(() => {});
          })
          .catch(() => {});
      }
    };
  }, [loading, user?.id, userMode]);

  return null;
}
