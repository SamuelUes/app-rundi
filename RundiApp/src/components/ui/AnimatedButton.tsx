import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';

interface AnimatedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  iconName?: React.ComponentProps<typeof MaterialIcons>['name'];
  color?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * Botón animado con feedback visual mejorado
 * - Animación de escala al presionar
 * - Estados de loading
 * - Múltiples variantes de color
 * - Soporte para iconos
 */
export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  iconName,
  color,
  style,
  textStyle,
}) => {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const accentColor = color ?? colors.primary;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const getButtonStyle = (): ViewStyle => {
    const baseStyle = { ...styles.button, ...styles[`button_${size}`] };
    
    switch (variant) {
      case 'primary':
        return { ...baseStyle, backgroundColor: accentColor };
      case 'secondary':
        return { ...baseStyle, backgroundColor: colors.surface2, boxShadow: [], elevation: 0 };
      case 'danger':
        return { ...baseStyle, backgroundColor: colors.error };
      case 'success':
        return { ...baseStyle, backgroundColor: colors.success };
      case 'outline':
        return { ...baseStyle, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: accentColor, boxShadow: [], elevation: 0 };
      default:
        return baseStyle;
    }
  };

  const getContentColor = (): string => {
    switch (variant) {
      case 'primary':
        return '#241A09';
      case 'secondary':
        return colors.text;
      case 'outline':
        return accentColor;
      default:
        return '#FFFFFF';
    }
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle = { ...styles.text, ...styles[`text_${size}`] };
    return { ...baseStyle, color: getContentColor() };
  };

  const isDisabled = disabled || loading;
  const contentColor = getContentColor();
  const iconSize = size === 'small' ? 16 : size === 'large' ? 22 : 20;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[
          getButtonStyle(),
          isDisabled && styles.disabled,
          style,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={0.85}
      >
        {loading ? (
          <LoadingIcon icon="refresh" size={iconSize} color={contentColor} animation="spin" />
        ) : (
          <View style={styles.contentRow}>
            {iconName && <MaterialIcons name={iconName} size={iconSize} color={contentColor} style={styles.icon} />}
            <Text style={[getTextStyle(), textStyle]}>{title}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  button_small: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button_medium: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  button_large: {
    paddingHorizontal: 28,
    paddingVertical: 17,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  text_small: {
    fontSize: 14,
  },
  text_medium: {
    fontSize: 16,
  },
  text_large: {
    fontSize: 18,
  },
  icon: {
    marginRight: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
