import React from 'react';
import { View, Text } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface PreflightErrorDisplayProps {
  error: string;
  styles: any;
}

export function PreflightErrorDisplay({ error, styles }: PreflightErrorDisplayProps) {
  return (
    <View style={styles.errorContainer}>
      <MaterialIcons name="warning" size={48} color="#FF9800" />
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}
