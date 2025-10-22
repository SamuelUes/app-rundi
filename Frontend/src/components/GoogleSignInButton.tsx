/**
 * Google Sign-In Button Component
 * Botón reutilizable para iniciar sesión/registrarse con Google
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface GoogleSignInButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'login' | 'register';
  style?: StyleProp<ViewStyle>;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onPress,
  loading = false,
  disabled = false,
  variant = 'login',
  style,
}) => {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      marginVertical: 8,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#EBEBEB',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    googleIcon: {
      fontSize: 20,
      marginRight: 8,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#1F2937',
      textAlign: 'center',
    },
    loadingContainer: {
      marginRight: 8,
    },
  });

  const buttonText =
    variant === 'login'
      ? loading
        ? 'Iniciando sesión...'
        : 'Iniciar sesión con Google'
      : loading
      ? 'Registrando...'
      : 'Registrarse con Google';

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.7}
      >
        <View style={styles.buttonContent}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#4285F4" />
            </View>
          ) : (
            <Text style={styles.googleIcon}>🔵</Text>
          )}
          <Text style={styles.buttonText}>{buttonText}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default GoogleSignInButton;
