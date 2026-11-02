import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface LivekitJoinInfo {
  token: string;
  url: string;
  room: string;
}

interface UseLivekitConnection {
  connect: (info: LivekitJoinInfo) => Promise<void>;
  disconnect: () => void;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
  connected: boolean;
  connecting: boolean;
  micEnabled: boolean;
  speakerEnabled: boolean;
  error: string | null;
}

export function useLivekitConnection(): UseLivekitConnection {
  const roomRef = useRef<any>(null);
  const roomNameRef = useRef<string | null>(null);
  const connectAttemptRef = useRef(0);
  const globalsRegisteredRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [micEnabled, setMicEnabledState] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ensureWebRTCGlobals = useCallback(async () => {
    if (Platform.OS === 'web' || globalsRegisteredRef.current) return;
    let webrtcModule: any = null;
    try {
      webrtcModule = require('@livekit/react-native-webrtc');
    } catch (errRequire) {
      try {
        webrtcModule = await import('@livekit/react-native-webrtc');
      } catch (errImport) {
        console.error('[LiveKit] No se pudo cargar @livekit/react-native-webrtc', {
          errRequire,
          errImport,
        });
        throw new Error('WebRTC nativo no disponible. Usa dev client y reconstruye la app.');
      }
    }

    const webrtc =
      webrtcModule?.registerGlobals
        ? webrtcModule
        : webrtcModule?.default?.registerGlobals
          ? webrtcModule.default
          : null;

    if (typeof webrtc?.registerGlobals !== 'function') {
      console.error('[LiveKit] registerGlobals no está disponible en el módulo cargado', {
        hasModule: Boolean(webrtcModule),
        moduleKeys: webrtcModule ? Object.keys(webrtcModule) : [],
      });
      throw new Error('WebRTC no inicializado (registerGlobals no disponible). Rebuild del dev client requerido.');
    }

    webrtc.registerGlobals();
    globalsRegisteredRef.current = true;

    // livekit-client llama getBrowser() → navigator.userAgent.toLowerCase() al
    // publicar tracks (isE2EESimulcastSupported corre siempre en publish()). En
    // RN navigator existe pero userAgent es undefined → TypeError que aborta el
    // publish del micrófono. Polyfill mínimo: sin match de browser en getBrowser,
    // los paths específicos de Firefox/Safari quedan desactivados (correcto en RN).
    try {
      const nav = (globalThis as any).navigator;
      if (nav && !nav.userAgent) {
        nav.userAgent = 'react-native';
      }
    } catch {
      // navigator no escribible — el publish degradará con warn de micrófono
    }
  }, []);

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
      setMicEnabledState(true);
      setSpeakerEnabled(true);
    }
  }, []);

  const setMicEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicEnabledState(enabled);
  }, []);

  const toggleMic = useCallback(async () => {
    const next = !micEnabled;
    try {
      await setMicEnabled(next);
    } catch (err) {
      console.warn('No se pudo actualizar micrófono', err);
      throw err;
    }
  }, [micEnabled, setMicEnabled]);

  const toggleSpeaker = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !speakerEnabled;
    try {
      if (typeof room.switchActiveDevice === 'function') {
        await room.switchActiveDevice('audiooutput', next ? 'default' : 'communications');
      }
      setSpeakerEnabled(next);
    } catch (err) {
      console.warn('No se pudo cambiar salida de audio', err);
      setSpeakerEnabled(next);
    }
  }, [speakerEnabled]);

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
      await ensureWebRTCGlobals();
      const lk = require('livekit-client');
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
        setMicEnabledState(true);
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
  }, [connected, disconnect, ensureWebRTCGlobals]);

  return {
    connect,
    disconnect,
    setMicEnabled,
    toggleMic,
    toggleSpeaker,
    connected,
    connecting,
    micEnabled,
    speakerEnabled,
    error,
  };
}
