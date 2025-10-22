/**
 * EmptyRideList - Componente para mostrar cuando no hay viajes disponibles
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface EmptyRideListProps {
  message?: string;
  title?: string;
  description?: string;
  icon?: string;
  colors: any;
}

export default function EmptyRideList({ 
  message, 
  title,
  description,
  icon = 'inbox',
  colors 
}: EmptyRideListProps) {
  const styles = createStyles(colors);
  
  const displayTitle = title || message || 'No hay viajes disponibles en este momento';
  const displayDescription = description || 'Los nuevos viajes aparecerán aquí automáticamente';
  
  // Detectar si el icono es un emoji (contiene caracteres unicode)
  const isEmoji = /\p{Emoji}/u.test(icon);
  
  return (
    <View style={styles.container}>
      {isEmoji ? (
        <Text style={styles.emojiIcon}>{icon}</Text>
      ) : (
        <MaterialIcons name={icon as any} size={64} color={colors.textSecondary} />
      )}
      <Text style={styles.message}>{displayTitle}</Text>
      <Text style={styles.submessage}>
        {displayDescription}
      </Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emojiIcon: {
    fontSize: 64,
    marginBottom: 0,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  submessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
