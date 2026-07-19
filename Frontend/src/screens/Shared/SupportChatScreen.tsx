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
  Alert,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { httpsCallable } from 'firebase/functions';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import ChatBubble from '../../components/shared/ChatBubble';
import { useChat } from '../../hooks/shared/chat/useChat';
import { useCalls } from '../../hooks/shared/calls/useCalls';
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

  const threadId = complaintId || null;
  const safeUserId = user?.id ?? '';
  const safeUserName =
    (typeof user?.name === 'string' && user.name.trim().length ? user.name.trim() : null) ??
    user?.email ??
    t(`${ns}.fallbackUserName`, 'User');

  const chat = useChat(threadId ?? '', safeUserId, safeUserName);
  const hasActiveChat = Boolean(threadId && safeUserId);
  const { activeCall } = useCalls(complaintId);

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
                <LoadingIcon size={20} color="#fff" style={{ marginRight: 8 }} />
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
      {activeCall && activeCall.status !== 'ended' ? (
        <TouchableOpacity
          style={styles.callBanner}
          onPress={handleCallButton}
        >
          <View style={styles.callBannerDot} />
          <View style={styles.callBannerTexts}>
            <Text style={styles.callBannerTitle}>Llamada en curso</Text>
            <Text style={styles.callBannerSubtitle}>
              Estado: {String(activeCall.status || 'pending').replace('_', ' ')} · Toca para abrir controles
            </Text>
          </View>
          <Text style={styles.callBannerArrow}>→</Text>
        </TouchableOpacity>
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
          <MaterialIcons name="chat" size={48} color={colors.textSecondary} />
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
          <MaterialIcons name="send" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  const handleCallButton = () => {
    if (!complaintId) {
      Alert.alert(
        t(`${ns}.errors.title`, 'Error'),
        t(`${ns}.errors.missingComplaintId`, 'Debes crear o abrir un caso antes de gestionar llamadas.'),
      );
      return;
    }

    navigation.navigate('SupportCall', {
      complaintId,
      rideId: rideId || null,
    });
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
              {renderHeader()}
            </>
          }
          ListFooterComponent={renderMessages}
          renderItem={null as any}
          keyExtractor={(_, index) => `header-${index}`}
          contentContainerStyle={styles.scrollContent}
        />
        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={styles.fab}
            onPress={handleCallButton}
          >
            <MaterialIcons name="call" size={24} color="#fff" />
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
    callBanner: {
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(91, 33, 182, 0.12)',
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    callBannerDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#f59e0b',
      marginRight: 10,
    },
    callBannerTexts: {
      flex: 1,
    },
    callBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    callBannerSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textSecondary,
    },
    callBannerArrow: {
      color: '#d6bcfa',
      fontSize: 18,
      fontWeight: '700',
      marginLeft: 8,
    },
  });
