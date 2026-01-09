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
  Image,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      paddingHorizontal: 12,
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
      width: 32,
      height: 32,
      marginRight: 8,
      resizeMode: 'contain',
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '700',
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
        ? t('authScreens.googlesinginbutton.login')
        : t('authScreens.googlesinginbutton.logincontinue')
      : loading
      ? t('authScreens.googlesinginbutton.register')
      : t('authScreens.googlesinginbutton.registercontinue');

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
            <Image
              source={require('../assets/icons/utils/google_icon_1.png')}
              style={styles.googleIcon}
            />
          )}
          <Text style={styles.buttonText}>{buttonText}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default GoogleSignInButton;
