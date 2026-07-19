import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirebaseAuth, getFirebaseDatabase } from '../../../config/firebase';
import { ref, onValue, DataSnapshot, onDisconnect, serverTimestamp, get } from 'firebase/database';
import { useAuth } from '../../../context/AuthContext';
import { AppState, AppStateStatus } from 'react-native';
import sessionService from '../../../services/sessionService';

const DEFAULT_SERVICE_AREA_ID = 'ni-managua';

/**
 * Hook para manejar la presencia del usuario en Firebase Realtime Database
 * Automáticamente marca al usuario como offline cuando:
 * - Se cierra la app
 * - Se crashea la app
 * - Se hace logout
 * - Pierde conexión a internet
 */
export function usePresence() {
  const { user, userMode } = useAuth();
  const appState = useRef(AppState.currentState);
  const actionsRef = useRef<null | {
    markActive: ReturnType<typeof httpsCallable>;
    markClosed: ReturnType<typeof httpsCallable>;
  }>(null);
  const disconnectSetupRef = useRef(false);
  const disconnectUidRef = useRef<string | null>(null);

  useEffect(() => {
    const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
    // Solo configurar presencia para conductores autenticados en modo conductor
    if (!user?.id || !isDriverCapable || userMode !== 'driver') {
      return;
    }

    // Configurar handlers onDisconnect para limpieza automática cuando la conexión se pierde
    const setupOnDisconnect = async (uid: string) => {
      try {
        const database = await getFirebaseDatabase();

        // Leer serviceAreaId de la sesión para limpiar el shard correcto
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
          onDisconnect(ref(database, `driverLocations/${uid}`)).update({
            status: 'offline',
            lat: null,
            lng: null,
            updatedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          }),
          onDisconnect(ref(database, `driversInfo/${uid}`)).update({
            updatedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          }),
          onDisconnect(ref(database, `presence/${uid}`)).remove(),
          onDisconnect(ref(database, `driverLocationsByArea/${serviceAreaId}/${uid}`)).remove(),
          onDisconnect(ref(database, `driverLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${uid}`)).remove(),
        ]);

        disconnectSetupRef.current = true;
        disconnectUidRef.current = uid;
        console.log('✅ [presence] onDisconnect configurado para', uid);
      } catch (error: any) {
        console.warn('⚠️ [presence] Error configurando onDisconnect:', error?.message || error);
      }
    };

    // Cancelar handlers onDisconnect (antes de re-configurar al volver a foreground)
    const cancelOnDisconnect = async () => {
      if (!disconnectSetupRef.current) return;
      const uid = disconnectUidRef.current;
      if (!uid) return;
      try {
        const database = await getFirebaseDatabase();
        await Promise.all([
          onDisconnect(ref(database, `driverLocations/${uid}`)).cancel(),
          onDisconnect(ref(database, `driversInfo/${uid}`)).cancel(),
          onDisconnect(ref(database, `presence/${uid}`)).cancel(),
          onDisconnect(ref(database, `driverLocationsByArea/${DEFAULT_SERVICE_AREA_ID}/${uid}`)).cancel(),
        ]);
        disconnectSetupRef.current = false;
        disconnectUidRef.current = null;
      } catch {
 // best-effort
      }
    };

    // Función para configurar presencia
    const setupPresence = async () => {
      try {
        const auth = await getFirebaseAuth();
        const functions = await getFirebaseFunctions();

        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          console.log('⚠️ Usuario no autenticado en Firebase Auth, esperando...');
          return;
        }

        const markActive = httpsCallable(functions, 'markAppActive');
        const markClosed = httpsCallable(functions, 'markAppClosed');
        actionsRef.current = { markActive, markClosed };

        const deviceId = await sessionService.getDeviceId();
        await markActive({ role: 'driver', deviceId });

        // Configurar onDisconnect después de markAppActive exitoso
        await setupOnDisconnect(user.id);

        console.log('✅ Sistema de presencia configurado vía backend - Status inicial: offline');
      } catch (error: any) {
        // Solo log el error, no bloquear la app
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
        if (!firebaseUser) return;

        const actions = actionsRef.current;
        if (!actions) return;
        const deviceId = await sessionService.getDeviceId();
        // Si la app pasa a background o inactive, marcar como offline (best-effort)
        // onDisconnect actúa como respaldo si esta llamada falla
        if (
          appState.current.match(/active/) &&
          nextAppState.match(/inactive|background/)
        ) {
          console.log('📱 App en background, marcando como offline...');
          actions.markClosed({ role: 'driver', deviceId }).catch((err: any) => {
            console.warn('⚠️ [presence] markAppClosed falló en background (onDisconnect respalda):', err?.message || err);
          });
        }

        // Si la app vuelve a foreground, re-configurar presencia y onDisconnect
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          console.log('📱 App en foreground');
          await cancelOnDisconnect();
          await actions.markActive({ role: 'driver', deviceId });
          await setupOnDisconnect(user.id);
        }

        appState.current = nextAppState;
      } catch (error) {
        console.error('❌ Error en handleAppStateChange:', error);
      }
    };

    // Suscribirse a cambios de estado de la app
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup: best-effort markAppClosed, onDisconnect es el respaldo confiable
    return () => {
      subscription.remove();

      const actions = actionsRef.current;
      if (actions && isDriverCapable) {
        getFirebaseAuth()
          .then((auth) => {
            if (!auth.currentUser) return;
            sessionService
              .getDeviceId()
              .then((deviceId) => {
                actions
                  .markClosed({ role: 'driver', deviceId })
                  .catch(() => {
                    // Silenciar: onDisconnect limpiará automáticamente
                  });
              })
              .catch(() => {});
          })
          .catch(() => {});
      }
    };
  }, [user?.id, user?.role, userMode]);

  return null;
}

/**
 * Hook para monitorear el estado de conexión a Firebase
 */
export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const setupConnectionListener = async () => {
      try {
        const database = await getFirebaseDatabase();
        const connectedRef = ref(database, '.info/connected');
        
        const unsubscribe = onValue(connectedRef, (snapshot: DataSnapshot) => {
          const connected = snapshot.val() === true;
          setIsConnected(connected);
          
          if (connected) {
            console.log('✅ Conectado a Firebase');
          } else {
            console.log('❌ Desconectado de Firebase');
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('❌ Error configurando listener de conexión:', error);
        return () => {};
      }
    };

    const cleanupPromise = setupConnectionListener();

    return () => {
      cleanupPromise.then(unsubscribe => unsubscribe());
    };
  }, []);

  return { isConnected };
}
