import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TextInputInstance,
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
  const hiddenInputRef = useRef<TextInputInstance>(null);
  const [isFocused, setIsFocused] = useState(false);

  const safeValue = value.replace(/[^0-9]/g, '').slice(0, length);

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }
    // Dentro de un Modal en Android el primer focus puede caer antes de que la
    // ventana del diálogo sea focusable — se reintenta una segunda vez.
    const first = setTimeout(() => hiddenInputRef.current?.focus(), 250);
    const retry = setTimeout(() => hiddenInputRef.current?.focus(), 750);
    return () => {
      clearTimeout(first);
      clearTimeout(retry);
    };
  }, [autoFocus, disabled]);

  return (
    <View style={styles.wrap}>
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

      {/*
        El input real cubre las cajas (casi invisible): el toque lo recibe el
        propio TextInput → foco nativo → teclado garantizado también en
        Android/Modal. opacity 0.01 porque un input totalmente invisible no
        abre el teclado en algunos Android.

        SIN prop autoFocus: dentro de un Modal en Android, un focus al montar
        llega antes de que la ventana del diálogo sea focusable y el IME queda
        ligado a la ventana de atrás (el teclado no aparece — solo la barra de
        Gboard). Además focus() sobre un input ya enfocado es no-op, así que
        ese focus prematuro anulaba los retries. El foco solo se pide con
        delay, ya dirigido a la ventana del Modal.
      */}
      <TextInput
        ref={hiddenInputRef}
        style={styles.hiddenInput}
        value={safeValue}
        onChangeText={(text) => {
          onChange(text.replace(/[^0-9]/g, '').slice(0, length));
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={length}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        accessibilityLabel={accessibilityLabel}
        editable={!disabled}
        showSoftInputOnFocus
        caretHidden
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
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
      right: 0,
      height: 56,
      opacity: 0.01,
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
