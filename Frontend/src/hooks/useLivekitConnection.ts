import { useCallback, useEffect, useRef, useState } from 'react';

export interface LivekitJoinInfo {
  token: string;
  url: string;
  room: string;
}

interface UseLivekitConnection {
  connect: (info: LivekitJoinInfo) => Promise<void>;
  disconnect: () => void;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

export function useLivekitConnection(): UseLivekitConnection {
  const roomRef = useRef<any>(null);
  const roomNameRef = useRef<string | null>(null);
  const connectAttemptRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        try {
          roomRef.current.disconnect();
        } catch (err) {
          // ignore
        }
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    try {
      roomRef.current?.disconnect();
    } catch (err) {
      console.warn('Error al desconectar LiveKit', err);
    } finally {
      roomRef.current = null;
      roomNameRef.current = null;
      setConnected(false);
      setConnecting(false);
    }
  }, []);

  const connect = useCallback(async (info: LivekitJoinInfo) => {
    if (!info?.token || !info?.url) {
      setError('Faltan credenciales de LiveKit');
      return;
    }

    if (roomRef.current && connected && roomNameRef.current === info.room) {
      return;
    }

    if (roomRef.current) {
      disconnect();
    }

    const attemptId = ++connectAttemptRef.current;
    setConnecting(true);
    setError(null);
    try {
      const lk = await import('livekit-client');
      const room = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(lk.RoomEvent.Disconnected, () => {
        setConnected(false);
      });

      await room.connect(info.url, info.token);

      if (attemptId !== connectAttemptRef.current) {
        try {
          room.disconnect();
        } catch (err) {
          // ignore
        }
        return;
      }

      setConnected(true);
      roomRef.current = room;
      roomNameRef.current = info.room || null;

      // Auto-enable microphone
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        // If permissions are missing, we'll stay connected without mic
        console.warn('No se pudo habilitar micrófono', err);
      }
    } catch (err: any) {
      console.error('Error conectando a LiveKit', err);
      setError(err?.message || 'No se pudo conectar a LiveKit');
      setConnected(false);
    } finally {
      if (attemptId === connectAttemptRef.current) {
        setConnecting(false);
      }
    }
  }, [connected, disconnect]);

  return { connect, disconnect, connected, connecting, error };
}
