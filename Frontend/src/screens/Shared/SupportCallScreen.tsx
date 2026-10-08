import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useCalls } from '../../hooks/shared/calls/useCalls';
import { useLivekitConnection } from '../../hooks/shared/calls/useLivekitConnection';
import { getFirebaseFunctions } from '../../config/firebase';

interface SupportCallScreenRouteParams {
  complaintId?: string | null;
  rideId?: string | null;
}

interface SupportCallScreenProps {
  route?: { params?: SupportCallScreenRouteParams };
}

const backIcon = require('../../assets/icons/back_button/back_button2x.png');

export default function SupportCallScreen({ route }: SupportCallScreenProps) {
  const params = route?.params || {};
  const complaintId = params.complaintId || null;
  const rideId = params.rideId || null;

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets), [colors, insets]);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const ns = 'shared.supportCall';

  const [requestingCall, setRequestingCall] = useState(false);

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
  const isAccepted = activeCall?.status === 'accepted' || activeCall?.status === 'connected';
  const isInCall = Boolean(isAccepted || livekitConnected);
  const isCallInitiator = Boolean(
    activeCall?.events?.initiated?.by && resolvedUid && activeCall.events.initiated.by === resolvedUid,
  );

  const handleRequestCall = async () => {
    if (!complaintId || requestingCall || callLoading) return;

    try {
      setRequestingCall(true);
      const functions = await getFirebaseFunctions();
      if (!functions) {
        throw new Error(t(`shared.supportChat.errors.initializeService`));
      }

      const requestSupportCall = httpsCallable(functions, 'requestSupportCall');
      await requestSupportCall({
        complaintId,
        rideId: rideId || null,
      });

      await requestCall({
        complaintId,
        rideId: rideId || null,
      });

      Alert.alert(
        t(`shared.supportChat.call.requestTitle`, 'Llamada solicitada'),
        t(`shared.supportChat.call.requestBody`, 'Notificamos a soporte para que te llame. Recibiras una alerta cuando inicien la llamada.'),
      );
    } catch (error: any) {
      Alert.alert(
        t(`shared.supportChat.errors.title`, 'Error'),
        error?.message || t(`shared.supportChat.call.requestError`, 'No se pudo solicitar la llamada en este momento.'),
      );
    } finally {
      setRequestingCall(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!complaintId || callLoading) return;
    try {
      if (activeCall?.status === 'ringing_client') {
        await acceptCall(activeCall.callId);
      }

      if (!livekitInfo) {
        Alert.alert(
          t(`${ns}.title`, 'Llamada de soporte'),
          t(`${ns}.labels.noRoomToken`, 'Aún no hay token de sala. Solicita o acepta la llamada primero.'),
        );
        return;
      }

      await connectLivekit(livekitInfo);
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

    await handleRequestCall();
  };

  const callActionLabel = isInCall
    ? t(`${ns}.actions.hangup`, 'Colgar')
    : isRinging
      ? t(`${ns}.actions.accept`, 'Aceptar')
      : t(`${ns}.actions.call`, 'Llamar');

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

  return (
    <View style={styles.container}>
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <View style={styles.contentWrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Image source={backIcon} style={styles.backIcon} resizeMode="contain" />
          </TouchableOpacity>
          <View style={styles.headerTexts}>
            <Text style={styles.title}>{t(`${ns}.title`, 'Llamada de soporte')}</Text>
            <Text style={styles.subtitle}>{t(`${ns}.subtitle`, 'Control completo de la sesión')}</Text>
          </View>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.statusRow}>
            <Text style={styles.caseLabel}>{t(`${ns}.labels.case`, 'Caso')}</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{String(activeCall?.status || 'pending').replace('_', ' ').toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.caseValue}>{complaintId}</Text>
          <Text style={styles.metaLine}>{t(`${ns}.labels.operator`, 'Operador')}: {activeCall?.operatorUid || t(`${ns}.labels.operatorPending`, 'Pendiente de asignación')}</Text>
          <Text style={styles.metaLine}>{t(`${ns}.labels.callId`, 'Call ID')}: {activeCall?.callId || t(`${ns}.labels.callIdPending`, 'Aún no generado')}</Text>
          <Text style={styles.metaLine}>{t(`${ns}.labels.room`, 'Sala')}: {livekitInfo?.room || t(`${ns}.labels.roomPending`, 'Sin sala activa')}</Text>
          <Text style={styles.metaLine}>
            {t(`${ns}.labels.livekit`, 'LiveKit')}: {livekitConnecting ? t(`${ns}.labels.stateConnecting`, 'Conectando...') : livekitConnected ? t(`${ns}.labels.stateConnected`, 'Conectado') : t(`${ns}.labels.stateDisconnected`, 'Desconectado')}
          </Text>
          {callError ? <Text style={styles.errorText}>{callError}</Text> : null}
          {livekitError ? <Text style={styles.errorText}>{livekitError}</Text> : null}
        </View>

        <View style={styles.actionsCard}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            isRinging && styles.acceptButton,
            isInCall && styles.dangerButton,
            (callLoading || requestingCall) && styles.disabledButton,
          ]}
          disabled={callLoading || requestingCall}
          onPress={handleCallAction}
          activeOpacity={0.85}
        >
          {(callLoading || requestingCall) ? (
            <LoadingIcon size={24} color="#ffffff" />
          ) : (
            <View style={styles.buttonRow}>
              <MaterialIcons
                name={isInCall ? 'call-end' : 'call'}
                size={18}
                color={isRinging || isInCall ? '#FFFFFF' : '#1A130B'}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  (isRinging || isInCall) && styles.primaryButtonTextLight,
                ]}
              >
                {callActionLabel}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {!isAccepted && !isInCall ? (
          <TouchableOpacity
            style={[styles.secondaryButton, (callLoading || requestingCall) && styles.disabledButton]}
            disabled={callLoading || requestingCall}
            onPress={handleRequestCall}
          >
            <Text style={styles.secondaryButtonText}>{t(`${ns}.actions.requestCall`, 'Solicitar llamada')}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            livekitConnected && styles.connectedButton,
            callLoading && styles.disabledButton,
          ]}
          disabled={callLoading || livekitConnected}
          onPress={handleJoinRoom}
        >
          <Text style={[styles.secondaryButtonText, livekitConnected && styles.connectedButtonText]}>
            {livekitConnected ? 'Connected' : t(`${ns}.actions.joinRoom`, 'Unirse a la sala')}
          </Text>
        </TouchableOpacity>

        {isRinging && activeCall?.callId ? (
          <TouchableOpacity
            style={[styles.ghostButton, callLoading && styles.disabledButton]}
            disabled={callLoading}
            onPress={() => (isCallInitiator ? cancelCall(activeCall.callId) : rejectCall(activeCall.callId))}
          >
            <Text style={styles.ghostButtonText}>
              {isCallInitiator
                ? t(`${ns}.actions.cancelRequest`, 'Cancelar solicitud')
                : t(`${ns}.actions.reject`, 'Rechazar')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.inlineControlsRow}>
          <TouchableOpacity
            style={[
              styles.inlineControlButton,
              !micEnabled && styles.inlineControlButtonActive,
              (!livekitConnected || callLoading) && styles.disabledButton,
            ]}
            disabled={!livekitConnected || callLoading}
            onPress={toggleMic}
            activeOpacity={0.75}
          >
            <Ionicons
              name={micEnabled ? 'mic-outline' : 'mic-off-outline'}
              size={15}
              color={!micEnabled ? '#C9B8F5' : 'rgba(244,238,226,0.8)'}
            />
            <Text style={styles.inlineControlText}>
              {micEnabled ? t(`${ns}.actions.muteMic`, 'Silenciar micrófono') : t(`${ns}.actions.unmuteMic`, 'Activar micrófono')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.inlineControlButton,
              speakerEnabled && styles.inlineControlButtonActive,
              (!livekitConnected || callLoading) && styles.disabledButton,
            ]}
            disabled={!livekitConnected || callLoading}
            onPress={toggleSpeaker}
            activeOpacity={0.75}
          >
            <Ionicons
              name={speakerEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
              size={15}
              color={speakerEnabled ? '#C9B8F5' : 'rgba(244,238,226,0.8)'}
            />
            <Text style={styles.inlineControlText}>
              {speakerEnabled ? t(`${ns}.actions.speakerOn`, 'Altavoz encendido') : t(`${ns}.actions.speakerOff`, 'Altavoz apagado')}
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: any, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#100D0A',
      paddingHorizontal: 18,
      paddingTop: insets.top + 12,
      paddingBottom: insets.bottom + 18,
    },
    contentWrap: {
      marginTop: 14,
    },
    glowTop: {
      position: 'absolute',
      top: -120,
      right: -80,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: 'rgba(147, 112, 219, 0.20)',
    },
    glowBottom: {
      position: 'absolute',
      bottom: -130,
      left: -100,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: 'rgba(217, 119, 6, 0.12)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 18,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F5EFE3',
      marginRight: 10,
    },
    backIcon: {
      width: 30,
      height: 30,
    },
    headerTexts: {
      flex: 1,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: '#F4EEE2',
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: 'rgba(244, 238, 226, 0.60)',
    },
    mainCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(201, 163, 90, 0.30)',
      padding: 16,
      backgroundColor: 'rgba(24, 20, 13, 0.88)',
      marginBottom: 14,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    caseLabel: {
      color: 'rgba(244, 238, 226, 0.55)',
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    statusPill: {
      backgroundColor: 'rgba(147, 112, 219, 0.16)',
      borderColor: 'rgba(167, 139, 250, 0.55)',
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusPillText: {
      color: '#D8C9FF',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    caseValue: {
      fontSize: 14,
      color: '#FFFFFF',
      fontWeight: '700',
      marginBottom: 12,
    },
    metaLine: {
      fontSize: 13,
      color: 'rgba(244, 238, 226, 0.70)',
      marginBottom: 6,
    },
    actionsCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(167, 139, 250, 0.16)',
      backgroundColor: 'rgba(16, 13, 9, 0.9)',
      padding: 14,
      gap: 10,
    },
    primaryButton: {
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#C9A35A',
    },
    acceptButton: {
      backgroundColor: '#22C55E',
    },
    dangerButton: {
      backgroundColor: '#E5484D',
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    primaryButtonText: {
      color: '#1A130B',
      fontSize: 15,
      fontWeight: '700',
    },
    primaryButtonTextLight: {
      color: '#FFFFFF',
    },
    secondaryButton: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(167, 139, 250, 0.42)',
      backgroundColor: 'rgba(147, 112, 219, 0.10)',
    },
    secondaryButtonText: {
      color: '#D8C9FF',
      fontWeight: '600',
      fontSize: 14,
    },
    connectedButton: {
      borderColor: '#22C55E',
      backgroundColor: '#22C55E',
    },
    connectedButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    ghostButton: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(239, 83, 80, 0.45)',
      backgroundColor: 'rgba(239, 83, 80, 0.08)',
    },
    ghostButtonText: {
      color: '#F28B82',
      fontWeight: '600',
      fontSize: 14,
    },
    inlineControlsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 2,
    },
    inlineControlButton: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      backgroundColor: 'rgba(255,255,255,0.05)',
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineControlButtonActive: {
      borderColor: 'rgba(167, 139, 250, 0.55)',
      backgroundColor: 'rgba(147, 112, 219, 0.15)',
    },
    inlineControlText: {
      color: 'rgba(244, 238, 226, 0.85)',
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    disabledButton: {
      opacity: 0.55,
    },
    errorText: {
      marginTop: 10,
      color: '#F28B82',
      fontSize: 13,
    },
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
