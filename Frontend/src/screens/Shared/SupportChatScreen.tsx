import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ChatBubble from '../../components/ChatBubble';
import { useChat } from '../../hooks/useChat';
import { useCalls } from '../../hooks/useCalls';
import { useLivekitConnection } from '../../hooks/useLivekitConnection';
import { getFirebaseFunctions } from '../../config/firebase';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';

interface SupportChatScreenRouteParams {
  rideId?: string | null;
  initialCategory?: 'service' | 'driver' | 'payment' | 'app' | 'other';
  initialTitle?: string | null;
  complaintId?: string | null;
}

interface SupportChatScreenProps {
  route?: { params?: SupportChatScreenRouteParams };
}

const CATEGORY_IDS: SupportChatScreenRouteParams['initialCategory'][] = [
  'service',
  'driver',
  'payment',
  'app',
  'other',
];

const PRIORITY_IDS: Array<'low' | 'normal' | 'high' | 'urgent'> = ['low', 'normal', 'high', 'urgent'];

const backIcon = require('../../assets/icons/back_button/back_button2x.png');

export default function SupportChatScreen({ route }: SupportChatScreenProps) {
  const params = route?.params || {};
  const { rideId, initialCategory, initialTitle, complaintId: initialComplaintId } = params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const ns = 'shared.supportChat';

  const [category, setCategory] = useState<SupportChatScreenRouteParams['initialCategory']>(
    initialCategory || 'service',
  );
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [title, setTitle] = useState<string>(initialTitle || '');
  const [description, setDescription] = useState<string>('');
  const [complaintId, setComplaintId] = useState<string | null>(initialComplaintId || null);
  const [creatingComplaint, setCreatingComplaint] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creatingFunctionsError, setCreatingFunctionsError] = useState<string | null>(null);
  const [requestingCall, setRequestingCall] = useState(false);

  const threadId = complaintId || null;
  const safeUserId = user?.id ?? '';
  const safeUserName =
    (typeof user?.name === 'string' && user.name.trim().length ? user.name.trim() : null) ??
    user?.email ??
    t(`${ns}.fallbackUserName`, 'User');

  const chat = useChat(threadId ?? '', safeUserId, safeUserName);
  const hasActiveChat = Boolean(threadId && safeUserId);

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
    error: livekitError,
  } = useLivekitConnection();

  useEffect(() => {
    if (!livekitInfo) {
      disconnectLivekit();
      return;
    }

    connectLivekit(livekitInfo);
  }, [connectLivekit, disconnectLivekit, livekitInfo?.token]);

  useEffect(() => {
    return () => {
      disconnectLivekit();
    };
  }, [complaintId, disconnectLivekit]);

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const categoryOptions = useMemo(
    () =>
      CATEGORY_IDS.map((id) => ({
        id,
        label: t(`${ns}.categories.${id}`),
      })),
    [t],
  );

  const priorityOptions = useMemo(
    () =>
      PRIORITY_IDS.map((id) => ({
        id,
        label: t(`${ns}.priorities.${id}`),
      })),
    [t],
  );

  useEffect(() => {
    if (!hasActiveChat || !chat.messages.length) return;
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 120);
  }, [hasActiveChat, chat.messages.length]);

  const handleCreateComplaint = async () => {
    if (!user || creatingComplaint) return;

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setCreationError(t(`${ns}.errors.missingTitle`));
      return;
    }

    setCreatingComplaint(true);
    setCreationError(null);
    setCreatingFunctionsError(null);

    try {
      const createdByRole = (user as any).role === 'driver' ? 'driver' : 'client';

      const functions = await getFirebaseFunctions();
      if (!functions) {
        setCreatingFunctionsError(t(`${ns}.errors.initializeService`));
        return;
      }

      const createSupportComplaint = httpsCallable(functions, 'createSupportComplaint');

      const response = await createSupportComplaint({
        rideId: rideId || null,
        category: category || 'service',
        priority,
        title: trimmedTitle,
        description: trimmedDescription || null,
        userRole: createdByRole,
      });

      const data = response?.data as { id?: string } | null;

      if (!data || !data.id) {
        console.error('Respuesta inválida de createSupportComplaint:', response?.data);
        setCreationError(t(`${ns}.errors.invalidResponse`));
        return;
      }

      setComplaintId(data.id);
    } catch (err: any) {
      console.error('Error inesperado creando queja vía Firebase Function:', err);
      setCreationError(t(`${ns}.errors.genericCreate`));
    } finally {
      setCreatingComplaint(false);
    }
  };

  const renderCallBanner = () => {
    if (!activeCall) return null;
    const isRinging = activeCall.status === 'ringing_client';
    const isAccepted = activeCall.status === 'accepted' || activeCall.status === 'connected';
    const isInCall = isAccepted || livekitConnected;
    return (
      <View style={[styles.callCard, isRinging ? styles.callCardRinging : styles.callCardNeutral]}>
        <View style={styles.callHeaderRow}>
          <Text style={styles.callTitle}>{t(`${ns}.call.title`, 'Llamada de soporte')}</Text>
          <View style={[styles.callStatusPill, isRinging ? styles.callStatusPillRinging : styles.callStatusPillNeutral]}>
            <Text style={styles.callStatusText}>{(activeCall.status || 'pendiente').replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>
        {isRinging && (
          <Text style={styles.callRingingText}>{t(`${ns}.call.ringing`, 'Te están llamando, acepta para conectar con el operador.')}</Text>
        )}
        {callError ? <Text style={styles.errorText}>{callError}</Text> : null}
        <Text style={styles.callDetail}>{t(`${ns}.call.caseLabel`, 'Caso')}: {activeCall.complaintId || 'N/D'}</Text>
        <Text style={styles.callDetail}>{t(`${ns}.call.operatorLabel`, 'Operador')}: {activeCall.operatorUid || 'N/D'}</Text>
        <View style={styles.callActionsRow}>
          {isRinging && (
            <TouchableOpacity
              style={[styles.callPrimaryButton, callLoading && styles.primaryButtonDisabled]}
              disabled={callLoading}
              onPress={() => acceptCall(activeCall.callId)}
            >
              <Text style={styles.callPrimaryText}>{callLoading ? t(`${ns}.call.info.stateConnecting`, 'Conectando...') : t(`${ns}.call.actions.accept`, 'Aceptar')}</Text>
            </TouchableOpacity>
          )}
          {isRinging && (
            <TouchableOpacity
              style={[styles.callSecondaryButton, callLoading && styles.primaryButtonDisabled]}
              disabled={callLoading}
              onPress={() => rejectCall(activeCall.callId)}
            >
              <Text style={styles.callSecondaryText}>{t(`${ns}.call.actions.reject`, 'Rechazar')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {isAccepted && livekitInfo && (
          <View style={styles.callInfoBox}>
            <Text style={styles.callInfoText}>{t(`${ns}.call.info.room`, 'Sala')}: {livekitInfo.room}</Text>
            <Text style={styles.callInfoText}>
              {t(`${ns}.call.info.state`, 'Estado')}: {livekitConnecting
                ? t(`${ns}.call.info.stateConnecting`, 'Conectando...')
                : livekitConnected
                  ? t(`${ns}.call.info.stateConnected`, 'Conectado')
                  : t(`${ns}.call.info.stateDisconnected`, 'Desconectado')}
            </Text>
            {livekitError ? <Text style={styles.errorText}>{livekitError}</Text> : null}
            <Text style={styles.callInfoHint}>{t(`${ns}.call.info.tokenReceived`, 'Token obtenido y conexión LiveKit iniciada en cliente.')}</Text>
          </View>
        )}
        {isInCall && (
          <TouchableOpacity
            style={[styles.callSecondaryButton, callLoading && styles.primaryButtonDisabled]}
            disabled={callLoading}
            onPress={() => {
              endCall(activeCall.callId);
              disconnectLivekit();
            }}
          >
            <Text style={styles.callSecondaryText}>{t(`${ns}.call.actions.hangup`, 'Colgar')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const handleSendMessage = () => {
    if (!hasActiveChat || !inputText.trim()) return;
    chat.sendMessage(inputText.trim());
    setInputText('');
  };

  const renderHeader = () => (
    <View>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Image source={backIcon} style={styles.backIcon} resizeMode="contain" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t(`${ns}.title`)}</Text>
          <Text style={styles.subtitle}>{t(`${ns}.subtitle`)}</Text>
        </View>
      </View>

      {rideId ? (
        <View style={styles.rideTag}>
          <Text style={styles.rideTagLabel}>{t(`${ns}.rideTagLabel`)}</Text>
          <Text style={styles.rideTagValue}>{rideId}</Text>
        </View>
      ) : null}

      {!complaintId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t(`${ns}.categories.title`)}</Text>
          <View style={styles.chipsRow}>
            {categoryOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.chip,
                  category === item.id && styles.chipSelected,
                ]}
                onPress={() => setCategory(item.id)}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    category === item.id && styles.chipLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t(`${ns}.priorities.title`)}</Text>
          <View style={styles.chipsRow}>
            {priorityOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.chipSmall,
                  priority === item.id && styles.chipSelected,
                ]}
                onPress={() => setPriority(item.id)}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    priority === item.id && styles.chipLabelSelected,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t(`${ns}.form.problemTitleLabel`)}</Text>
            <TextInput
              style={styles.textInput}
              placeholder={t(`${ns}.form.problemTitlePlaceholder`)}
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t(`${ns}.form.descriptionLabel`)}</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              multiline
              numberOfLines={4}
              placeholder={t(`${ns}.form.descriptionPlaceholder`)}
              placeholderTextColor={colors.textSecondary}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {creationError ? <Text style={styles.errorText}>{creationError}</Text> : null}
          {creatingFunctionsError ? (
            <Text style={styles.errorText}>{creatingFunctionsError}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, creatingComplaint && styles.primaryButtonDisabled]}
            disabled={creatingComplaint}
            onPress={handleCreateComplaint}
          >
            {creatingComplaint ? (
              <View style={styles.buttonContentRow}>
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>{t(`${ns}.actions.creatingCase`)}</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>{t(`${ns}.actions.createCase`)}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {complaintId ? (
        <View style={styles.caseHeader}>
          <Text style={styles.caseIdLabel}>{t(`${ns}.caseHeader.createdLabel`)}</Text>
          <Text style={styles.caseIdValue}>{complaintId}</Text>
          <Text style={styles.caseHint}>
            {t(`${ns}.caseHeader.hint`)}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderMessages = () => {
    if (!hasActiveChat || !complaintId) {
      return null;
    }

    if (!chat.messages.length) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>{t(`${ns}.emptyState.text`)}</Text>
        </View>
      );
    }

    return (
      <FlatList
        ref={flatListRef}
        data={chat.messages}
        renderItem={({ item }) => <ChatBubble message={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />
    );
  };

  const renderChatInput = () => {
    if (!hasActiveChat || !complaintId) return null;

    const disabled = !inputText.trim();

    return (
      <View style={styles.chatInputContainer}>
        <TextInput
          style={styles.chatInput}
          placeholder={t(`${ns}.chatInput.placeholder`)}
          placeholderTextColor={colors.textSecondary}
          multiline
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity
          style={[styles.sendButton, disabled && styles.sendButtonDisabled]}
          disabled={disabled}
          onPress={handleSendMessage}
        >
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const handleCallButton = async () => {
    if (!complaintId || requestingCall || callLoading) return;

    if (activeCall && activeCall.status === 'ringing_client') {
      acceptCall(activeCall.callId);
      return;
    }

    if (activeCall && (activeCall.status === 'accepted' || activeCall.status === 'connected' || livekitConnected)) {
      endCall(activeCall.callId);
      disconnectLivekit();
      return;
    }

    try {
      setRequestingCall(true);
      const functions = await getFirebaseFunctions();
      if (!functions) {
        throw new Error(t(`${ns}.errors.initializeService`));
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

      const requestMessage = t(`${ns}.call.requestMessage`, 'El cliente solicito una llamada de soporte.');
      chat.sendMessage(requestMessage);
      Alert.alert(
        t(`${ns}.call.requestTitle`, 'Llamada solicitada'),
        t(`${ns}.call.requestBody`, 'Notificamos a soporte para que te llame. Recibiras una alerta cuando inicien la llamada.'),
      );
    } catch (error: any) {
      Alert.alert(
        t(`${ns}.errors.title`, 'Error'),
        error?.message || t(`${ns}.call.requestError`, 'No se pudo solicitar la llamada en este momento.'),
      );
    } finally {
      setRequestingCall(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.content}>
        <FlatList
          data={[]}
          ListHeaderComponent={
            <>
              {renderCallBanner()}
              {renderHeader()}
            </>
          }
          ListFooterComponent={renderMessages}
          renderItem={null as any}
          keyExtractor={(_, index) => `header-${index}`}
          contentContainerStyle={styles.scrollContent}
        />
        <View style={styles.fabContainer}>
          <TouchableOpacity style={[styles.fab, (requestingCall || callLoading) && styles.primaryButtonDisabled]} onPress={handleCallButton} disabled={requestingCall || callLoading}>
            <Text style={styles.fabText}>📞</Text>
          </TouchableOpacity>
        </View> 
      </View>

      {renderChatInput()}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backIcon: {
      width: 34,
      height: 34,
    },
    headerText: {
      flex: 1,
    },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
      marginTop: 16,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    section: {
      marginTop: 16,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -4,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    chipSmall: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    chipSelected: {
      backgroundColor: '#000',
      borderColor: '#000',
    },
    chipLabel: {
      fontSize: 13,
      color: colors.text,
    },
    chipLabelSelected: {
      color: '#fff',
      fontWeight: '600',
    },
    inputGroup: {
      marginTop: 16,
    },
    inputLabel: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 6,
      fontWeight: '500',
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      backgroundColor: colors.card,
      color: colors.text,
    },
    textArea: {
      minHeight: 90,
      textAlignVertical: 'top',
    },
    primaryButton: {
      marginTop: 20,
      borderRadius: 24,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 15,
    },
    buttonContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      marginTop: 8,
      color: '#d32f2f',
      fontSize: 13,
    },
    rideTag: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    rideTagLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    rideTagValue: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '500',
    },
    caseHeader: {
      marginTop: 20,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    caseIdLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    caseIdValue: {
      fontSize: 13,
      color: colors.text,
      fontWeight: '600',
      marginBottom: 6,
    },
    caseHint: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    messagesList: {
      paddingVertical: 16,
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    chatInputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: 10,
    },
    chatInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      maxHeight: 100,
      marginRight: 8,
      color: colors.text,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: colors.border,
    },
    sendButtonText: {
      fontSize: 20,
      color: '#fff',
    },
    callCard: {
      borderRadius: 12,
      padding: 12,
      //marginBottom: 12,
      marginTop: 30,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
    },
    callCardRinging: {
      borderColor: '#f97316',
      backgroundColor: '#fff7ed',
    },
    callCardNeutral: {
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    callHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    callTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    callStatus: {
      fontSize: 12,
      color: '#f97316',
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    callStatusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
    },
    callStatusPillRinging: {
      backgroundColor: '#fff1e6',
      borderColor: '#f97316',
    },
    callStatusPillNeutral: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    callStatusText: {
      fontSize: 11,
      color: '#d97706',
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    callRingingText: {
      fontSize: 13,
      color: '#b45309',
      marginBottom: 6,
    },
    callDetail: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    callActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    callPrimaryButton: {
      flex: 1,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: '#111',
    },
    callPrimaryText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 15,
    },
    callSecondaryButton: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.card,
    },
    callSecondaryText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 15,
    },
    callInfoBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    callInfoText: {
      fontSize: 13,
      color: colors.text,
      marginBottom: 4,
    },
    callInfoHint: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    fabContainer: {
      position: 'absolute',
      right: 16,
      bottom: 90,
    },
    fab: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
    },
    fabText: {
      color: '#fff',
      fontSize: 22,
    },
  });
