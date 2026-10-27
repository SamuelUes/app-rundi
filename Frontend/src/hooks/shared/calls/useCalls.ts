import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseDatabase } from '../../../config/firebase';
import { onAuthStateChanged, Unsubscribe } from 'firebase/auth';
import { equalTo, onValue, orderByChild, push, query, ref, update } from 'firebase/database';
import { Platform } from 'react-native';
import { buildFunctionsEmulatorBaseUrl } from '../../../config/localEmulatorHost';

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

// Llamada ringing cuyo acceptDeadline venció: el backend la barre a `missed`
// (expireStaleCallsScheduled), pero entre barridos la tratamos localmente como
// missed para que no bloquee la UI ni nuevas llamadas.
function isExpiredRinging(call: CallSession): boolean {
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

const USE_FIREBASE_EMULATORS = process.env.USE_FIREBASE_EMULATORS === 'true';
const FUNCTIONS_EMULATOR_URL = buildFunctionsEmulatorBaseUrl(
  process.env.FIREBASE_PROJECT_ID || 'rundi-dev',
  'us-central1',
  process.env.FIREBASE_EMULATOR_HOST || 'localhost',
  Platform.OS,
);
const API_BASE_URL_FIREBASE = USE_FIREBASE_EMULATORS
  ? FUNCTIONS_EMULATOR_URL
  : process.env.API_BASE_URL_FIREBASE || '';
const API_BASE_URL = USE_FIREBASE_EMULATORS
  ? FUNCTIONS_EMULATOR_URL
  : process.env.PLATFORM_API_BASE_URL || API_BASE_URL_FIREBASE;
const CALLS_REQUEST_BASE_URL = USE_FIREBASE_EMULATORS
  ? FUNCTIONS_EMULATOR_URL
  : process.env.CALLS_REQUEST_BASE_URL || API_BASE_URL_FIREBASE || API_BASE_URL;
const CALLS_REQUEST_PATH = process.env.CALLS_REQUEST_PATH || '/initiateSupportCallHttp';
if (__DEV__) {
  if (!API_BASE_URL) {
    console.warn('[useCalls] API_BASE_URL no definido. Configura PLATFORM_API_BASE_URL o API_BASE_URL_FIREBASE');
  } else {
    console.log('[useCalls] API_BASE_URL', API_BASE_URL);
  }
}

export async function authenticatedPost(path: string, payload: any, baseUrlOverride?: string) {
  const baseUrl = (baseUrlOverride || API_BASE_URL || "").trim();
  if (!baseUrl) throw new Error('API base URL no configurada');
  const auth = await getFirebaseAuth();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Sesión no disponible');

  const url = `${baseUrl}${path}`;
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
    const requestError = new Error(body.error || `Error ${res.status}`) as Error & {
      status?: number;
      body?: any;
      url?: string;
    };
    requestError.status = res.status;
    requestError.body = body;
    requestError.url = url;
    throw requestError;
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
            .filter((call) => (call.complaintId || null) === complaintId)
            .map((call) => ({
              ...call,
              status: isExpiredRinging(call) ? 'missed' : call.status,
            }));

          const prioritized = mine.sort((a, b) => {
            const order = ['ringing_client', 'ringing_operator', 'accepted', 'connected', 'missed', 'rejected', 'ended'];
            const ia = order.indexOf(a.status || '');
            const ib = order.indexOf(b.status || '');
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          });
          const top = prioritized[0] || null;
          setActiveCall(top);
          // Si el operador cerró la llamada (o expiró), el token de sala ya no sirve.
          if (!top || TERMINAL_STATUSES.has(String(top.status || '').toLowerCase())) {
            setLivekitInfo(null);
          }
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

  // Token de sala para el participante cliente. Se usa al aceptar una llamada
  // entrante y también al unirse como iniciador una vez el operador acepta.
  const fetchLivekitToken = async (callId: string): Promise<LivekitJoinInfo | null> => {
    try {
      console.log('[useCalls] Fetching LiveKit token');
      const tokenData = (await authenticatedPost('/api/calls/livekit-token', {
        callId,
        participantType: 'client',
      })) as LivekitJoinInfo;
      setLivekitInfo(tokenData);
      return tokenData;
    } catch (tokenError: any) {
      const tokenStatus = Number(tokenError?.status || 0);
      if (tokenStatus === 404 || tokenStatus === 405) {
        console.warn('[useCalls] Endpoint de token LiveKit no disponible. La llamada quedó aceptada sin sala.');
      } else {
        console.error('[useCalls] livekit-token error', tokenError);
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
      console.log('[useCalls] Responding call', { callId, status });
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
      const candidatePaths = [
        CALLS_REQUEST_PATH,
        '/initiateSupportCallHttp',
        '/api/calls/request',
        '/api/calls/initiate',
      ];
      const candidateBaseUrls = [
        CALLS_REQUEST_BASE_URL,
        API_BASE_URL,
      ].filter(Boolean) as string[];

      const candidatePayload = {
        complaintId: payload.complaintId,
        rideId: payload.rideId ?? null,
        source: 'support_chat',
      };

      let lastError: any = null;

      for (const baseUrl of candidateBaseUrls) {
        for (const path of candidatePaths) {
          try {
            await authenticatedPost(path, candidatePayload, baseUrl);
            console.log('[useCalls] Call request accepted by endpoint', { baseUrl, path });
            lastError = null;
            break;
          } catch (endpointError: any) {
            lastError = endpointError;
            const status = Number(endpointError?.status || 0);
            if (status === 404 || status === 405) {
              continue;
            }
            throw endpointError;
          }
        }
        if (!lastError) {
          break;
        }
      }

      if (lastError) {
        throw lastError;
      }
    } catch (err: any) {
      const status = Number(err?.status || 0);
      const message = String(err?.message || '');
      const isNotFound =
        status === 404 ||
        /not[\s_-]?found/i.test(message);

      if (isNotFound) {
        console.warn('[useCalls] No se encontró endpoint HTTP de creación de llamada. Se conserva flujo por requestSupportCall callable.');
        return;
      }

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
