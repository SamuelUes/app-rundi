import React from 'react';
import { View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ChatBubble from '../ChatBubble';
import type { TFunction } from 'i18next';

interface SupportChatMessagesProps {
  hasActiveChat: boolean;
  complaintId: string | null;
  messages: any[];
  colors: any;
  t: TFunction;
  ns: string;
  styles: any;
}

export function SupportChatMessages({
  hasActiveChat,
  complaintId,
  messages,
  colors,
  t,
  ns,
  styles,
}: SupportChatMessagesProps) {
  if (!hasActiveChat || !complaintId) {
    return null;
  }

  if (!messages.length) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrap}>
          <MaterialIcons name="chat-bubble-outline" size={30} color={colors.primary} />
        </View>
        <Text style={styles.emptyText}>{t(`${ns}.emptyState.text`)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.messagesList}>
      {messages.map((item) => <ChatBubble key={item.id} message={item} />)}
    </View>
  );
}
