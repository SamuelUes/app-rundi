import { useEffect, useRef, useState } from 'react';
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
import callkit from '../../../native/callkit';
import { compareSupportCalls, SUPPORT_RINGING_STATUSES, TERMINAL_CALL_STATUSES } from './supportCallState';

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
  callId: string;
}

const RINGING_STATUSES = SUPPORT_RINGING_STATUSES;
const TERMINAL_STATUSES = TERMINAL_CALL_STATUSES;
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

export function useCalls(complaintId: string | null = null, options?: { handleNativeActions?: boolean }) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [livekitInfo, setLivekitInfo] = useState<LivekitJoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);
  const reportedCallsRef = useRef<Set<string>>(new Set());
  const callStatusRef = useRef<Map<string, string>>(new Map());
  const handleNativeActions = options?.handleNativeActions !== false;

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
    if (!resolvedUid || !complaintId) {
      setActiveCall(null);
      setLivekitInfo(null);
      callStatusRef.current.clear();
      return;
    }

    let mounted = true;
    const callsById = new Map<string, CallSession>();
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    const emit = () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      const mine = Array.from(callsById.values())
        .filter((call) => (call.complaintId || null) === complaintId)
        .map((call) => ({
          ...call,
          status: isExpiredRinging(call) ? 'missed' : call.status,
        }));

      mine.sort(compareSupportCalls);
      const top = mine[0] || null;
      setActiveCall(top);

      // CallKit: reportar ringing entrante y cerrar reportadas ya terminales
      callStatusRef.current.clear();
      for (const call of mine) {
        const st = String(call.status || '').toLowerCase();
        callStatusRef.current.set(call.callId, st);
        if (TERMINAL_STATUSES.has(st) && reportedCallsRef.current.has(call.callId)) {
          reportedCallsRef.current.delete(call.callId);
          void callkit.reportCallEnded(
            call.callId,
            st === 'missed' ? 'unanswered' : 'remote',
          );
        }
      }
      if (top) {
        const st = String(top.status || '').toLowerCase();
        if (
          RINGING_STATUSES.has(st) &&
          top.calleeUid === resolvedUid &&
          !reportedCallsRef.current.has(top.callId)
        ) {
          reportedCallsRef.current.add(top.callId);
          void callkit.reportIncomingCall(
            top.callId,
            (top as any).callerName || 'Rundi',
          );
        }
      }

      if (!top || TERMINAL_STATUSES.has(String(top.status || '').toLowerCase())) {
        setLivekitInfo(null);
      }

      const deadlines = Array.from(callsById.values())
        .filter((call) => call.complaintId === complaintId && RINGING_STATUSES.has(String(call.status || '').toLowerCase()))
        .map((call) => typeof call.acceptDeadline === 'number'
          ? call.acceptDeadline
          : (createdAtMillis(call.createdAt) ?? 0) + CALL_ACCEPT_WINDOW_MS)
        .filter((deadline) => deadline > Date.now());
      if (deadlines.length) {
        expiryTimer = setTimeout(emit, Math.max(1, Math.min(...deadlines) - Date.now()));
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
      if (!mounted) return;
      const callsCol = collection(db, FS_COL.calls);
      for (const field of ['callerUid', 'calleeUid'] as const) {
        const q = query(callsCol, where(field, '==', resolvedUid));
        unsubscribes.push(onSnapshot(q, handleSnap, handleError));
      }
    });

    return () => {
      mounted = false;
      if (expiryTimer) clearTimeout(expiryTimer);
      callStatusRef.current.clear();
      unsubscribes.forEach((off) => off());
    };
  }, [resolvedUid, complaintId]);

  const fetchLivekitToken = async (callId: string): Promise<LivekitJoinInfo | null> => {
    try {
      const tokenData = await getCallToken(callId);
      const info: LivekitJoinInfo = { token: tokenData.token, url: tokenData.url, room: tokenData.room, callId };
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
      callStatusRef.current.set(callId, status);
      if (status === 'accepted') {
        void callkit.answerCall(callId);
      } else {
        void callkit.endCall(callId);
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

  // Acciones desde la UI nativa de CallKit (contestar / colgar)
  const respondRef = useRef(respond);
  respondRef.current = respond;
  useEffect(() => {
    if (!resolvedUid || !handleNativeActions) return;
    const answerSub = callkit.addAnswerListener(({ callId }) => {
      const st = callStatusRef.current.get(callId);
      if (!st || !RINGING_STATUSES.has(st)) return;
      callStatusRef.current.set(callId, 'accepted');
      void respondRef.current(callId, 'accepted');
    });
    const endSub = callkit.addEndListener(({ callId }) => {
      const st = callStatusRef.current.get(callId);
      if (!st || TERMINAL_STATUSES.has(st)) return;
      callStatusRef.current.set(callId, 'ended');
      void respondRef.current(callId, RINGING_STATUSES.has(st) ? 'rejected' : 'ended');
    });
    return () => {
      answerSub?.remove();
      endSub?.remove();
    };
  }, [resolvedUid, handleNativeActions]);

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
