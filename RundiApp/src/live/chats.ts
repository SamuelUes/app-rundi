/**
 * Chats — mensajes por viaje (REALTIME_chats/{chatId}/messages).
 * El doc del chat lo crea el backend (POST /v1/chats, participants desde SQL);
 * los mensajes los escribe el participante por SDK según las reglas
 * (from==uid, text<=4000, solo keys permitidas).
 */
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirebaseFirestore } from '../config/firebase';
import { FS_COL } from '../constants/firestore';
import { pokeConsumer } from '../api/events';

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  type?: string;
  sentAt?: unknown;
}

/** sendChatMessage — mensaje + pending event 'chat_message' atómico (push a
 * los demás participantes vía consumer; port de onSupportChatMessage). */
export async function sendChatMessage(chatId: string, from: string, text: string): Promise<string> {
  const db = await getFirebaseFirestore();
  const batch = writeBatch(db);
  const msgRef = doc(collection(db, FS_COL.chats, chatId, 'messages'));
  batch.set(msgRef, {
    from,
    text,
    type: 'text',
    sentAt: serverTimestamp(),
  });
  batch.set(doc(db, FS_COL.pendingEvents, `chat-${chatId}-${msgRef.id}`), {
    eventType: 'chat_message',
    aggregateType: 'chat',
    aggregateId: chatId,
    payload: { chatId, uid: from },
    status: 'pending',
    source: 'client',
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  pokeConsumer();
  return msgRef.id;
}

/** Ventana por defecto del listener — historial completo via loadOlderChatMessages. */
export const CHAT_PAGE_SIZE = 50;

const toMessage = (d: { id: string; data: () => Record<string, any> }): ChatMessage =>
  ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) });

/** listenChatMessages — ventana reciente (desc + limit, invertida a asc).
 * cb recibe los mensajes asc y el doc más viejo de la ventana, que sirve de
 * cursor para loadOlderChatMessages. Devuelve unsubscribe correcto. */
export async function listenChatMessages(
  chatId: string,
  cb: (messages: ChatMessage[], oldestDoc: QueryDocumentSnapshot | null) => void,
  pageSize: number = CHAT_PAGE_SIZE,
): Promise<Unsubscribe> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.chats, chatId, 'messages'),
    orderBy('sentAt', 'desc'),
    limit(pageSize),
  );
  return onSnapshot(q, (snap) => {
    cb([...snap.docs].reverse().map(toMessage), snap.docs[snap.docs.length - 1] ?? null);
  });
}

export interface ChatOlderPage {
  messages: ChatMessage[];
  oldestDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

/** loadOlderChatMessages — página anterior a `oldestDoc` (cursor del listener
 * o de la página previa). Orden ascendente, listo para anteponer. */
export async function loadOlderChatMessages(
  chatId: string,
  oldestDoc: QueryDocumentSnapshot,
  pageSize: number = CHAT_PAGE_SIZE,
): Promise<ChatOlderPage> {
  const db = await getFirebaseFirestore();
  const q = query(
    collection(db, FS_COL.chats, chatId, 'messages'),
    orderBy('sentAt', 'desc'),
    startAfter(oldestDoc),
    limit(pageSize),
  );
  const snap = await getDocs(q);
  return {
    messages: [...snap.docs].reverse().map(toMessage),
    oldestDoc: snap.docs[snap.docs.length - 1] ?? null,
    hasMore: snap.docs.length === pageSize,
  };
}
