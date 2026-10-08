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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { httpsCallable } from 'firebase/functions';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import ChatBubble from '../../components/shared/ChatBubble';
import { useChat } from '../../hooks/shared/chat/useChat';
import { useCalls } from '../../hooks/shared/calls/useCalls';
import { getFirebaseFunctions } from '../../config/firebase';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { SupportChatHeader } from '../../components/shared/SupportChat/SupportChatHeader';
import { SupportChatMessages } from '../../components/shared/SupportChat/SupportChatMessages';
import { SupportChatInput } from '../../components/shared/SupportChat/SupportChatInput';

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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, isDark, insets]);
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
      keyboardVerticalOffset={0}
    >
      <View style={styles.content}>
        <View style={styles.headerCard}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerCircleButton}
            accessibilityRole="button"
            accessibilityLabel={t('shared.paymentMethods.header.goBack')}
          >
            <Image source={backIcon} style={styles.headerCircleIcon} resizeMode="contain" />
          </TouchableOpacity>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>{t(`${ns}.title`)}</Text>
            <Text style={styles.headerSubtitle}>{t(`${ns}.subtitle`)}</Text>
          </View>
          <TouchableOpacity
            onPress={handleCallButton}
            style={styles.headerCircleButton}
            accessibilityRole="button"
            accessibilityLabel={t(`${ns}.actions.call`, 'Llamar')}
          >
            <MaterialIcons name="call" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={[]}
          ListHeaderComponent={
            <SupportChatHeader
              rideId={rideId}
              complaintId={complaintId}
              category={category}
              priority={priority}
              title={title}
              description={description}
              creatingComplaint={creatingComplaint}
              creationError={creationError}
              creatingFunctionsError={creatingFunctionsError}
              categoryOptions={categoryOptions}
              priorityOptions={priorityOptions}
              activeCall={activeCall}
              colors={colors}
              onBack={() => navigation.goBack()}
              onSetCategory={setCategory}
              onSetPriority={setPriority}
              onSetTitle={setTitle}
              onSetDescription={setDescription}
              onCreateComplaint={handleCreateComplaint}
              onCallButton={handleCallButton}
              t={t}
              ns={ns}
              styles={styles}
            />
          }
          ListFooterComponent={
            <SupportChatMessages
              hasActiveChat={hasActiveChat}
              complaintId={complaintId}
              messages={chat.messages}
              flatListRef={flatListRef}
              colors={colors}
              t={t}
              ns={ns}
              styles={styles}
            />
          }
          renderItem={null as any}
          keyExtractor={(_, index) => `header-${index}`}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      <SupportChatInput
        hasActiveChat={hasActiveChat}
        complaintId={complaintId}
        inputText={inputText}
        colors={colors}
        onInputChange={setInputText}
        onSend={handleSendMessage}
        t={t}
        ns={ns}
        styles={styles}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any, isDark: boolean, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      flex: 1,
    },
    headerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: insets.top + 8,
      marginHorizontal: 16,
      marginBottom: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: 'rgba(211, 153, 46, 0.94)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.24)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 8,
    },
    headerCircleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.26)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCircleIcon: {
      width: 22,
      height: 22,
    },
    headerTextCol: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    headerSubtitle: {
      fontSize: 12.5,
      color: 'rgba(255, 255, 255, 0.85)',
      marginTop: 1,
    },
    scrollContent: {
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 24,
    },
    section: {
      marginTop: 12,
      marginBottom: 8,
    },
    formCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      paddingVertical: 14,
      paddingBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 12,
      elevation: 4,
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
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    chipSmall: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
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
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
      backgroundColor: colors.card,
      color: colors.text,
    },
    textArea: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    primaryButton: {
      marginTop: 20,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
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
      color: colors.error,
      fontSize: 13,
    },
    rideTag: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 4,
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    rideTagIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(201, 163, 90, 0.22)' : 'rgba(179, 135, 55, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rideTagTexts: {
      flex: 1,
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
      marginTop: 12,
      padding: 12,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
    },
    caseIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: isDark ? 'rgba(201, 163, 90, 0.22)' : 'rgba(179, 135, 55, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    caseTexts: {
      flex: 1,
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
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    chatInputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingTop: 10,
      paddingHorizontal: 12,
      paddingBottom: insets.bottom + 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.25 : 0.06,
      shadowRadius: 12,
      elevation: 10,
    },
    chatInputPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 5,
      minHeight: 48,
    },
    chatInputPillFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 8,
      elevation: 3,
    },
    chatInput: {
      flex: 1,
      fontSize: 15,
      paddingTop: 9,
      paddingBottom: 9,
      paddingRight: 8,
      maxHeight: 110,
      color: colors.text,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
    callBanner: {
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(179, 135, 55, 0.45)',
      backgroundColor: 'rgba(179, 135, 55, 0.10)',
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    callBannerDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
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
  });
