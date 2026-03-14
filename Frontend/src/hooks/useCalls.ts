import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseDatabase } from '../config/firebase';
import { onAuthStateChanged, Unsubscribe } from 'firebase/auth';
import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database';

interface CallSession {
  callId: string;
  complaintId?: string | null;
  rideId?: string | null;
  operatorUid?: string | null;
  clientUid?: string | null;
  status?: string;
  direction?: string;
  recordingUrl?: string | null;
  acceptDeadline?: number | null;
}

interface LivekitJoinInfo {
  token: string;
  url: string;
  room: string;
}

const API_BASE_URL = process.env.PLATFORM_API_BASE_URL || process.env.API_BASE_URL_FIREBASE;
if (!API_BASE_URL) {
  console.warn('[useCalls] API_BASE_URL no definido. Configura PLATFORM_API_BASE_URL o API_BASE_URL_FIREBASE');
} else {
  console.log('[useCalls] API_BASE_URL', API_BASE_URL);
}

async function authenticatedPost(path: string, payload: any) {
  if (!API_BASE_URL) throw new Error('PLATFORM_API_BASE_URL no configurada');
  const auth = await getFirebaseAuth();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Sesión no disponible');

  const url = `${API_BASE_URL}${path}`;
  console.log('[useCalls] POST', url, payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('[useCalls] API error', {
      url,
      status: res.status,
      statusText: res.statusText,
      body,
    });
    throw new Error(body.error || `Error ${res.status}`);
  }

  return res.json();
}

export function useCalls(complaintId: string | null = null) {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
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
    if (!resolvedUid) return;
    if (!complaintId) {
      setActiveCall(null);
      setLivekitInfo(null);
      return;
    }

    let mounted = true;
    let unsubscribeCalls: (() => void) | null = null;
    getFirebaseDatabase().then((db) => {
      const callsRef = query(ref(db, 'calls'), orderByChild('clientUid'), equalTo(resolvedUid));
      unsubscribeCalls = onValue(
        callsRef,
        (snap) => {
          if (!mounted) return;
          if (!snap.exists()) {
            setActiveCall(null);
            return;
          }
          const val = snap.val() || {};
          const entries = Object.entries<any>(val);
          const mine = entries
            .map(([callId, data]) => ({ callId, ...(data || {}) }))
            .filter((call) => (call.complaintId || null) === complaintId);

          const prioritized = mine.sort((a, b) => {
            const order = ['ringing_client', 'accepted', 'connected', 'missed', 'rejected', 'ended'];
            const ia = order.indexOf(a.status || '');
            const ib = order.indexOf(b.status || '');
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          });
          setActiveCall(prioritized[0] || null);
        },
        (err) => {
          if (!mounted) return;
          console.error('Error escuchando llamadas:', err);
          setError('No se pudo leer llamadas. ¿Sesión iniciada y permisos RTDB?');
        },
      );
    });

    return () => {
      mounted = false;
      if (unsubscribeCalls) unsubscribeCalls();
    };
  }, [resolvedUid, complaintId]);

  const respond = async (callId: string, status: 'accepted' | 'rejected' | 'ended') => {
    if (!callId) return;
    setLoading(true);
    setError(null);
    try {
      console.log('[useCalls] Responding call', { callId, status });
      await authenticatedPost('/api/calls/respond', { callId, status });
      setActiveCall((prev) => (prev ? { ...prev, status } : prev));
      if (status === 'accepted') {
        console.log('[useCalls] Fetching LiveKit token');
        const tokenData = (await authenticatedPost('/api/calls/livekit-token', {
          callId,
          participantType: 'client',
        })) as LivekitJoinInfo;
        setLivekitInfo(tokenData);
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

  const requestCall = async (payload: { complaintId: string; rideId?: string | null }) => {
    if (!payload?.complaintId) {
      throw new Error('complaintId es requerido para solicitar llamada');
    }
    setLoading(true);
    setError(null);
    try {
      await authenticatedPost('/api/calls/request', {
        complaintId: payload.complaintId,
        rideId: payload.rideId ?? null,
        source: 'support_chat',
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
    acceptCall,
    rejectCall,
    endCall,
    requestCall,
  };
}
