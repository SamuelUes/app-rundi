/**
 * Calls — llamadas de voz con señalización REALTIME_calls/{callId}.
 * El doc lo crea el backend (POST /calls/initiate) con roles resueltos desde
 * SQL (reglas: create=false para clientes). La media va por LiveKit:
 * token via POST /calls/{callId}/token. Estado terminal + pending event
 * 'call_ended' en batch atómico → el consumer archiva la sesión a SQL
 * (también lo hace el webhook LiveKit con room_finished).
 */
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';

import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';
import client from '../api/client';
import { pokeConsumer } from '../api/events';

export type CallType = 'ride' | 'support';

/** initiateCall — backend crea el doc con roles SQL + dispara push al callee. */
export async function initiateCall(opts: {
  type: CallType;
  rideId?: string;
  complaintId?: string;
}): Promise<{ callId: string }> {
  const { data } = await client.post<{ callId: string }>('/calls/initiate', opts);
  return data;
}

export interface CallToken {
  token: string;
  url: string;
  room: string;
  expiresIn: number;
  callId: string;
  participantType: string;
}

/** getCallToken — JWT LiveKit (15min, grant mic-only) para unirse al room. */
export async function getCallToken(callId: string): Promise<CallToken> {
  const { data } = await client.post<CallToken>(`/calls/${callId}/token`);
  return data;
}

/**
 * endCall — estado terminal + pending event 'call_ended' en batch atómico.
 * El consumer archiva la sesión (fallback del webhook room_finished).
 */
export async function endCall(
  callId: string,
  uid: string,
  status: 'ended' | 'rejected' | 'missed',
): Promise<void> {
  const db = await getFirebaseFirestore();
  const batch = writeBatch(db);
  batch.set(
    doc(db, FS_COL.calls, callId),
    { status, endedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(doc(db, FS_COL.pendingEvents, `call-end-${callId}-${status}`), {
    eventType: 'call_ended',
    aggregateType: 'call',
    aggregateId: callId,
    payload: { callId, uid },
    status: 'pending',
    source: 'client',
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  pokeConsumer();
}

/** pushCallEvent — evento de señalización propio (reglas: from==uid). */
export async function pushCallEvent(
  callId: string,
  from: string,
  type: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const db = await getFirebaseFirestore();
  const { addDoc, collection } = await import('firebase/firestore');
  await addDoc(collection(db, FS_COL.calls, callId, 'events'), {
    from,
    type,
    at: serverTimestamp(),
    ...extra,
  });
}
