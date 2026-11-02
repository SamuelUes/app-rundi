import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { CallScaffold, CallAction } from '../../components/shared/CallScaffold';
import { useCalls } from '../../hooks/shared/calls/useCalls';
import { useLivekitConnection } from '../../hooks/shared/calls/useLivekitConnection';

interface SupportCallScreenRouteParams {
  complaintId?: string | null;
  rideId?: string | null;
}

interface SupportCallScreenProps {
  route?: { params?: SupportCallScreenRouteParams };
}

export default function SupportCallScreen({ route }: SupportCallScreenProps) {
  const params = route?.params || {};
  const complaintId = params.complaintId || null;
  const rideId = params.rideId || null;

  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const ns = 'shared.supportCall';

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
    requestCall,
    fetchLivekitToken,
  } = useCalls(complaintId);

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

  const isRinging = activeCall?.status === 'ringing_client';
  // Llamada saliente: el cliente inició y espera a que el operador acepte.
  const isOutgoing = activeCall?.status === 'ringing_operator' || activeCall?.status === 'initiated';
  const isAccepted = activeCall?.status === 'accepted' || activeCall?.status === 'connected';
  const isInCall = Boolean(isAccepted || livekitConnected);
  const isTerminal = Boolean(
    activeCall && ['ended', 'rejected', 'missed'].includes(String(activeCall.status || '').toLowerCase()),
  );
  const isCallInitiator = Boolean(
    activeCall?.events?.initiated?.by && resolvedUid && activeCall.events.initiated.by === resolvedUid,
  );

  // Cuando el operador cierra/rechaza/transfiere a terminal, o la llamada
  // desaparece, salir de la sala para que los botones vuelvan a estado idle.
  useEffect(() => {
    if ((!activeCall || isTerminal) && livekitConnected) {
      disconnectLivekit();
    }
  }, [activeCall, isTerminal, livekitConnected, disconnectLivekit]);

  // Cuando el operador acepta nuestra llamada saliente (ringing_operator →
  // accepted), entrar a la sala sin paso extra. El webhook marca `connected`
  // cuando ambos participantes están dentro.
  const autoJoinCallIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoJoinCallIdRef.current && autoJoinCallIdRef.current !== activeCall?.callId) {
      autoJoinCallIdRef.current = null;
    }
    if (!activeCall?.callId || !isAccepted || !isCallInitiator) return;
    if (livekitConnected || livekitConnecting || livekitInfo) return;
    if (autoJoinCallIdRef.current === activeCall.callId) return;
    autoJoinCallIdRef.current = activeCall.callId;
    fetchLivekitToken(activeCall.callId).then((info) => {
      if (info) connectLivekit(info);
    });
  }, [
    activeCall?.callId,
    isAccepted,
    isCallInitiator,
    livekitConnected,
    livekitConnecting,
    livekitInfo,
    fetchLivekitToken,
    connectLivekit,
  ]);

  const handleJoinRoom = async () => {
    if (!complaintId || callLoading) return;
    try {
      if (activeCall?.status === 'ringing_client') {
        await acceptCall(activeCall.callId);
      }

      let info = livekitInfo;
      if (!info && activeCall?.callId) {
        info = await fetchLivekitToken(activeCall.callId);
      }

      if (!info) {
        Alert.alert(
          t(`${ns}.title`, 'Llamada de soporte'),
          t(`${ns}.labels.noRoomToken`, 'Aún no hay token de sala. Solicita o acepta la llamada primero.'),
        );
        return;
      }

      await connectLivekit(info);
    } catch (error: any) {
      Alert.alert(
        t(`shared.supportChat.errors.title`, 'Error'),
        error?.message || t(`shared.supportChat.call.requestError`, 'No se pudo unir a la sala en este momento.'),
      );
    }
  };

  const handleCallAction = async () => {
    if (!complaintId || callLoading) return;

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
      await requestCall({
        complaintId,
        rideId: rideId || null,
      });
    } catch (error: any) {
      Alert.alert(
        t(`shared.supportChat.errors.title`, 'Error'),
        error?.message || t(`shared.supportChat.call.requestError`, 'No se pudo iniciar la llamada en este momento.'),
      );
    }
  };

  if (!complaintId) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="call-outline" size={30} color="#E8C985" />
        </View>
        <Text style={styles.emptyTitle}>{t(`${ns}.emptyState.title`, 'Sin caso activo')}</Text>
        <Text style={styles.emptySubtitle}>{t(`${ns}.emptyState.subtitle`, 'Crea o abre un caso en el chat de soporte para gestionar llamadas.')}</Text>
        <TouchableOpacity style={styles.backPill} onPress={() => navigation.goBack()}>
          <Text style={styles.backPillText}>{t(`${ns}.emptyState.back`, 'Volver')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const callId = activeCall?.callId;
  const needsJoin = isInCall && !livekitConnected && !livekitConnecting;

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
        : needsJoin
          ? {
              kind: 'join',
              loading: callLoading || livekitConnecting,
              onJoin: handleJoinRoom,
              onEnd: handleCallAction,
            }
          : isInCall
            ? { kind: 'incall', loading: callLoading, onEnd: handleCallAction }
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
            : t(`${ns}.labels.ready`, 'Solicita una llamada para hablar con un operador');

  return (
    <CallScaffold
      overline={t(`${ns}.title`, 'Llamada de soporte')}
      displayName={t(`${ns}.labels.supportName`, 'Soporte')}
      avatarIcon="headset"
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
        cancel: t(`${ns}.actions.cancelRequest`, 'Cancelar solicitud'),
        call: t(`${ns}.actions.call`, 'Llamar'),
        join: t(`${ns}.actions.joinRoom`, 'Unirse a la sala'),
      }}
      errorText={callError || livekitError}
      debugText={`caso ${complaintId.slice(0, 8)} · sala ${livekitInfo?.room || '—'} · lk ${livekitConnected ? 'on' : livekitConnecting ? '…' : 'off'} · ${activeCall?.status || 'idle'}`}
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
