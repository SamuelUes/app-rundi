import React from 'react';
import { TouchableOpacity, Text, StyleSheet, GestureResponderEvent, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export default function Button({ title, onPress, disabled, loading, style }: Props) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity 
      style={[styles.button, style, (disabled || loading) && styles.disabled]} 
      onPress={onPress} 
      disabled={disabled || loading}
    >
      <Text style={styles.text}>
        {loading ? t('common.components.button.loading') : title}
      </Text>
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
  text: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  disabled: { opacity: 0.6 },
});
