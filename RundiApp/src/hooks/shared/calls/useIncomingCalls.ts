import { useEffect, useRef } from 'react';
import { onAuthStateChanged, type Unsubscribe as AuthUnsubscribe } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe as FirestoreUnsubscribe,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { navigate, navigationRef } from '../../../navigation/NavigationService';
import callkit from '../../../native/callkit';

const RINGING_STATUSES = new Set([
  'initiated',
  'ringing_client',
  'ringing_operator',
  'ringing_driver',
]);
const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'missed']);
const CALL_ACCEPT_WINDOW_MS = 60_000;

/**
 * Listener global de llamadas entrantes (callee side).
 *
 * useCalls/useRideCalls solo escuchan mientras la pantalla de llamada está
 * montada — sin esto una llamada entrante con la app en otra pantalla era
 * invisible (salvo push VoIP, que en simulador no existe). Aquí se reporta a
 * CallKit y se navega a la pantalla de llamada que corresponda.
 */
export function useIncomingCalls() {
  const reportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let authUnsub: AuthUnsubscribe | null = null;
    let fsUnsub: FirestoreUnsubscribe | null = null;

    const handleCallDoc = (callId: string, d: Record<string, any>) => {
      const status = String(d.status || '').toLowerCase();

      if (TERMINAL_STATUSES.has(status)) {
        if (reportedRef.current.delete(callId)) {
          void callkit.reportCallEnded(
            callId,
            status === 'missed' ? 'unanswered' : 'remote',
          );
        }
        return;
      }
      if (!RINGING_STATUSES.has(status) || reportedRef.current.has(callId)) return;

      const deadline =
        typeof d.acceptDeadline === 'number'
          ? d.acceptDeadline
          : typeof d.createdAt?.toMillis === 'function'
            ? d.createdAt.toMillis() + CALL_ACCEPT_WINDOW_MS
            : null;
      if (deadline !== null && deadline <= Date.now()) return;

      reportedRef.current.add(callId);
      const callerName =
        typeof d.callerName === 'string' && d.callerName.trim()
          ? d.callerName.trim()
          : 'Rundi';
      void callkit.reportIncomingCall(callId, callerName);

      if (!navigationRef.isReady()) return;
      const currentRoute = navigationRef.getCurrentRoute()?.name;
      if (d.callType === 'support' && typeof d.complaintId === 'string') {
        if (currentRoute !== 'SupportCall') {
          navigate('SupportCall', { complaintId: d.complaintId } as any);
        }
      } else if (d.callType === 'ride' && typeof d.rideId === 'string') {
        if (currentRoute !== 'RideCall') {
          navigate('RideCall', {
            rideId: d.rideId,
            otherUserId: d.callerUid ?? null,
            otherUserName: callerName,
          } as any);
        }
      }
    };

    const subscribe = async (uid: string | null) => {
      fsUnsub?.();
      fsUnsub = null;
      if (!uid) return;
      const db = await getFirebaseFirestore();
      if (cancelled) return;
      const q = query(
        collection(db, FS_COL.calls),
        where('calleeUid', '==', uid),
      );
      fsUnsub = onSnapshot(
        q,
        (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === 'removed') return;
            handleCallDoc(change.doc.id, change.doc.data() as Record<string, any>);
          });
        },
        (err) => console.warn('⚠️ [useIncomingCalls] listener error:', err),
      );
    };

    void getFirebaseAuth().then((auth) => {
      if (cancelled) return;
      void subscribe(auth.currentUser?.uid ?? null);
      authUnsub = onAuthStateChanged(auth, (fbUser) => {
        reportedRef.current.clear();
        void subscribe(fbUser?.uid ?? null);
      });
    });

    return () => {
      cancelled = true;
      authUnsub?.();
      fsUnsub?.();
    };
  }, []);
}
