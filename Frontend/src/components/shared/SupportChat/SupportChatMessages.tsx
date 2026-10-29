import React from 'react';
import { View, Text, FlatList } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ChatBubble from '../ChatBubble';
import type { TFunction } from 'i18next';

interface SupportChatMessagesProps {
  hasActiveChat: boolean;
  complaintId: string | null;
  messages: any[];
  flatListRef: React.RefObject<FlatList<any> | null>;
  colors: any;
  t: TFunction;
  ns: string;
  styles: any;
}

export function SupportChatMessages({
  hasActiveChat,
  complaintId,
  messages,
  flatListRef,
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
    <FlatList
      ref={flatListRef}
      data={messages}
      renderItem={({ item }) => <ChatBubble message={item} />}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.messagesList}
      onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
    />
  );
}
