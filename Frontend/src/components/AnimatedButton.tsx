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
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from './LoadingIcon';

interface AnimatedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  iconName?: React.ComponentProps<typeof MaterialIcons>['name'];
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
  style,
  textStyle,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
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
        return { ...baseStyle, backgroundColor: '#4A90E2' };
      case 'secondary':
        return { ...baseStyle, backgroundColor: '#6C757D' };
      case 'danger':
        return { ...baseStyle, backgroundColor: '#DC3545' };
      case 'success':
        return { ...baseStyle, backgroundColor: '#28A745' };
      case 'outline':
        return { ...baseStyle, backgroundColor: 'transparent', borderWidth: 2, borderColor: '#4A90E2' };
      default:
        return baseStyle;
    }
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle = { ...styles.text, ...styles[`text_${size}`] };
    
    if (variant === 'outline') {
      return { ...baseStyle, color: '#4A90E2' };
    }
    
    return baseStyle;
  };

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          getButtonStyle(),
          isDisabled && styles.disabled,
          style,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        activeOpacity={0.8}
      >
        {loading ? (
          <LoadingIcon icon="refresh" size={20} color="#FFFFFF" animation="spin" />
        ) : (
          <View style={styles.contentRow}>
            {iconName && <MaterialIcons name={iconName} size={size === 'small' ? 16 : size === 'large' ? 22 : 20} color="#FFFFFF" style={styles.icon} />}
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
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  button_small: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  button_medium: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  button_large: {
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '600',
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
