/**
 * GoogleRegisterPrompt
 * Dialog flotante centrado que aparece cuando un login con Google no
 * encuentra una cuenta registrada. Ofrece continuar al registro con esa
 * cuenta o cancelar (el llamador se encarga de cerrar la sesión de Firebase).
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';

interface GoogleRegisterPromptProps {
  visible: boolean;
  email?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const GoogleRegisterPrompt: React.FC<GoogleRegisterPromptProps> = ({
  visible,
  email,
  onConfirm,
  onCancel,
}) => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        reduceMotion.current = value;
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      reduceMotion.current = value;
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    if (!visible) return;
    scale.setValue(reduceMotion.current ? 1 : 0.92);
    opacity.setValue(0);
    backdropOpacity.setValue(0);
    if (reduceMotion.current) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity, backdropOpacity]);

  const animateOut = useCallback(
    (after: () => void) => {
      const duration = reduceMotion.current ? 120 : 170;
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.96,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration, useNativeDriver: true }),
      ]).start(after);
    },
    [scale, opacity, backdropOpacity]
  );

  const handleConfirm = useCallback(() => animateOut(onConfirm), [animateOut, onConfirm]);
  const handleCancel = useCallback(() => animateOut(onCancel), [animateOut, onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            {
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.googleBadge}>
            <Image
              source={require('../../assets/icons/utils/google_icon_1.png')}
              style={styles.googleIcon}
            />
          </View>

          <Text style={styles.title}>{t('authScreens.login.googlePrompt.title')}</Text>

          {email ? (
            <View style={styles.accountChip}>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {email}
              </Text>
            </View>
          ) : null}

          <Text style={styles.message}>{t('authScreens.login.googlePrompt.message')}</Text>

          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirm}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>
              {t('authScreens.login.googlePrompt.confirm')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>
              {t('authScreens.login.googlePrompt.cancel')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 12, 12, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: 340,
      borderRadius: 24,
      paddingHorizontal: 22,
      paddingTop: 26,
      paddingBottom: 16,
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : colors.border,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.55 : 0.32,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 14 },
      elevation: 14,
    },
    googleBadge: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#EBEBEB',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    googleIcon: {
      width: 26,
      height: 26,
      resizeMode: 'contain',
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 0.1,
      textAlign: 'center',
      marginBottom: 10,
    },
    accountChip: {
      maxWidth: '100%',
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.surface,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : colors.border,
      marginBottom: 12,
    },
    accountEmail: {
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: 0.1,
    },
    message: {
      fontSize: 13.5,
      lineHeight: 19,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    confirmButton: {
      alignSelf: 'stretch',
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 4,
    },
    confirmText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    cancelButton: {
      alignSelf: 'stretch',
      paddingVertical: 12,
      alignItems: 'center',
    },
    cancelText: {
      color: colors.textSecondary,
      fontSize: 13.5,
      fontWeight: '600',
    },
  });

export default GoogleRegisterPrompt;
