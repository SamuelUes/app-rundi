import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';

import { useTheme } from '../../hooks/shared/theme/useTheme';

export type OtpCodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
};

const OtpCodeInput: React.FC<OtpCodeInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled,
  autoFocus,
  accessibilityLabel,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hiddenInputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  const safeValue = value.replace(/[^0-9]/g, '').slice(0, length);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }
    const timeout = setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timeout);
  }, [autoFocus, disabled]);

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={hiddenInputRef}
        style={styles.hiddenInput}
        value={safeValue}
        onChangeText={(text) => {
          onChange(text.replace(/[^0-9]/g, '').slice(0, length));
        }}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        accessibilityLabel={accessibilityLabel}
        editable={!disabled}
        autoFocus={autoFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />

      <TouchableWithoutFeedback
        onPress={() => !disabled && hiddenInputRef.current?.focus()}
      >
        <View style={styles.boxes}>
          {Array.from({ length }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.box,
                isFocused && safeValue.length === index && styles.boxActive,
                safeValue.length > index && styles.boxFilled,
              ]}
            >
              <Text style={styles.boxText}>{safeValue[index] || ''}</Text>
            </View>
          ))}
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
};

export default OtpCodeInput;

const createStyles = (colors: any) =>
  StyleSheet.create({
    wrap: {
      width: '100%',
      position: 'relative',
    },
    hiddenInput: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: 56,
      opacity: 0,
    },
    boxes: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    box: {
      flex: 1,
      maxWidth: 56,
      height: 56,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    boxActive: {
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    boxFilled: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '25',
    },
    boxText: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
  });
