import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseDatabase } from '../../../config/firebase';
import { onAuthStateChanged, Unsubscribe } from 'firebase/auth';
import { equalTo, onValue, orderByChild, push, query, ref, update } from 'firebase/database';
import { authenticatedPost } from './useCalls';

interface RideCallSession {
  callId: string;
  callType?: string;
  rideId?: string | null;
  clientUid?: string | null;
  driverUid?: string | null;
  status?: string;
  direction?: string;
  recordingUrl?: string | null;
  acceptDeadline?: number | null;
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

// Llamada ringing cuyo acceptDeadline venció: el backend la barre a `missed`
// (expireStaleCallsScheduled), pero entre barridos la tratamos localmente como
// missed para que no bloquee la UI ni nuevas llamadas.
function isExpiredRinging(call: RideCallSession): boolean {
  const status = String(call?.status || '').toLowerCase();
  if (!RINGING_STATUSES.has(status)) return false;
  const deadline =
    typeof call?.acceptDeadline === 'number'
      ? call.acceptDeadline
      : typeof (call as any)?.createdAt === 'number'
        ? (call as any).createdAt + CALL_ACCEPT_WINDOW_MS
        : null;
  return deadline !== null && deadline <= Date.now();
}

/**
 * Hook de señalización para llamadas de viaje cliente <-> conductor.
 *
 * Escucha calls/{callId} con callType === 'ride' donde el uid actual es
 * clientUid o driverUid, filtradas al par (rideId, otherUserId). La media va
 * por LiveKit: al aceptar/iniciar se pide token a /api/calls/livekit-token y
 * se une a la sala ride-call-{callId} con useLivekitConnection.
 */
export function useRideCalls(rideId: string | null, otherUserId: string | null) {
  const [activeCall, setActiveCall] = useState<RideCallSession | null>(null);
  const [livekitInfo, setLivekitInfo] = useState<LivekitJoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedUid, setResolvedUid] = useState<string | null>(null);

  // Sincroniza con el UID real de Firebase Auth para evitar mismatch con IDs externos.
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
            call.callType === 'ride' &&
            call.rideId === rideId &&
            (call.clientUid === resolvedUid || call.driverUid === resolvedUid) &&
            (!otherUserId || call.clientUid === otherUserId || call.driverUid === otherUserId),
        )
        .map((call) => ({
          ...call,
          status: isExpiredRinging(call) ? 'missed' : call.status,
        }));

      mine.sort((a, b) => {
        const order = [
          'ringing_client',
          'ringing_driver',
          'accepted',
          'connected',
          'missed',
          'rejected',
          'ended',
        ];
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
      if (!snap.exists()) {
        prioritize();
        return;
      }
      const val = snap.val() || {};
      Object.entries<any>(val).forEach(([callId, data]) => {
        callsById.set(callId, { callId, ...(data || {}) });
      });
      prioritize();
    };

    const handleError = (err: any) => {
      if (!mounted) return;
      console.error('Error escuchando llamadas de viaje:', err);
      setError('No se pudo leer llamadas. ¿Sesión iniciada y permisos RTDB?');
    };

    const unsubscribes: Array<() => void> = [];
    getFirebaseDatabase().then((db) => {
      // El uid puede aparecer como clientUid (llamadas recibidas/iniciadas por
      // el cliente) o como driverUid (cuando el usuario es el conductor).
      for (const field of ['clientUid', 'driverUid'] as const) {
        const q = query(ref(db, 'calls'), orderByChild(field), equalTo(resolvedUid));
        unsubscribes.push(onValue(q, handleSnap, handleError));
      }
    });

    return () => {
      mounted = false;
      unsubscribes.forEach((off) => off());
    };
  }, [resolvedUid, rideId, otherUserId]);

  // Token de sala LiveKit para el participante actual. El endpoint resuelve
  // el participantType (client|driver) desde el registro de la llamada.
  const fetchLivekitToken = async (callId: string): Promise<LivekitJoinInfo | null> => {
    try {
      console.log('[useRideCalls] Fetching LiveKit token');
      const tokenData = (await authenticatedPost('/api/calls/livekit-token', {
        callId,
      })) as LivekitJoinInfo;
      setLivekitInfo(tokenData);
      return tokenData;
    } catch (tokenError: any) {
      const tokenStatus = Number(tokenError?.status || 0);
      if (tokenStatus === 404 || tokenStatus === 405) {
        console.warn('[useRideCalls] Endpoint de token LiveKit no disponible. La llamada quedó aceptada sin sala.');
      } else {
        console.error('[useRideCalls] livekit-token error', tokenError);
      }
      setLivekitInfo(null);
      return null;
    }
  };

  const respond = async (callId: string, status: 'accepted' | 'rejected' | 'ended') => {
    if (!callId) return;
    setLoading(true);
    setError(null);
    try {
      console.log('[useRideCalls] Responding call', { callId, status });
      const db = await getFirebaseDatabase();
      const now = Date.now();
      const updates: Record<string, any> = { status, updatedAt: now };
      if (status !== 'accepted') {
        updates.endedAt = now;
      }
      await update(ref(db, `calls/${callId}`), updates);
      await push(ref(db, `calls/${callId}/events`), {
        type: status,
        at: now,
        by: resolvedUid || null,
      });
      setActiveCall((prev) => (prev ? { ...prev, status } : prev));
      if (status === 'accepted') {
        await fetchLivekitToken(callId);
      } else {
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

  // Inicia (o reutiliza) la llamada del par del viaje vía backend. El servidor
  // valida participación, ventana del viaje y dedup de llamadas activas.
  const startRideCall = async () => {
    if (!rideId || !otherUserId) {
      throw new Error('rideId y otherUserId son requeridos para llamar');
    }
    setLoading(true);
    setError(null);
    try {
      const payload = { rideId, otherUserId, source: 'ride_chat' };
      try {
        await authenticatedPost('/api/calls/ride/initiate', payload);
      } catch (endpointError: any) {
        const status = Number(endpointError?.status || 0);
        if (status !== 404 && status !== 405) throw endpointError;
        // Fallback al endpoint standalone si el router api no tiene la ruta.
        await authenticatedPost('/initiateRideCallHttp', payload);
      }
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
