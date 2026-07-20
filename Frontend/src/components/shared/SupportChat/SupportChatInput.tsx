import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface SupportChatInputProps {
  hasActiveChat: boolean;
  complaintId: string | null;
  inputText: string;
  colors: any;
  onInputChange: (v: string) => void;
  onSend: () => void;
  t: TFunction;
  ns: string;
  styles: any;
}

export function SupportChatInput({
  hasActiveChat,
  complaintId,
  inputText,
  colors,
  onInputChange,
  onSend,
  t,
  ns,
  styles,
}: SupportChatInputProps) {
  if (!hasActiveChat || !complaintId) return null;

  const disabled = !inputText.trim();

  return (
    <View style={styles.chatInputContainer}>
      <TextInput
        style={styles.chatInput}
        placeholder={t(`${ns}.chatInput.placeholder`)}
        placeholderTextColor={colors.textSecondary}
        multiline
        value={inputText}
        onChangeText={onInputChange}
      />
      <TouchableOpacity
        style={[styles.sendButton, disabled && styles.sendButtonDisabled]}
        disabled={disabled}
        onPress={onSend}
      >
        <MaterialIcons name="send" size={24} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}
