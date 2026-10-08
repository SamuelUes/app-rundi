import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { useTheme } from '../../hooks/shared/theme/useTheme';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

const createStyles = (colors: any) =>
  StyleSheet.create({
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
      color: colors.textSecondary,
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
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    otherBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.text,
    },
    timestamp: {
      fontSize: 10,
      marginTop: 4,
    },
    ownTimestamp: {
      color: 'rgba(255, 255, 255, 0.75)',
      textAlign: 'right',
    },
    otherTimestamp: {
      color: colors.textTertiary,
    },
  });
