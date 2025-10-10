import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../config/environment';

const SOCKET_URL = `${WS_URL}/tracking`;

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
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId || !userId) return;

    // Conectar al WebSocket
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Chat conectado');
      setConnected(true);

      // Suscribirse al viaje
      socket.emit('ride:subscribe', { rideId });
    });

    socket.on('disconnect', () => {
      console.log('❌ Chat desconectado');
      setConnected(false);
    });

    // Escuchar mensajes
    socket.on('chat:message', (data: any) => {
      console.log('💬 Mensaje recibido:', data);
      
      const newMessage: ChatMessage = {
        id: `${data.senderId}-${data.timestamp}`,
        rideId: data.rideId,
        senderId: data.senderId,
        senderName: data.senderName,
        message: data.message,
        timestamp: data.timestamp,
        isOwn: data.senderId === userId,
      };

      setMessages((prev) => [...prev, newMessage]);
    });

    // Escuchar indicador de escritura
    socket.on('chat:typing', (data: any) => {
      if (data.userId !== userId) {
        setIsTyping(true);
        setTypingUser(data.userName);
        
        // Limpiar después de 3 segundos
        setTimeout(() => {
          setIsTyping(false);
          setTypingUser(null);
        }, 3000);
      }
    });

    // Cleanup
    return () => {
      if (socket.connected) {
        socket.disconnect();
      }
    };
  }, [rideId, userId]);

  const sendMessage = (message: string) => {
    if (!socketRef.current || !message.trim()) return;

    const newMessage: ChatMessage = {
      id: `${userId}-${new Date().toISOString()}`,
      rideId,
      senderId: userId,
      senderName: userName,
      message: message.trim(),
      timestamp: new Date().toISOString(),
      isOwn: true,
    };

    // Agregar mensaje localmente
    setMessages((prev) => [...prev, newMessage]);

    // Enviar al servidor
    socketRef.current.emit('chat:message', {
      rideId,
      senderId: userId,
      senderName: userName,
      message: message.trim(),
    });
  };

  const sendTypingIndicator = () => {
    if (!socketRef.current) return;

    socketRef.current.emit('chat:typing', {
      rideId,
      userId,
      userName,
    });
  };

  return {
    connected,
    messages,
    isTyping,
    typingUser,
    sendMessage,
    sendTypingIndicator,
  };
}
