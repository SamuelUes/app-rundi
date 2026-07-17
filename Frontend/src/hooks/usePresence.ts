import { useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirebaseAuth, getFirebaseDatabase } from '../config/firebase';
import { ref, onValue, DataSnapshot } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { AppState, AppStateStatus } from 'react-native';
import sessionService from '../services/sessionService';

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

  useEffect(() => {
    const isDriverCapable = user?.role === 'driver' || user?.role === 'designated_driver';
    // Solo configurar presencia para conductores autenticados en modo conductor
    if (!user?.id || !isDriverCapable || userMode !== 'driver') {
      return;
    }

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
        // Si la app pasa a background o inactive, marcar como offline
        if (
          appState.current.match(/active/) &&
          nextAppState.match(/inactive|background/)
        ) {
          console.log('📱 App en background, marcando como offline...');
          await actions.markClosed({ role: 'driver', deviceId });
        }

        // Si la app vuelve a foreground, NO cambiar el estado automáticamente
        // El conductor debe activar manualmente su disponibilidad
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          console.log('📱 App en foreground');
          await actions.markActive({ role: 'driver', deviceId });
        }

        appState.current = nextAppState;
      } catch (error) {
        console.error('❌ Error en handleAppStateChange:', error);
      }
    };

    // Suscribirse a cambios de estado de la app
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup
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
                  .catch((err: any) => {
                    console.error('❌ Error en cleanup de presencia (markAppClosed):', err?.message || err);
                  });
              })
              .catch((err) => {
                console.error('❌ Error en cleanup de presencia (markAppClosed):', err?.message || err);
              });
          })
          .catch((err) => {
            console.error('❌ Error en cleanup de presencia (markAppClosed):', err?.message || err);
          });
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
