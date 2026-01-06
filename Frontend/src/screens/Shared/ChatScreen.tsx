import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../hooks/useChat';
import ChatBubble from '../../components/ChatBubble';
import { useTranslation } from 'react-i18next';

export default function ChatScreen({ route }: any) {
  const { rideId, otherUserName, otherUserPhone } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { connected, messages, isTyping, typingUser, sendMessage, sendTypingIndicator } = useChat(
    rideId,
    user!.id,
    user!.name
  );
  const { t } = useTranslation();

  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const quickMessages = useMemo(
    () =>
      ((t('shared.chat.quickMessages', {
        returnObjects: true,
      }) as string[]) ?? []),
    [t]
  );
  const statusLabels = t('shared.chat.status', {
    returnObjects: true,
  }) as Record<string, string>;
  const chatAlerts = t('shared.chat.alerts', {
    returnObjects: true,
  }) as Record<string, string>;
  const emptyMessage = t('shared.chat.empty.message', { name: otherUserName });

  useEffect(() => {
    // Scroll al final cuando lleguen nuevos mensajes
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim()) {
      sendMessage(inputText);
      setInputText('');
    }
  };

  const handleQuickMessage = (message: string) => {
    sendMessage(message);
  };

  const handleTextChange = (text: string) => {
    setInputText(text);

    // Enviar indicador de escritura
    if (text.length > 0) {
      sendTypingIndicator();
      
      // Limpiar timeout anterior
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleCall = () => {
    if (!otherUserPhone) {
      Alert.alert(chatAlerts.noPhoneTitle, chatAlerts.noPhoneMessage);
      return;
    }

    Alert.alert(
      chatAlerts.callTitle,
      t('shared.chat.alerts.callMessage', { name: otherUserName, phone: otherUserPhone }),
      [
        { text: chatAlerts.cancel, style: 'cancel' },
        {
          text: chatAlerts.callButton,
          onPress: async () => {
            try {
              const phoneUrl = `tel:${otherUserPhone}`;
              const canOpen = await Linking.canOpenURL(phoneUrl);
              
              if (canOpen) {
                await Linking.openURL(phoneUrl);
              } else {
                Alert.alert(chatAlerts.deviceErrorTitle, chatAlerts.cannotCallDevice);
              }
            } catch (error) {
              console.error('Error al intentar llamar:', error);
              Alert.alert(chatAlerts.callFailedTitle, chatAlerts.callFailedMessage);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header con estado de conexión y botón de llamada */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View>
            <Text style={styles.headerTitle}>{otherUserName}</Text>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, connected ? styles.statusConnected : styles.statusDisconnected]} />
              <Text style={styles.statusText}>
                {connected ? statusLabels.online : statusLabels.offline}
              </Text>
            </View>
          </View>
          
          {/* Botón de llamada */}
          {otherUserPhone && (
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCall}
            >
              <Text style={styles.callButtonText}>📞</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Lista de mensajes */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={({ item }) => <ChatBubble message={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Indicador de escritura */}
      {isTyping && typingUser && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.typingText}>
            {t('shared.chat.typing', { name: typingUser })}
          </Text>
        </View>
      )}

      {/* Mensajes rápidos */}
      <View style={styles.quickMessagesContainer}>
        <FlatList
          horizontal
          data={quickMessages}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.quickMessageButton}
              onPress={() => handleQuickMessage(item)}
            >
              <Text style={styles.quickMessageText}>{item}</Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickMessagesList}
        />
      </View>

      {/* Input de mensaje */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={t('shared.chat.input.placeholder')}
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={handleTextChange}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#ff4444',
  },
  statusText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  callButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  callButtonText: {
    fontSize: 24,
  },
  messagesList: {
    paddingVertical: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  typingText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
    fontStyle: 'italic',
  },
  quickMessagesContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  quickMessagesList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickMessageButton: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickMessageText: {
    fontSize: 14,
    color: colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
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
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    fontSize: 20,
    color: '#fff',
  },
});
