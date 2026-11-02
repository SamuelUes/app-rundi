import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFirestore } from '../../../config/firebase';
import { onAuthStateChanged, Unsubscribe } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe as FirestoreUnsubscribe,
} from 'firebase/firestore';
import { FS_COL } from '../../../constants/firestore';
import {
  endCall as endCallV2,
  getCallToken,
  initiateCall,
  pushCallEvent,
} from '../../../live/calls';

interface CallSession {
  callId: string;
  complaintId?: string | null;
  rideId?: string | null;
  operatorUid?: string | null;
  clientUid?: string | null;
  callerUid?: string | null;
  calleeUid?: string | null;
  status?: string;
  direction?: string;
  recordingUrl?: string | null;
  acceptDeadline?: number | null;
  createdAt?: number | { toMillis?: () => number } | null;
  events?: {
    initiated?: {
      at?: number;
      by?: string;
      type?: string;
      source?: string;
    };
    [key: string]: any;
  };
}

interface LivekitJoinInfo {
  token: string;
  url: string;
  room: string;
}

const RINGING_STATUSES = new Set(['initiated', 'ringing_client', 'ringing_operator']);
const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'missed']);
const CALL_ACCEPT_WINDOW_MS = 60_000;

function createdAtMillis(value: CallSession['createdAt']): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

// Llamada ringing cuyo acceptDeadline venció: el backend la barre a `missed`,
// pero entre barridos la tratamos localmente como missed.
function isExpiredRinging(call: CallSession): boolean {
  const status = String(call?.status || '').toLowerCase();
  if (!RINGING_STATUSES.has(status)) return false;
  const deadline =
    typeof call?.acceptDeadline === 'number'
      ? call.acceptDeadline
      : (() => {
          const created = createdAtMillis(call?.createdAt);
          return created !== null ? created + CALL_ACCEPT_WINDOW_MS : null;
        })();
  return deadline !== null && deadline <= Date.now();
}

export function useCalls(complaintId: string | null = null) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [livekitInfo, setLivekitInfo] = useState<LivekitJoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: Unsubscribe | null = null;
    getFirebaseAuth().then((auth) => {
      const immediate = auth.currentUser?.uid || null;
      setResolvedUid(immediate);
      unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        setResolvedUid(fbUser?.uid || null);
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!resolvedUid) return;
    if (!complaintId) {
      setActiveCall(null);
      setLivekitInfo(null);
      return;
    }

    let mounted = true;
    const callsById = new Map<string, CallSession>();

    const emit = () => {
      const mine = Array.from(callsById.values())
        .filter((call) => (call.complaintId || null) === complaintId)
        .map((call) => ({
          ...call,
          status: isExpiredRinging(call) ? 'missed' : call.status,
        }));

      mine.sort((a, b) => {
        const order = ['ringing_client', 'ringing_operator', 'accepted', 'connected', 'missed', 'rejected', 'ended'];
        const ia = order.indexOf(a.status || '');
        const ib = order.indexOf(b.status || '');
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      const top = mine[0] || null;
      setActiveCall(top);
      if (!top || TERMINAL_STATUSES.has(String(top.status || '').toLowerCase())) {
        setLivekitInfo(null);
      }
    };

    const handleSnap = (snap: any) => {
      if (!mounted) return;
      snap.docChanges().forEach((change: any) => {
        if (change.type === 'removed') callsById.delete(change.doc.id);
        else callsById.set(change.doc.id, { callId: change.doc.id, ...change.doc.data() });
      });
      emit();
    };

    const handleError = (err: any) => {
      if (!mounted) return;
      console.error('Error escuchando llamadas:', err);
      setError('No se pudo leer llamadas.');
    };

    const unsubscribes: FirestoreUnsubscribe[] = [];
    getFirebaseFirestore().then((db) => {
      const callsCol = collection(db, FS_COL.calls);
      for (const field of ['callerUid', 'calleeUid'] as const) {
        const q = query(callsCol, where(field, '==', resolvedUid));
        unsubscribes.push(onSnapshot(q, handleSnap, handleError));
      }
    });

    return () => {
      mounted = false;
      unsubscribes.forEach((off) => off());
    };
  }, [resolvedUid, complaintId]);

  const fetchLivekitToken = async (callId: string): Promise<LivekitJoinInfo | null> => {
    try {
      const tokenData = await getCallToken(callId);
      const info: LivekitJoinInfo = { token: tokenData.token, url: tokenData.url, room: tokenData.room };
      setLivekitInfo(info);
      return info;
    } catch (tokenError: any) {
      console.error('[useCalls] livekit-token error', tokenError);
      setLivekitInfo(null);
      return null;
    }
  };

  const respond = async (callId: string, status: 'accepted' | 'rejected' | 'ended') => {
    if (!callId) return;
    setLoading(true);
    setError(null);
    try {
      const db = await getFirebaseFirestore();
      if (status === 'accepted') {
        // El participante actualiza su estado (identidades inmutables por reglas).
        await updateDoc(doc(db, FS_COL.calls, callId), {
          status,
          updatedAt: serverTimestamp(),
        });
        await pushCallEvent(callId, resolvedUid || '', 'accepted');
      } else {
        // Estado terminal + pending event 'call_ended' (batch atómico v2).
        await endCallV2(callId, resolvedUid || '', status === 'rejected' ? 'rejected' : 'ended');
      }
      setActiveCall((prev) => (prev ? { ...prev, status } : prev));
      if (status === 'accepted') {
        await fetchLivekitToken(callId);
      } else {
        setLivekitInfo(null);
      }
    } catch (err: any) {
      console.error('[useCalls] respond error', err);
      setError(err?.message || 'No se pudo responder la llamada');
    } finally {
      setLoading(false);
    }
  };

  const acceptCall = (callId: string) => respond(callId, 'accepted');
  const rejectCall = (callId: string) => respond(callId, 'rejected');
  const endCall = (callId: string) => respond(callId, 'ended');
  const cancelCall = (callId: string) => respond(callId, 'ended');

  const requestCall = async (payload: { complaintId: string; rideId?: string | null }) => {
    if (!payload?.complaintId) {
      throw new Error('complaintId es requerido para solicitar llamada');
    }
    setLoading(true);
    setError(null);
    try {
      await initiateCall({
        type: 'support',
        complaintId: payload.complaintId,
        rideId: payload.rideId ?? undefined,
      });
    } catch (err: any) {
      console.error('[useCalls] requestCall error', err);
      setError(err?.message || 'No se pudo solicitar la llamada');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    activeCall,
    livekitInfo,
    error,
    loading,
    resolvedUid,
    acceptCall,
    rejectCall,
    endCall,
    cancelCall,
    requestCall,
    fetchLivekitToken,
  };
}
