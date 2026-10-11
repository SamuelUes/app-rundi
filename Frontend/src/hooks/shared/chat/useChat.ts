import { useEffect, useRef, useState } from 'react';
import { getFirebaseDatabase } from '../../../config/firebase';
import {
  ref,
  push,
  onChildAdded,
  onValue,
  onDisconnect,
  off,
  get,
  set,
  remove,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp,
} from 'firebase/database';

const CHAT_REF = 'chats';
const TYPING_THROTTLE_MS = 2000;
const TYPING_TTL_MS = 6000;
const TYPING_SELF_CLEAR_MS = 3500;

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  isOwn: boolean;
}

interface ChatRefs {
  messages: any;
  typingAll: any;
  typingSelf: any;
  presenceAll: any;
  presenceSelf: any;
  connected: any;
}

export function useChat(rideId: string, userId: string, userName: string) {
  const [connected, setConnected] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const refsRef = useRef<ChatRefs | null>(null);
  const initializedRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const typingExpireRef = useRef<NodeJS.Timeout | null>(null);
  const typingSelfClearRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!rideId || !userId) return;

    setupChatListener();

    return () => {
      cleanupChatListener();
    };
  }, [rideId, userId]);

  const setupChatListener = async () => {
    try {
      console.log(`🔌 Conectando chat para rideId: ${rideId}, userId: ${userId}`);
      const database = await getFirebaseDatabase();
      const chatRef = ref(database, `${CHAT_REF}/${rideId}/messages`);
      const typingAllRef = ref(database, `${CHAT_REF}/${rideId}/typing`);
      const typingSelfRef = ref(database, `${CHAT_REF}/${rideId}/typing/${userId}`);
      const presenceAllRef = ref(database, `${CHAT_REF}/${rideId}/presence`);
      const presenceSelfRef = ref(database, `${CHAT_REF}/${rideId}/presence/${userId}`);
      const connectedRef = ref(database, '.info/connected');

      refsRef.current = {
        messages: chatRef,
        typingAll: typingAllRef,
        typingSelf: typingSelfRef,
        presenceAll: presenceAllRef,
        presenceSelf: presenceSelfRef,
        connected: connectedRef,
      };

      // Estado de conexión real + presencia propia con limpieza onDisconnect
      onValue(connectedRef, (snapshot) => {
        const isConnected = snapshot.val() === true;
        setConnected(isConnected);
        if (isConnected) {
          set(presenceSelfRef, true).catch(() => {});
          onDisconnect(presenceSelfRef).set(false).catch(() => {});
          onDisconnect(typingSelfRef).remove().catch(() => {});
        }
      });

      // Presencia del otro participante (tiene el chat abierto)
      onValue(presenceAllRef, (snapshot) => {
        const val = snapshot.val() || {};
        const otherOnline = Object.keys(val).some((uid) => uid !== userId && val[uid] === true);
        setOtherUserOnline(otherOnline);
      });

      // Indicador de escritura del otro participante (entradas con timestamp fresco)
      onValue(typingAllRef, (snapshot) => {
        const val = snapshot.val() || {};
        const now = Date.now();
        let found = false;
        let name: string | null = null;
        Object.keys(val).forEach((uid) => {
          const info = val[uid];
          if (uid !== userId && info && typeof info.ts === 'number' && now - info.ts < TYPING_TTL_MS) {
            found = true;
            name = info.name || null;
          }
        });
        setTypingUser(name);
        setIsTyping(found);

        // Si el remove() remoto nunca llega, expirar localmente
        if (typingExpireRef.current) {
          clearTimeout(typingExpireRef.current);
          typingExpireRef.current = null;
        }
        if (found) {
          typingExpireRef.current = setTimeout(() => {
            setIsTyping(false);
            setTypingUser(null);
          }, TYPING_TTL_MS);
        }
      });

      // Cargar historial existente (últimos 50 mensajes)
      const historyQuery = query(chatRef, orderByChild('timestamp'), limitToLast(50));
      const historySnap = await get(historyQuery);

      if (historySnap.exists()) {
        const historyMessages: ChatMessage[] = [];
        historySnap.forEach((child) => {
          const data = child.val();
          if (data) {
            historyMessages.push({
              id: child.key || `${data.senderId}-${data.timestamp}`,
              rideId: data.rideId,
              senderId: data.senderId,
              senderName: data.senderName,
              message: data.message,
              timestamp: typeof data.timestamp === 'number' ? new Date(data.timestamp).toISOString() : data.timestamp,
              isOwn: data.senderId === userId,
            });
          }
        });
        setMessages(historyMessages);
        console.log(`📚 Historial cargado: ${historyMessages.length} mensajes`);
      }

      // Escuchar nuevos mensajes en tiempo real
      onChildAdded(chatRef, (snapshot) => {
        console.log('📨 Nuevo mensaje detectado en Firebase:', snapshot.key);
        const data = snapshot.val();
        console.log('📦 Datos del mensaje:', data);

        if (data) {
          const newMessage: ChatMessage = {
            id: snapshot.key || `${data.senderId}-${data.timestamp}`,
            rideId: data.rideId,
            senderId: data.senderId,
            senderName: data.senderName,
            message: data.message,
            timestamp: typeof data.timestamp === 'number' ? new Date(data.timestamp).toISOString() : data.timestamp,
            isOwn: data.senderId === userId,
          };

          setMessages((prev) => {
            // Evitar duplicados
            if (prev.some(msg => msg.id === newMessage.id)) {
              console.log('⚠️ Mensaje duplicado, ignorando:', newMessage.id);
              return prev;
            }
            console.log('➕ Agregando mensaje a la lista');
            return [...prev, newMessage];
          });

          if (!initializedRef.current) {
            initializedRef.current = true;
          }
        }
      });

      console.log('✅ Chat conectado a Firebase RTDB');
    } catch (error) {
      console.error('❌ Error conectando chat:', error);
    }
  };

  const cleanupChatListener = () => {
    const refs = refsRef.current;
    if (refs) {
      off(refs.messages);
      off(refs.typingAll);
      off(refs.presenceAll);
      off(refs.connected);
      if (refs.typingSelf) {
        remove(refs.typingSelf).catch(() => {});
      }
      if (refs.presenceSelf) {
        remove(refs.presenceSelf).catch(() => {});
      }
      refsRef.current = null;
      console.log('🧹 Chat desconectado');
    }
    if (typingExpireRef.current) {
      clearTimeout(typingExpireRef.current);
      typingExpireRef.current = null;
    }
    if (typingSelfClearRef.current) {
      clearTimeout(typingSelfClearRef.current);
      typingSelfClearRef.current = null;
    }
  };

  const sendMessage = async (message: string) => {
    if (!message.trim()) return;

    try {
      const database = await getFirebaseDatabase();
      const chatRef = ref(database, `${CHAT_REF}/${rideId}/messages`);

      const messageData = {
        rideId,
        senderId: userId,
        senderName: userName,
        message: message.trim(),
        // epoch ms: el índice orderByChild('timestamp') ordena mal si se
        // mezclan strings ISO y números en el mismo nodo
        timestamp: Date.now(),
      };

      // Enviar a Firebase RTDB
      await push(chatRef, messageData);

      // Limpiar el indicador de escritura propio al enviar
      stopTypingIndicator();

      console.log('💬 Mensaje enviado:', messageData);
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
    }
  };

  const sendTypingIndicator = () => {
    const typingSelfRef = refsRef.current?.typingSelf;
    if (!typingSelfRef) return;

    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;

    set(typingSelfRef, { name: userName, ts: serverTimestamp() }).catch(() => {});

    // Auto-limpiar si el usuario deja de escribir
    if (typingSelfClearRef.current) {
      clearTimeout(typingSelfClearRef.current);
    }
    typingSelfClearRef.current = setTimeout(() => {
      const selfRef = refsRef.current?.typingSelf;
      if (selfRef) {
        remove(selfRef).catch(() => {});
      }
    }, TYPING_SELF_CLEAR_MS);
  };

  const stopTypingIndicator = () => {
    lastTypingSentRef.current = 0;
    if (typingSelfClearRef.current) {
      clearTimeout(typingSelfClearRef.current);
      typingSelfClearRef.current = null;
    }
    const typingSelfRef = refsRef.current?.typingSelf;
    if (typingSelfRef) {
      remove(typingSelfRef).catch(() => {});
    }
  };

  return {
    connected,
    otherUserOnline,
    messages,
    isTyping,
    typingUser,
    sendMessage,
    sendTypingIndicator,
    stopTypingIndicator,
    initializedRef,
  };
}
