/**
 * Componente de superposición de carga
 * Muestra un indicador de carga con un mensaje opcional
 * Se puede usar en toda la app para mantener una experiencia de usuario consistente
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ViewStyle,
  TextStyle
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  transparent?: boolean;
  spinnerSize?: 'small' | 'large';
  showProgress?: boolean;
  progress?: number; // 0 to 100
}

const LoadingOverlay = ({
  visible,
  message = 'Cargando...',
  transparent = true,
  spinnerSize = 'large',
  showProgress = false,
  progress = 0
}: LoadingOverlayProps) => {
  const { colors } = useTheme();
  const opacity = new Animated.Value(0);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 100,
        easing: Easing.ease,
        useNativeDriver: true
      }).start();
    }
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        { backgroundColor: transparent ? 'rgba(0, 0, 0, 0.5)' : colors.background },
        { opacity }
      ]}
    >
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <ActivityIndicator
          size={spinnerSize}
          color={colors.primary}
          style={styles.spinner}
        />
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
        
        {showProgress && (
          <View style={styles.progressContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: colors.primary }
              ]} 
            />
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {`${Math.round(progress)}%`}
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

interface Styles {
  overlay: ViewStyle;
  container: ViewStyle;
  spinner: ViewStyle;
  message: TextStyle;
  progressContainer: ViewStyle;
  progressBar: ViewStyle;
  progressText: TextStyle;
}

const styles = StyleSheet.create<Styles>({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  container: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 180,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        // @ts-ignore - ignorar error específico para web
        boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
      }
    }),
  },
  spinner: {
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginTop: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  progressText: {
    position: 'absolute',
    right: -24,
    top: 8,
    fontSize: 12,
  }
});

export default LoadingOverlay;