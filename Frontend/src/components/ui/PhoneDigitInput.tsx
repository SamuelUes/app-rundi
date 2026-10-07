import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  LayoutChangeEvent,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { CountryDialOption, getCountryLocalNumberLength } from '../../utils/phoneUtils';

export type PhoneDigitInputProps = {
  countryOptions?: CountryDialOption[];
  selectedCountry: CountryDialOption;
  onCountryChange?: (countryCode: string) => void;
  digits: string;
  onChangeDigits: (digits: string) => void;
  disabled?: boolean;
  maxDigitsOverride?: number;
};

const PhoneDigitInput: React.FC<PhoneDigitInputProps> = ({
  countryOptions,
  selectedCountry,
  onCountryChange,
  digits,
  onChangeDigits,
  disabled,
  maxDigitsOverride,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hiddenInputRef = useRef<TextInput>(null);
  const [boxSize, setBoxSize] = useState(18);
  const [isFocused, setIsFocused] = useState(false);
  const blinkAnim = useRef(new Animated.Value(0)).current;
  const blinkLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const maxDigits = maxDigitsOverride ?? getCountryLocalNumberLength(selectedCountry);
  const safeDigits = digits.slice(0, maxDigits);

  const handleChangeText = (text: string) => {
    if (disabled) return;

    const numeric = text.replace(/[^0-9]/g, '').slice(0, maxDigits);
    onChangeDigits(numeric);
  };

  const handlePressBoxes = () => {
    if (!disabled) {
      hiddenInputRef.current?.focus();
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleBoxesLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (!width || maxDigits <= 0) {
      return;
    }

    const horizontalMargin = 1; // debe coincidir con styles.digitBox marginHorizontal
    const maxBox = 48;
    const minBox = 14;

    const available = width - maxDigits * horizontalMargin * 2;
    const perDigit = available / maxDigits;

    // Tamaño objetivo según cantidad de casillas:
    // menos dígitos → más grande, más dígitos → más pequeño
    let sizeHint = 30;
    if (maxDigits <= 6) {
      sizeHint = 50;
    } else if (maxDigits <= 8) {
      sizeHint = 40;
    } else if (maxDigits <= 10) {
      sizeHint = 26;
    } else {
      sizeHint = 22;
    }

    const targetSize = Math.min(sizeHint, perDigit);
    const nextSize = Math.max(minBox, Math.min(maxBox, targetSize));

    if (Number.isFinite(nextSize) && nextSize > 0 && Math.abs(nextSize - boxSize) > 0.5) {
      setBoxSize(nextSize);
    }
  };

  const hasSelector = !!countryOptions && countryOptions.length > 0 && !!onCountryChange;
  const flagEmoji = getFlagEmoji(selectedCountry.code);

  // Animación de destello en la primera casilla cuando está enfocado y sin dígitos
  useEffect(() => {
    const shouldBlink = isFocused && safeDigits.length === 0 && !disabled;

    if (shouldBlink) {
      if (!blinkLoopRef.current) {
        blinkAnim.setValue(0);
        blinkLoopRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(blinkAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(blinkAnim, {
              toValue: 0,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        );
        blinkLoopRef.current.start();
      }
    } else {
      if (blinkLoopRef.current) {
        blinkLoopRef.current.stop();
        blinkLoopRef.current = null;
      }
      blinkAnim.setValue(0);
    }

    return () => {
      if (blinkLoopRef.current) {
        blinkLoopRef.current.stop();
        blinkLoopRef.current = null;
      }
    };
  }, [isFocused, safeDigits.length, disabled, blinkAnim]);

  const blinkOpacity = blinkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1],
  });

  return (
    <View style={styles.container}>
      <View style={styles.countryContainer}>
        <View style={styles.countryContent} pointerEvents="none">
          <Text style={styles.flag}>{flagEmoji}</Text>
          <Text style={styles.dialCodeText}>{selectedCountry.dialCode}</Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color={colors.textSecondary} />
        </View>

        {hasSelector && (
          <Picker
            enabled={!disabled}
            selectedValue={selectedCountry.code}
            onValueChange={(value) => {
              if (typeof value === 'string' && onCountryChange) {
                onCountryChange(value);
              }
            }}
            style={styles.countryPicker}
            itemStyle={styles.countryPickerItem}
            accessibilityLabel={`${selectedCountry.name} (${selectedCountry.dialCode})`}
          >
            {countryOptions!.map((option) => (
              <Picker.Item
                key={option.code}
                label={`${option.name} (${option.dialCode})`}
                value={option.code}
              />
            ))}
          </Picker>
        )}
      </View>

      <View style={styles.digitsContainer}>
        <TextInput
          ref={hiddenInputRef}
          style={styles.hiddenInput}
          value={safeDigits}
          onChangeText={handleChangeText}
          keyboardType="number-pad"
          maxLength={maxDigits}
          editable={!disabled}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        <TouchableWithoutFeedback onPress={handlePressBoxes}>
          <Animated.View
            key={`${selectedCountry.code}-${maxDigits}`}
            style={styles.boxesRow}
            onLayout={handleBoxesLayout}
          >
            {Array.from({ length: maxDigits }).map((_, index) => {
              const isFilled = safeDigits.length > index;
              const isBlinking = isFocused && safeDigits.length === 0 && index === 0;

              return (
                <Animated.View
                  key={index}
                  style={[
                    styles.digitBox,
                    {
                      width: boxSize,
                      height: 48,
                      borderRadius: 12,
                    },
                    isFocused && index === safeDigits.length && styles.digitBoxActive,
                    isBlinking && styles.digitBoxBlink,
                    isBlinking && { opacity: blinkOpacity },
                    isFilled && styles.digitBoxFilled,
                  ]}
                >
                  <Text
                    style={[
                      styles.digitText,
                      { fontSize: Math.max(12, Math.min(18, boxSize * 0.5)) },
                    ]}
                  >
                    {safeDigits[index] || ''}
                  </Text>
                </Animated.View>
              );
            })}
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </View>
  );
};

export default PhoneDigitInput;

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: 8,
    },
    countryContainer: {
      minWidth: 104,
      minHeight: 60,
      paddingHorizontal: 10,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    countryContent: {
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: 6,
    },
    flag: {
      fontSize: 22,
    },
    dialCodeText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    countryPicker: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0,
    },
    countryPickerItem: {
      fontSize: 13,
      color: colors.text,
    },
    digitsContainer: {
      flex: 1,
      justifyContent: 'center',
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      width: '100%',
      height: 60,
    },
    boxesRow: {
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flex: 1,
    },
    digitBox: {
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 1,
    },
    digitBoxActive: {
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    digitBoxFilled: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '25',
    },
    digitBoxBlink: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '15',
    },
    digitText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
  });

// Utilidad simple para mostrar bandera por código ISO (A-Z)
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return '🏳️';
  }

  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
}
