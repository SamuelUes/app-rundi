import { useEffect, useRef, useState } from 'react';
import { getFirebaseDatabase, getFirebaseAuth } from '../config/firebase';
import { ref, onDisconnect, set, serverTimestamp, onValue, update } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Hook para manejar la presencia del usuario en Firebase Realtime Database
 * Automáticamente marca al usuario como offline cuando:
 * - Se cierra la app
 * - Se crashea la app
 * - Se hace logout
 * - Pierde conexión a internet
 */
export function usePresence() {
  const { user } = useAuth();
  const appState = useRef(AppState.currentState);
  const presenceRef = useRef<any>(null);

  useEffect(() => {
    // Solo configurar presencia para conductores autenticados
    if (!user?.id || user.role !== 'driver') {
      return;
    }

    // Función para configurar presencia
    const setupPresence = async () => {
      try {
        const auth = await getFirebaseAuth();
        const database = await getFirebaseDatabase();

        // Verificar que el usuario esté autenticado en Firebase Auth
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          console.log('⚠️ Usuario no autenticado en Firebase Auth, esperando...');
          return;
        }

        // Usar el UID de Firebase Auth (no el user.id del contexto)
        const driverLocationRef = ref(database, `driverLocations/${firebaseUser.uid}`);
        presenceRef.current = driverLocationRef;

        // IMPORTANTE: Primero marcar como offline al iniciar
        // El conductor debe activar manualmente su disponibilidad
        await update(driverLocationRef, {
          status: 'offline',
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });
        
        // Configurar onDisconnect para cuando se desconecte
        await onDisconnect(driverLocationRef).update({
          status: 'offline',
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });

        console.log('✅ Sistema de presencia configurado - Status inicial: offline');
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
        const database = await getFirebaseDatabase();
        const auth = await getFirebaseAuth();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) return;

        const driverLocationRef = ref(database, `driverLocations/${firebaseUser.uid}`);

        // Si la app pasa a background o inactive, marcar como offline
        if (
          appState.current.match(/active/) &&
          nextAppState.match(/inactive|background/)
        ) {
          console.log('📱 App en background, marcando como offline...');
          await update(driverLocationRef, {
            status: 'offline',
            updatedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
          });
        }

        // Si la app vuelve a foreground, NO cambiar el estado automáticamente
        // El conductor debe activar manualmente su disponibilidad
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          console.log('📱 App en foreground');
          // No hacer nada, el conductor debe activar manualmente
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
      
      // Marcar como offline al desmontar el componente
      const cleanupPresence = async () => {
        try {
          const auth = await getFirebaseAuth();
          const database = await getFirebaseDatabase();
          const firebaseUser = auth.currentUser;
          if (firebaseUser && user?.role === 'driver') {
            const cleanupRef = ref(database, `driverLocations/${firebaseUser.uid}`);
            await update(cleanupRef, {
              status: 'offline',
              updatedAt: serverTimestamp(),
              lastSeen: serverTimestamp(),
            });
          }
        } catch (error) {
          console.error('❌ Error en cleanup de presencia:', error);
        }
      };

      cleanupPresence();
    };
  }, [user?.id, user?.role]);

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
        
        const unsubscribe = onValue(connectedRef, (snapshot) => {
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
