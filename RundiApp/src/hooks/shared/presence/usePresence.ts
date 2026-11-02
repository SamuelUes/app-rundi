import { useEffect, useRef, useState } from 'react';
import { getFirebaseAuth } from '../../../config/firebase';
import { useAuth } from '../auth/useAuth';
import { AppState, AppStateStatus } from 'react-native';
import sessionService from '../../../services/user/sessionService';
import driverAvailabilityService from '../../../services/driver/driverAvailabilityService';
import alertService from '../../../services/notification/alertService';
import backgroundLocationService from '../../../services/map/backgroundLocationService';
import { writePresence, writeDriverLiveLocation } from '../../../live/driverLive';

/**
 * Presencia del conductor (v2 — Firestore).
 * - Sesión: REALTIME_user_sessions/{uid} (startSession/heartbeatSession).
 * - Presencia: REALTIME_presence/{uid} (state online/offline).
 * - Estado vivo: REALTIME_drivers_live/{uid}.status.
 * No hay onDisconnect: el scheduler backend marca offline cuando lastSeen
 * supera el timeout (doc §7.2).
 */
export function usePresence() {
  const { user, userMode, logout } = useAuth();
  const appState = useRef(AppState.currentState);
  const sessionHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionConflictUidRef = useRef<string | null>(null);
  const initializedPresenceUidRef = useRef<string | null>(null);

  useEffect(() => {
    const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
    // Solo configurar presencia para conductores autenticados en modo conductor
    if (!user?.id || !isDriverCapable || userMode !== 'driver') {
      initializedPresenceUidRef.current = null;
      return;
    }

    // Confirma contra Firestore que la sesión realmente pasó a otro dispositivo
    // antes de cerrar sesión. Fallas transitorias (sesión ausente en medio de
    // una re-creación, latencia) no son conflictos.
    const verifyRealConflict = async (): Promise<boolean> => {
      try {
        const diag = await sessionService.getSessionOwnershipDiagnostic();
        if (!diag.authReady) return false;
        if (diag.sessionExists === false) {
          // Sesión ausente: re-reclamarla con el mismo deviceId es seguro.
          try {
            await sessionService.startSession({ policy: 'deny', mode: 'driver', source: 'driverPresence:reclaim' });
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

    // Ejecuta una operación de sesión con una reintentada después de
    // recuperar la propiedad (si el rechazo no era un conflicto real).
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
      if (sessionConflictUidRef.current === user.id) return;
      if (!(await verifyRealConflict())) {
        console.log('ℹ️ [presence] Rechazo de sesión descartado: Firestore confirma este dispositivo');
        return;
      }
      sessionConflictUidRef.current = user.id;
      if (sessionHeartbeatRef.current) clearInterval(sessionHeartbeatRef.current);
      sessionHeartbeatRef.current = null;
      await backgroundLocationService.stopBackgroundLocationTracking();
      alertService.showSessionActiveAlert('No puedes seguir usando la cuenta: está activa en otro dispositivo.');
      await logout();
    };

    // Marca app activa: sesión + presencia online + estado vivo del driver.
    const markActive = async (source: string) => {
      const availability = await driverAvailabilityService.getAvailabilityState();
      const keepAvailability = Boolean(availability?.isAvailable);
      await runWithSessionRecovery(() =>
        sessionService.startSession({ policy: 'deny', mode: 'driver', source }),
      );
      await writePresence(user.id, 'online');
      if (keepAvailability) {
        await writeDriverLiveLocation(user.id, { status: 'online' }).catch(() => {});
      }
    };

    // Marca app cerrada: presencia offline; el estado del driver solo se baja
    // si no tiene disponibilidad activa (background tracking sigue corriendo).
    const markClosed = async (source: string) => {
      const availability = await driverAvailabilityService.getAvailabilityState().catch(() => null);
      await writePresence(user.id, 'offline').catch(() => {});
      if (!availability?.isAvailable) {
        await writeDriverLiveLocation(user.id, { status: 'offline' }).catch(() => {});
      }
    };

    // Función para configurar presencia
    const setupPresence = async () => {
      try {
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser || firebaseUser.uid !== user.id) {
          console.log('⚠️ Usuario no autenticado en Firebase Auth, esperando...');
          return;
        }

        if (__DEV__) {
          const ownership = await sessionService.getSessionOwnershipDiagnostic().catch(() => null);
          if (ownership) console.log('[usePresence] Session ownership:', ownership);
        }
        await markActive('driverPresence:init');
        initializedPresenceUidRef.current = user.id;
        sessionConflictUidRef.current = null;

        if (sessionHeartbeatRef.current) clearInterval(sessionHeartbeatRef.current);
        sessionHeartbeatRef.current = setInterval(async () => {
          try {
            await sessionService.heartbeatSession({ source: 'driverPresence:heartbeat' });
            await writePresence(user.id, 'online');
          } catch (error: any) {
            if (sessionService.isSessionActiveElsewhereError(error)) {
              await handleSessionConflict();
              return;
            }
            console.warn('⚠️ [presence] No se pudo renovar la sesión:', error?.message || error);
          }
        }, 55_000);

        console.log('✅ Sistema de presencia configurado (Firestore)');
      } catch (error: any) {
        if (sessionService.isSessionActiveElsewhereError(error)) {
          await handleSessionConflict();
          return;
        }
        console.error('❌ Error configurando presencia:', error?.message || error);
      }
    };

    setupPresence();

    // Listener para cambios en el estado de la app
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (!user?.id) return;

      try {
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser || firebaseUser.uid !== user.id) return;

        // Si la app pasa a background o inactive, marcar como offline (best-effort)
        if (
          appState.current.match(/active/) &&
          nextAppState.match(/inactive|background/)
        ) {
          const availability = await driverAvailabilityService.getAvailabilityState();
          if (availability?.isAvailable) {
            // Disponibilidad activada manualmente: mantener el status en
            // background (iOS y Android). El heartbeat sigue reafirmando
            // 'available' y el scheduler cubre kill/crash real.
            console.log('📱 App en background con disponibilidad activa - manteniendo status');
          } else {
            console.log('📱 App en background, marcando como offline...');
            markClosed('driverPresence:background');
          }
        }

        // Si la app vuelve a foreground, re-marcar presencia
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          console.log('📱 App en foreground');
          await markActive('driverPresence:foreground');
        }

        appState.current = nextAppState;
      } catch (error: any) {
        if (sessionService.isSessionActiveElsewhereError(error)) {
          await handleSessionConflict();
          return;
        }
        console.error('❌ Error en handleAppStateChange:', error);
      }
    };

    // Suscribirse a cambios de estado de la app
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup: best-effort markClosed; el scheduler cubre el caso de kill
    return () => {
      subscription.remove();
      if (sessionHeartbeatRef.current) clearInterval(sessionHeartbeatRef.current);
      sessionHeartbeatRef.current = null;

      if (isDriverCapable) {
        getFirebaseAuth()
          .then((auth) => {
            if (!auth.currentUser || auth.currentUser.uid !== user.id) return;
            markClosed('driverPresence:cleanup');
          })
          .catch(() => {});
      }
    };
  }, [logout, user?.id, user?.role, userMode]);

  return null;
}

/**
 * Estado de conexión — Firestore no expone .info/connected; se reporta
 * siempre conectado (los listeners ya gestionan reintentos internamente).
 */
export function useConnectionStatus() {
  const [isConnected] = useState(true);
  return { isConnected };
}
