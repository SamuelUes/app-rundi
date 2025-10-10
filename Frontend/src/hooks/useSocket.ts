import { useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket(namespace = '/') {
  const socket: Socket = useMemo(() => io(process.env.API_BASE_URL || 'http://localhost:3000' + namespace, {
    transports: ['websocket'],
  }), [namespace]);

  useEffect(() => {
    return () => {
      socket.close();
    };
  }, [socket]);

  return socket;
}
