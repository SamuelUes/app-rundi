import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRideChat } from '../../../api/chats';
import {
  CHAT_PAGE_SIZE,
  listenChatMessages,
  loadOlderChatMessages,
  sendChatMessage,
} from '../../../live/chats';
import type { QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore';

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  isOwn: boolean;
}

/**
 * Chat del viaje — v2 (REALTIME_chats/{chatId}/messages).
 * El doc del chat lo crea el backend (POST /v1/chats, participants desde SQL);
 * los mensajes van con batch atómico mensaje + pending event 'chat_message'.
 * Typing/presence por chat no existen en v2 (reglas no los permiten):
 * se conserva la API del hook devolviendo valores neutros.
 */
export function useChat(rideId: string, userId: string, _userName: string, _isVisible = false) {
  const [connected, setConnected] = useState(false);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const chatIdRef = useRef<string | null>(null);
  const oldestDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const historyExhaustedRef = useRef(false);
  const initializedRef = useRef(false);

  const toUIMessage = useCallback(
    (m: { id: string; from: string; text: string; sentAt?: any; senderName?: string }): ChatMessage => {
      const sentAt = m.sentAt;
      const ts =
        typeof sentAt?.toMillis === 'function'
          ? sentAt.toMillis()
          : typeof sentAt === 'number'
            ? sentAt
            : Date.now();
      return {
        id: m.id,
        rideId,
        senderId: m.from,
        senderName: m.senderName ?? '',
        message: m.text,
        timestamp: new Date(ts).toISOString(),
        isOwn: m.from === userId,
      };
    },
    [rideId, userId],
  );

  useEffect(() => {
    if (!rideId || !userId) return;

    let mounted = true;
    let unsubscribe: Unsubscribe | null = null;
    oldestDocRef.current = null;
    historyExhaustedRef.current = false;
    setOlderMessages([]);
    setHasMore(false);

    (async () => {
      try {
        const { chatId } = await createRideChat(rideId);
        if (!mounted) return;
        chatIdRef.current = chatId;
        unsubscribe = await listenChatMessages(chatId, (msgs, oldestDoc) => {
          if (!mounted) return;
          oldestDocRef.current = oldestDoc;
          // Ventana incompleta → no hay historial anterior; una cargada
          // completa vía loadOlder tampoco se reactiva aquí.
          setHasMore(msgs.length >= CHAT_PAGE_SIZE && !historyExhaustedRef.current);
          setLiveMessages(msgs.map(toUIMessage));
          initializedRef.current = true;
        });
        setConnected(true);
      } catch (error) {
        console.error('Error conectando chat:', error);
        setConnected(false);
      }
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
      chatIdRef.current = null;
      setConnected(false);
    };
  }, [rideId, userId, toUIMessage]);

  const loadOlder = useCallback(async () => {
    const chatId = chatIdRef.current;
    const cursor = oldestDocRef.current;
    if (!chatId || !cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await loadOlderChatMessages(chatId, cursor);
      if (page.oldestDoc) oldestDocRef.current = page.oldestDoc;
      if (!page.hasMore) historyExhaustedRef.current = true;
      setHasMore(page.hasMore);
      if (page.messages.length) {
        setOlderMessages((prev) => [...page.messages.map(toUIMessage), ...prev]);
      }
    } catch (error) {
      console.error('Error cargando mensajes anteriores:', error);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, toUIMessage]);

  const messages = useMemo(() => {
    if (!olderMessages.length) return liveMessages;
    const seen = new Set(olderMessages.map((m) => m.id));
    return [...olderMessages, ...liveMessages.filter((m) => !seen.has(m.id))];
  }, [olderMessages, liveMessages]);

  const sendMessage = useCallback(
    async (message: string, _recipientId?: string) => {
      const text = message.trim();
      if (!text) return;
      const chatId = chatIdRef.current;
      if (!chatId) {
        console.error('Chat no inicializado');
        return;
      }
      try {
        await sendChatMessage(chatId, userId, text);
      } catch (error) {
        console.error('Error enviando mensaje:', error);
      }
    },
    [userId],
  );

  // Typing indicators no existen en v2 — no-ops para compatibilidad de API.
  const sendTypingIndicator = useCallback(() => {}, []);
  const stopTypingIndicator = useCallback(() => {}, []);

  return {
    connected,
    otherUserOnline: false,
    messages,
    hasMore,
    loadingOlder,
    loadOlder,
    isTyping: false,
    typingUser: null,
    sendMessage,
    sendTypingIndicator,
    stopTypingIndicator,
    initializedRef,
  };
}
