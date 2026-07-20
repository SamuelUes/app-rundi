import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const ns = 'shared.supportCall';

  const [requestingCall, setRequestingCall] = useState(false);

  const {
    activeCall,
    livekitInfo,
    loading: callLoading,
    error: callError,
    acceptCall,
    rejectCall,
    endCall,
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
          style={[styles.primaryButton, (callLoading || requestingCall) && styles.disabledButton]}
          disabled={callLoading || requestingCall}
          onPress={handleCallAction}
        >
          {(callLoading || requestingCall) ? (
            <LoadingIcon size={24} color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>{callActionLabel}</Text>
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
            onPress={() => rejectCall(activeCall.callId)}
          >
            <Text style={styles.ghostButtonText}>{t(`${ns}.actions.reject`, 'Rechazar')}</Text>
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
          >
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
          >
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

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#09080F',
      paddingHorizontal: 18,
      paddingTop: Platform.OS === 'ios' ? 72 : 34,
      paddingBottom: 18,
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
      backgroundColor: 'rgba(168, 85, 247, 0.24)',
    },
    glowBottom: {
      position: 'absolute',
      bottom: -130,
      left: -100,
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: 'rgba(217, 119, 6, 0.18)',
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
      backgroundColor: '#FFFFFF',
      marginRight: 10,
    },
    backIcon: {
      width: 34,
      height: 34,
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
      color: '#B8ADC8',
    },
    mainCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(168, 85, 247, 0.35)',
      padding: 16,
      backgroundColor: 'rgba(18, 15, 28, 0.88)',
      marginBottom: 14,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    caseLabel: {
      color: '#C8BCD6',
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    statusPill: {
      backgroundColor: 'rgba(217, 119, 6, 0.18)',
      borderColor: 'rgba(217, 119, 6, 0.65)',
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusPillText: {
      color: '#F5D08A',
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
      color: '#D7CCE5',
      marginBottom: 6,
    },
    actionsCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      backgroundColor: 'rgba(10, 10, 16, 0.88)',
      padding: 14,
      gap: 10,
    },
    primaryButton: {
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#D97706',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    secondaryButton: {
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(168, 85, 247, 0.45)',
      backgroundColor: 'rgba(56, 25, 87, 0.38)',
    },
    secondaryButtonText: {
      color: '#EADBF9',
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
      borderColor: 'rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    ghostButtonText: {
      color: colors.text,
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
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      backgroundColor: 'rgba(255,255,255,0.04)',
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineControlButtonActive: {
      borderColor: 'rgba(217, 119, 6, 0.75)',
      backgroundColor: 'rgba(217, 119, 6, 0.16)',
    },
    inlineControlText: {
      color: '#EDE2F8',
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    disabledButton: {
      opacity: 0.6,
    },
    errorText: {
      marginTop: 10,
      color: '#FCA5A5',
      fontSize: 13,
    },
    emptyContainer: {
      flex: 1,
      backgroundColor: '#09080F',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: '#F3E8FF',
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: '#B8ADC8',
      textAlign: 'center',
      marginBottom: 20,
    },
    backPill: {
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: 'rgba(168, 85, 247, 0.35)',
      borderWidth: 1,
      borderColor: 'rgba(168, 85, 247, 0.65)',
    },
    backPillText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });
