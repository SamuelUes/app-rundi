import { useEffect, useRef, useState } from 'react';
import firebaseTrackingService from '../../../services/firebaseTrackingService';
import { getFirebaseDatabase } from '../../../config/firebase';
import { ref, push, onChildAdded, off, get, query, orderByChild, limitToLast } from 'firebase/database';

const CHAT_REF = 'chats';

export interface ChatMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
  isOwn: boolean;
}

export function useChat(rideId: string, userId: string, userName: string) {
  const [connected, setConnected] = useState(true); // Firebase siempre está "conectado"
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const messagesRef = useRef<any>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!rideId || !userId) return;

    // Conectar a Firebase RTDB
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

      messagesRef.current = chatRef;

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
              timestamp: data.timestamp,
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
            timestamp: data.timestamp,
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
    if (messagesRef.current) {
      off(messagesRef.current);
      messagesRef.current = null;
      console.log('🧹 Chat desconectado');
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
        timestamp: new Date().toISOString(),
      };

      // Enviar a Firebase RTDB
      await push(chatRef, messageData);

      console.log('💬 Mensaje enviado:', messageData);
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
    }
  };

  const sendTypingIndicator = () => {
    // Para Firebase RTDB, podríamos implementar typing indicators
    // pero por simplicidad, lo dejamos como está por ahora
    console.log('👆 Typing indicator (no implementado en Firebase)');
  };

  return {
    connected,
    messages,
    isTyping,
    typingUser,
    sendMessage,
    sendTypingIndicator,
    initializedRef,
  };
}
