import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { CallScaffold, CallAction } from '../../components/shared/CallScaffold';
import { useRideCalls } from '../../hooks/shared/calls/useRideCalls';
import { useLivekitConnection } from '../../hooks/shared/calls/useLivekitConnection';

interface RideCallScreenRouteParams {
  rideId?: string | null;
  otherUserId?: string | null;
  otherUserName?: string | null;
  autoStart?: boolean;
}

interface RideCallScreenProps {
  route?: { params?: RideCallScreenRouteParams };
}

export default function RideCallScreen({ route }: RideCallScreenProps) {
  const params = route?.params || {};
  const rideId = params.rideId || null;
  const otherUserId = params.otherUserId || null;
  const otherUserName = params.otherUserName || null;
  const autoStart = params.autoStart === true;

  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const ns = 'shared.rideCall';

  const {
    activeCall,
    livekitInfo,
    loading: callLoading,
    error: callError,
    resolvedUid,
    acceptCall,
    rejectCall,
    endCall,
    cancelCall,
    startRideCall,
    fetchLivekitToken,
  } = useRideCalls(rideId, otherUserId);

  const {
    connect: connectLivekit,
    disconnect: disconnectLivekit,
    connected: livekitConnected,
    connecting: livekitConnecting,
    micEnabled,
    speakerEnabled,
    toggleMic,
    toggleSpeaker,
    error: livekitError,
  } = useLivekitConnection();

  useEffect(() => {
    return () => {
      disconnectLivekit();
    };
  }, [disconnectLivekit]);

  // El backend no escribe events.initiated — el iniciador es callerUid.
  const isCallInitiator = Boolean(
    resolvedUid && activeCall?.callerUid === resolvedUid,
  );
  const ringing = ['initiated', 'ringing_client', 'ringing_driver'].includes(
    String(activeCall?.status || '').toLowerCase(),
  );
  // Suena para mí si la llamada la inició la contraparte; si la inicié yo es saliente.
  const isRinging = ringing && !isCallInitiator && Boolean(activeCall);
  const isOutgoing = ringing && isCallInitiator;
  const isAccepted = activeCall?.status === 'accepted' || activeCall?.status === 'connected';
  const isInCall = Boolean(isAccepted || livekitConnected);
  const isTerminal = Boolean(
    activeCall && ['ended', 'rejected', 'missed'].includes(String(activeCall.status || '').toLowerCase()),
  );

  // Cuando la contraparte cuelga/rechaza o la llamada desaparece, salir de la
  // sala para que los botones vuelvan a estado idle.
  useEffect(() => {
    if ((!activeCall || isTerminal) && livekitConnected) {
      disconnectLivekit();
    }
  }, [activeCall, isTerminal, livekitConnected, disconnectLivekit]);

  // autoStart: al abrir la pantalla desde el botón de llamada del chat, iniciar
  // la llamada sin paso extra si no hay una activa.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartRef.current) return;
    if (!rideId || !otherUserId || activeCall) return;
    autoStartRef.current = true;
    startRideCall().catch(() => {
      // el error ya se muestra en pantalla vía callError
    });
  }, [autoStart, rideId, otherUserId, activeCall, startRideCall]);

  // Al quedar la llamada aceptada, entrar a la sala sin paso extra — sea
  // saliente (la contraparte acepta) o entrante (aceptamos nosotros). El
  // webhook marca `connected` con ambos participantes dentro.
  const autoJoinCallIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoJoinCallIdRef.current && autoJoinCallIdRef.current !== activeCall?.callId) {
      autoJoinCallIdRef.current = null;
    }
    if (!activeCall?.callId || !isAccepted) return;
    if (livekitConnected || livekitConnecting) return;
    if (autoJoinCallIdRef.current === activeCall.callId) return;
    autoJoinCallIdRef.current = activeCall.callId;
    if (livekitInfo) {
      connectLivekit(livekitInfo);
      return;
    }
    fetchLivekitToken(activeCall.callId).then((info) => {
      if (info) connectLivekit(info);
    });
  }, [
    activeCall?.callId,
    isAccepted,
    livekitConnected,
    livekitConnecting,
    livekitInfo,
    fetchLivekitToken,
    connectLivekit,
  ]);

  const handleJoinRoom = async () => {
    if (callLoading) return;
    try {
      if (isRinging && activeCall?.callId) {
        await acceptCall(activeCall.callId);
      }

      let info = livekitInfo;
      if (!info && activeCall?.callId) {
        info = await fetchLivekitToken(activeCall.callId);
      }

      if (!info) {
        Alert.alert(
          t(`${ns}.title`, 'Llamada del viaje'),
          t(`${ns}.labels.noRoomToken`, 'Aún no hay token de sala. Solicita o acepta la llamada primero.'),
        );
        return;
      }

      await connectLivekit(info);
    } catch (error: any) {
      Alert.alert(
        t(`${ns}.errors.title`, 'Error'),
        error?.message || t(`${ns}.errors.joinRoom`, 'No se pudo unir a la sala en este momento.'),
      );
    }
  };

  const handleCallAction = async () => {
    if (callLoading) return;

    if (isInCall && activeCall?.callId) {
      await endCall(activeCall.callId);
      disconnectLivekit();
      return;
    }

    if (isRinging && activeCall?.callId) {
      await acceptCall(activeCall.callId);
      return;
    }

    if (isOutgoing) {
      return;
    }

    try {
      await startRideCall();
    } catch (error: any) {
      Alert.alert(
        t(`${ns}.errors.title`, 'Error'),
        error?.message || t(`${ns}.errors.startCall`, 'No se pudo iniciar la llamada en este momento.'),
      );
    }
  };

  if (!rideId || !otherUserId) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <MaterialIcons name="support-agent" size={30} color="#E8C985" />
        </View>
        <Text style={styles.emptyTitle}>{t(`${ns}.emptyState.title`, 'Sin viaje activo')}</Text>
        <Text style={styles.emptySubtitle}>{t(`${ns}.emptyState.subtitle`, 'Abre el chat del viaje para llamar a la otra parte.')}</Text>
        <TouchableOpacity style={styles.backPill} onPress={() => navigation.goBack()}>
          <Text style={styles.backPillText}>{t(`${ns}.emptyState.back`, 'Volver')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const callId = activeCall?.callId;


  const callAction: CallAction =
    isRinging && callId
      ? {
          kind: 'incoming',
          loading: callLoading || livekitConnecting,
          onAccept: handleJoinRoom,
          onDecline: () => rejectCall(callId),
        }
      : isOutgoing && callId
        ? { kind: 'outgoing', loading: callLoading, onCancel: () => cancelCall(callId) }
        : isInCall
          ? { kind: 'incall', loading: callLoading || livekitConnecting, onEnd: handleCallAction }
          : { kind: 'call', loading: callLoading, onPress: handleCallAction };

  const statusText = isTerminal
    ? t(`${ns}.labels.ended`, 'Llamada finalizada')
    : isRinging
      ? t(`${ns}.labels.incoming`, 'Llamada entrante')
      : isOutgoing
        ? t(`${ns}.actions.calling`, 'Llamando…')
        : livekitConnecting
          ? t(`${ns}.labels.stateConnecting`, 'Conectando...')
          : isInCall
            ? t(`${ns}.labels.tapToJoin`, 'Toca para unirte')
            : t(`${ns}.subtitle`, 'Voz en tiempo real con la otra parte');

  return (
    <CallScaffold
      overline={t(`${ns}.title`, 'Llamada del viaje')}
      displayName={otherUserName || t(`${ns}.labels.otherParty`, 'La otra parte')}
      statusText={statusText}
      connected={livekitConnected}
      showPulse={isRinging || isOutgoing || livekitConnecting}
      micEnabled={micEnabled}
      speakerEnabled={speakerEnabled}
      controlsEnabled={livekitConnected && !callLoading}
      onToggleMic={toggleMic}
      onToggleSpeaker={toggleSpeaker}
      action={callAction}
      onBack={() => navigation.goBack()}
      labels={{
        mic: t(`${ns}.actions.micro`, 'Micrófono'),
        speaker: t(`${ns}.actions.speaker`, 'Altavoz'),
        end: t(`${ns}.actions.hangup`, 'Colgar'),
        accept: t(`${ns}.actions.accept`, 'Aceptar'),
        decline: t(`${ns}.actions.reject`, 'Rechazar'),
        cancel: t(`${ns}.actions.cancelRequest`, 'Cancelar llamada'),
        call: t(`${ns}.actions.call`, 'Llamar'),
        join: t(`${ns}.actions.joinRoom`, 'Unirse a la sala'),
      }}
      errorText={callError || livekitError}
      debugText={`viaje ${rideId.slice(0, 8)} · sala ${livekitInfo?.room || '—'} · lk ${livekitConnected ? 'on' : livekitConnecting ? '…' : 'off'} · ${activeCall?.status || 'idle'}`}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    backgroundColor: '#100D0A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(201, 163, 90, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201, 163, 90, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F4EEE2',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(244, 238, 226, 0.60)',
    textAlign: 'center',
    marginBottom: 20,
  },
  backPill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(201, 163, 90, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(201, 163, 90, 0.55)',
  },
  backPillText: {
    color: '#EEDCB4',
    fontWeight: '700',
  },
});
