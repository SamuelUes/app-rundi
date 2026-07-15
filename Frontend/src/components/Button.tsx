import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, GestureResponderEvent, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from './LoadingIcon';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  iconName?: React.ComponentProps<typeof MaterialIcons>['name'];
}

export default function Button({ title, onPress, disabled, loading, style, iconName }: Props) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity 
      style={[styles.button, style, (disabled || loading) && styles.disabled]} 
      onPress={onPress} 
      disabled={disabled || loading}
    >
      {loading ? (
        <LoadingIcon icon="refresh" size={20} color="#FFFFFF" animation="spin" />
      ) : (
        <View style={styles.contentRow}>
          {iconName && <MaterialIcons name={iconName} size={20} color="#FFFFFF" style={styles.icon} />}
          <Text style={styles.text}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  disabled: { opacity: 0.6 },
});
