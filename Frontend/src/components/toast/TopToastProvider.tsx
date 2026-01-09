import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { ToastAction, ToastPayload, setToastHandler } from '../../services/alertService';
 import { useTranslation } from 'react-i18next';

type ToastActionVariant = 'default' | 'primary' | 'destructive';

const DEFAULT_DURATION = 3200;

const accentByType: Record<ToastPayload['type'], string> = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#38bdf8',
  warning: '#f59e0b',
  confirm: '#6366f1',
};

const iconByType: Record<ToastPayload['type'], string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️',
  confirm: '❓',
};

interface TopToastProviderProps {
  children: React.ReactNode;
}

const TopToastProvider: React.FC<TopToastProviderProps> = ({ children }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const { t } = useTranslation();

  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  const currentToast = useRef<ToastPayload | null>(null);

  const resetAnimations = useCallback(() => {
    translateY.setValue(-100);
    opacity.setValue(0);
  }, [opacity, translateY]);

  const closeToast = useCallback(
    (afterClose?: () => void) => {
      if (!currentToast.current) {
        afterClose?.();
        return;
      }

      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const toClose = currentToast.current;
        currentToast.current = null;
        setToast(null);
        toClose?.onClose?.();
        afterClose?.();
      });
    },
    [opacity, translateY]
  );

  const showToast = useCallback(
    (payload: ToastPayload) => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }

      currentToast.current = payload;
      setToast(payload);

      resetAnimations();

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const duration = payload.duration ?? DEFAULT_DURATION;
        if (duration > 0) {
          hideTimeout.current = setTimeout(() => {
            closeToast();
          }, duration);
        }
      });
    },
    [closeToast, resetAnimations, translateY, opacity]
  );

  useEffect(() => {
    setToastHandler(showToast);
    return () => {
      setToastHandler(undefined);
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
      }
    };
  }, [showToast]);

  const styles = useMemo(() => createStyles(isDark), [isDark]);

  const backgroundColor = useMemo(() => {
    if (!toast) return isDark ? '#111111' : '#0f172a';
    if (toast.backgroundColor) return toast.backgroundColor;
    return isDark ? '#111111' : '#0f172a';
  }, [isDark, toast]);

  const accentColor = toast ? toast.accentColor ?? accentByType[toast.type] : '#6366f1';
  const icon = toast?.icon ?? (toast ? iconByType[toast.type] : '');

  const handleActionPress = useCallback(
    (action: ToastAction) => {
      closeToast(() => {
        action.onPress?.();
      });
    },
    [closeToast]
  );

  const toastActions = toast?.actions ?? [];

  return (
    <View style={styles.root} pointerEvents="box-none">
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastWrapper,
            {
              top: insets.top + 12,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.toastContainer, { backgroundColor }] }>
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
            <View style={styles.toastContent}>
              <View style={styles.textContent}>
                {icon ? <Text style={styles.toastIcon}>{icon}</Text> : null}
                <View style={styles.textBlock}>
                  {toast.title ? <Text style={styles.toastTitle}>{toast.title}</Text> : null}
                  <Text style={styles.toastMessage}>{toast.message}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => closeToast()}
                accessibilityRole="button"
                accessibilityLabel={t('shared.toast.closeLabel')}
                style={styles.closeButton}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            {toastActions.length > 0 ? (
              <View style={styles.actionsRow}>
                {toastActions.map((action, index) => (
                  <TouchableOpacity
                    key={`${action.label}-${index}`}
                    style={[styles.actionButton, actionButtonVariant(action.variant)]}
                    onPress={() => handleActionPress(action)}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.actionText, actionTextVariant(action.variant)]}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
};

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    toastWrapper: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 999,
      elevation: 20,
    },
    toastContainer: {
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 18,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.45 : 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
      overflow: 'hidden',
    },
    accentBar: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 4,
      borderTopLeftRadius: 18,
      borderBottomLeftRadius: 18,
    },
    toastContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    textContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      paddingRight: 12,
    },
    textBlock: {
      flexShrink: 1,
    },
    toastIcon: {
      fontSize: 22,
      marginRight: 12,
    },
    toastTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#ffffff',
      marginBottom: 2,
    },
    toastMessage: {
      fontSize: 14,
      color: '#e2e8f0',
      lineHeight: 20,
    },
    closeButton: {
      padding: 6,
      marginLeft: 4,
    },
    closeIcon: {
      fontSize: 16,
      color: '#cbd5f5',
    },
    actionsRow: {
      flexDirection: 'row',
      marginTop: 14,
      justifyContent: 'flex-end',
      gap: 10,
      flexWrap: 'wrap',
    },
    actionButton: {
      minWidth: 80,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
    },
    actionText: {
      fontSize: 14,
      fontWeight: '600',
    },
  });

const actionButtonVariant = (variant: ToastActionVariant = 'default') => {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: '#6366f1',
        borderColor: '#6366f1',
      };
    case 'destructive':
      return {
        backgroundColor: '#ef4444',
        borderColor: '#ef4444',
      };
    default:
      return {
        backgroundColor: 'transparent',
        borderColor: 'rgba(148, 163, 184, 0.45)',
      };
  }
};

const actionTextVariant = (variant: ToastActionVariant = 'default') => {
  switch (variant) {
    case 'primary':
    case 'destructive':
      return {
        color: '#ffffff',
      };
    default:
      return {
        color: '#cbd5f5',
      };
  }
};

export default TopToastProvider;
