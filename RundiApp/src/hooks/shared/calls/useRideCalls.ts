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

interface RideCallSession {
  callId: string;
  callType?: string;
  rideId?: string | null;
  clientUid?: string | null;
  driverUid?: string | null;
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

const RINGING_STATUSES = new Set(['initiated', 'ringing_client', 'ringing_driver']);
const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'missed']);
const CALL_ACCEPT_WINDOW_MS = 60_000;

function createdAtMillis(value: RideCallSession['createdAt']): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

function isExpiredRinging(call: RideCallSession): boolean {
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

/**
 * Señalización de llamadas de viaje cliente <-> conductor (v2).
 * REALTIME_calls: el doc lo crea el backend (POST /calls/initiate); la media
 * va por LiveKit (POST /calls/{id}/token). Estados terminales vía endCall v2
 * (doc + pending event 'call_ended' en batch atómico).
 */
export function useRideCalls(rideId: string | null, otherUserId: string | null) {
  const [activeCall, setActiveCall] = useState<RideCallSession | null>(null);
  const [livekitInfo, setLivekitInfo] = useState<LivekitJoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);
  const reportedCallsRef = useRef<Set<string>>(new Set());
  const callStatusRef = useRef<Map<string, string>>(new Map());

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
    if (!resolvedUid || !rideId) {
      setActiveCall(null);
      setLivekitInfo(null);
      return;
    }

    let mounted = true;
    const callsById = new Map<string, RideCallSession>();

    const prioritize = () => {
      const mine = Array.from(callsById.values())
        .filter(
          (call) =>
            (call.callType === 'ride' || !call.callType) &&
            call.rideId === rideId &&
            (call.callerUid === resolvedUid || call.calleeUid === resolvedUid ||
             call.clientUid === resolvedUid || call.driverUid === resolvedUid) &&
            (!otherUserId ||
              call.clientUid === otherUserId ||
              call.driverUid === otherUserId ||
              call.callerUid === otherUserId ||
              call.calleeUid === otherUserId),
        )
        .map((call) => ({
          ...call,
          status: isExpiredRinging(call) ? 'missed' : call.status,
        }));

      mine.sort((a, b) => {
        // Una llamada viva siempre gana a una terminal: las viejas
        // finalizadas no deben tapar a la nueva. 'initiated' es el estado
        // ringing real que escribe el backend.
        const aTerminal = TERMINAL_STATUSES.has(String(a.status || '').toLowerCase());
        const bTerminal = TERMINAL_STATUSES.has(String(b.status || '').toLowerCase());
        if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;
        if (!aTerminal) {
          const order = ['initiated', 'ringing_client', 'ringing_driver', 'accepted', 'connected'];
          const diff = order.indexOf(a.status || '') - order.indexOf(b.status || '');
          if (diff !== 0) return diff;
        }
        // Entre terminales (o mismo bucket): gana la más reciente.
        return (createdAtMillis(b.createdAt) ?? 0) - (createdAtMillis(a.createdAt) ?? 0);
      });
      const top = mine[0] || null;
      setActiveCall(top);

      // CallKit: reportar ringing entrante y cerrar reportadas ya terminales
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
    };

    const handleSnap = (snap: any) => {
      if (!mounted) return;
      snap.docChanges().forEach((change: any) => {
        if (change.type === 'removed') callsById.delete(change.doc.id);
        else callsById.set(change.doc.id, { callId: change.doc.id, ...change.doc.data() });
      });
      prioritize();
    };

    const handleError = (err: any) => {
      if (!mounted) return;
      console.error('Error escuchando llamadas de viaje:', err);
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
  }, [resolvedUid, rideId, otherUserId]);

  const fetchLivekitToken = async (callId: string): Promise<LivekitJoinInfo | null> => {
    try {
      const tokenData = await getCallToken(callId);
      const info: LivekitJoinInfo = { token: tokenData.token, url: tokenData.url, room: tokenData.room };
      setLivekitInfo(info);
      return info;
    } catch (tokenError: any) {
      console.error('[useRideCalls] livekit-token error', tokenError);
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
        await updateDoc(doc(db, FS_COL.calls, callId), {
          status,
          updatedAt: serverTimestamp(),
        });
        await pushCallEvent(callId, resolvedUid || '', 'accepted');
      } else {
        await endCallV2(callId, resolvedUid || '', status === 'rejected' ? 'rejected' : 'ended');
      }
      setActiveCall((prev) => (prev ? { ...prev, status } : prev));
      callStatusRef.current.set(callId, status);
      if (status === 'accepted') {
        void callkit.answerCall(callId);
        await fetchLivekitToken(callId);
      } else {
        void callkit.endCall(callId);
        setLivekitInfo(null);
      }
    } catch (err: any) {
      console.error('[useRideCalls] respond error', err);
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
    if (!resolvedUid) return;
    const answerSub = callkit.addAnswerListener(({ callId }) => {
      const st = callStatusRef.current.get(callId) || '';
      if (st === 'accepted' || st === 'connected') return;
      void respondRef.current(callId, 'accepted');
    });
    const endSub = callkit.addEndListener(({ callId }) => {
      const st = callStatusRef.current.get(callId) || '';
      if (TERMINAL_STATUSES.has(st)) return;
      void respondRef.current(callId, RINGING_STATUSES.has(st) ? 'rejected' : 'ended');
    });
    return () => {
      answerSub?.remove();
      endSub?.remove();
    };
  }, [resolvedUid]);

  const startRideCall = async () => {
    if (!rideId) {
      throw new Error('rideId es requerido para llamar');
    }
    setLoading(true);
    setError(null);
    try {
      await initiateCall({ type: 'ride', rideId });
    } catch (err: any) {
      console.error('[useRideCalls] startRideCall error', err);
      setError(err?.message || 'No se pudo iniciar la llamada');
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
    startRideCall,
    fetchLivekitToken,
  };
}
