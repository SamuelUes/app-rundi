import React, { useRef, useState } from 'react';
import { Animated, View, Text, TextInput, TouchableOpacity } from 'react-native';
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
  const [focused, setFocused] = useState(false);
  const sendScale = useRef(new Animated.Value(1)).current;

  if (!hasActiveChat || !complaintId) return null;

  const disabled = !inputText.trim();

  const animateSend = (toValue: number) => {
    Animated.spring(sendScale, {
      toValue,
      useNativeDriver: true,
      speed: 60,
      bounciness: 8,
    }).start();
  };

  return (
    <View style={styles.chatInputContainer}>
      <View style={[styles.chatInputPill, focused && styles.chatInputPillFocused]}>
        <TextInput
          style={styles.chatInput}
          placeholder={t(`${ns}.chatInput.placeholder`)}
          placeholderTextColor={colors.textSecondary}
          multiline
          value={inputText}
          onChangeText={onInputChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          cursorColor={colors.primary}
          selectionColor={colors.primary}
        />
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[styles.sendButton, disabled && styles.sendButtonDisabled]}
            disabled={disabled}
            onPress={onSend}
            onPressIn={() => animateSend(0.82)}
            onPressOut={() => animateSend(1)}
            accessibilityRole="button"
            accessibilityLabel={t(`${ns}.chatInput.send`, 'Enviar mensaje')}
          >
            <MaterialIcons
              name="send"
              size={17}
              color={disabled ? colors.textSecondary : '#241A05'}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}
