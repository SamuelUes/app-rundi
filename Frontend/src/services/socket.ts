import { io, Socket } from 'socket.io-client';

export function createSocket(namespace: string = '/'): Socket {
  const url = (process.env.API_BASE_URL || 'http://localhost:3000') + namespace;
  return io(url, { transports: ['websocket'] });
}
