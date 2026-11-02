import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';

export function useProgrammedRideLive(rideId: string | null, userId: string | undefined, enabled: boolean) {
  const scope = JSON.stringify([userId, rideId, enabled]);
  const scopeRef = useRef({ scope, generation: 0 });
  if (scopeRef.current.scope !== scope) {
    scopeRef.current = { scope, generation: scopeRef.current.generation + 1 };
  }
  const key = `${scope}:${scopeRef.current.generation}`;
  const [state, setState] = useState<{ key: string; data: any | null }>({ key, data: null });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    if (!enabled || !rideId || !userId) return () => { active = false; };

    (async () => {
      try {
        const db = await getFirebaseFirestore();
        if (!active) return;
        unsubscribe = onSnapshot(doc(db, FS_COL.programmed, rideId), (snap) => {
          if (!active) return;
          const data = snap.exists() ? snap.data() : null;
          setState({ key, data: data?.clientId === userId ? { id: snap.id, ...data } : null });
        }, (error) => {
          if (!active) return;
          active = false;
          setState({ key, data: null });
          console.warn('[HomeScreenOffers] Error escuchando programmedRide:', error);
        });
      } catch (error) {
        if (active) console.warn('[HomeScreenOffers] Error inicializando programmedRide:', error);
      }
    })();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [key, enabled, rideId, userId]);

  return state.key === key ? state.data : null;
}
