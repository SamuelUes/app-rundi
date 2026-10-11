import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatNicaraguaTime } from '../../utils/dateUtils';
import { useTheme } from '../../hooks/shared/theme/useTheme';

export type BubbleGroupPosition = 'single' | 'first' | 'middle' | 'last';

interface ChatBubbleProps {
  message: { 
    message: string; 
    timestamp: string; 
    isDriver?: boolean;
    isOwn?: boolean; // Mensaje propio o del otro usuario
    senderName?: string;
  };
  /** Posición dentro de un grupo de mensajes consecutivos del mismo remitente */
  position?: BubbleGroupPosition;
}

export default function ChatBubble({ message, position = 'single' }: ChatBubbleProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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

  const isFirst = position === 'single' || position === 'first';
  const isLast = position === 'single' || position === 'last';

  return (
    <View
      style={[
        styles.container,
        isOwn ? styles.ownMessage : styles.otherMessage,
        isFirst ? styles.groupTop : styles.groupNested,
      ]}
    >
      {!isOwn && isFirst && message.senderName && (
        <Text style={styles.senderName}>
          {message.senderName}
        </Text>
      )}
      <View
        style={[
          styles.bubble,
          isOwn ? styles.ownBubble : styles.otherBubble,
          isOwn && isLast && styles.ownBubbleTail,
          !isOwn && isLast && styles.otherBubbleTail,
        ]}
      >
        <Text style={[styles.messageText, isOwn ? styles.ownText : styles.otherText]}>
          {messageText}
        </Text>
        {isLast && (
          <Text style={[styles.timestamp, isOwn ? styles.ownTimestamp : styles.otherTimestamp]}>
            {formatTime(message.timestamp)}
          </Text>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 16,
    },
    groupTop: {
      marginTop: 10,
    },
    groupNested: {
      marginTop: 2,
    },
    ownMessage: {
      alignItems: 'flex-end',
    },
    otherMessage: {
      alignItems: 'flex-start',
    },
    senderName: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 4,
      marginLeft: 12,
    },
    bubble: {
      maxWidth: '78%',
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
    },
    ownBubble: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
      elevation: 2,
    },
    ownBubbleTail: {
      borderBottomRightRadius: 6,
    },
    otherBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    otherBubbleTail: {
      borderBottomLeftRadius: 6,
    },
    messageText: {
      fontSize: 15.5,
      lineHeight: 21,
    },
    ownText: {
      color: isDark ? '#1F1604' : '#241A05',
    },
    otherText: {
      color: colors.text,
    },
    timestamp: {
      fontSize: 10,
      marginTop: 3,
    },
    ownTimestamp: {
      color: isDark ? 'rgba(31, 22, 4, 0.55)' : 'rgba(36, 26, 5, 0.55)',
      textAlign: 'right',
    },
    otherTimestamp: {
      color: colors.textTertiary,
    },
  });
