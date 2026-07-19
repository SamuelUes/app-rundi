import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatNicaraguaTime } from '../../utils/dateUtils';

interface ChatBubbleProps {
  message: { 
    message: string; 
    timestamp: string; 
    isDriver?: boolean;
    isOwn?: boolean; // Mensaje propio o del otro usuario
    senderName?: string;
  };
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const formatTime = (timestamp: string) => {
    return formatNicaraguaTime(timestamp);
  };

  const isOwn = message.isOwn !== undefined ? message.isOwn : message.isDriver;
  
  // Fallback para mensajes antiguos que no tienen el campo 'message'
  const messageText = message.message || '[Mensaje sin contenido]';
  
  // Si el mensaje está vacío, no mostrarlo
  if (!messageText || messageText.trim() === '') {
    return null;
  }

  return (
    <View style={[styles.container, isOwn ? styles.ownMessage : styles.otherMessage]}>
      {!isOwn && message.senderName && (
        <Text style={styles.senderName}>
          {message.senderName}
        </Text>
      )}
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
          {messageText}
        </Text>
        <Text style={[styles.timestamp, isOwn ? styles.ownTimestamp : styles.otherTimestamp]}>
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 16,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginLeft: 12,
  },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  ownBubble: {
    backgroundColor: '#000',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#f0f0f0',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownText: {
    color: '#fff',
  },
  otherText: {
    color: '#000',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
  },
  ownTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  otherTimestamp: {
    color: '#999',
  },
});
