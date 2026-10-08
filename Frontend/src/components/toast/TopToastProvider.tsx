import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { ToastAction, ToastPayload, setToastHandler } from '../../services/alertService';
import { useTranslation } from 'react-i18next';

type ToastActionVariant = 'default' | 'primary' | 'destructive';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const DEFAULT_DURATION = 3200;
const MIN_HEIGHT_FOR_OFFSET = 120;
const FALLBACK_HIDDEN_OFFSET = -220;
const SWIPE_DISMISS_DISTANCE = -40;
const SWIPE_DISMISS_VELOCITY = -0.4;
const TOAST_FONT = 'PlusJakartSans';

const accentByType: Record<ToastPayload['type'], string> = {
  success: '#4ADE80',
  error: '#F87171',
  info: '#60A5FA',
  warning: '#FBBF24',
  confirm: '#C9A35A',
};

const iconByType: Record<ToastPayload['type'], IoniconName> = {
  success: 'checkmark',
  error: 'close',
  info: 'information',
  warning: 'warning',
  confirm: 'help',
};

const withAlpha = (hex: string, alpha: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'rgba(255,255,255,0.10)';
  const channel = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${channel}`;
};

interface TopToastProviderProps {
  children: React.ReactNode;
}

const TopToastProvider: React.FC<TopToastProviderProps> = ({ children }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const { t } = useTranslation();

  const translateY = useRef(new Animated.Value(FALLBACK_HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.97)).current;

  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentToast = useRef<ToastPayload | null>(null);
  const shownAt = useRef(0);
  const toastHeight = useRef(0);
  const reduceMotion = useRef(false);

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

  const clearHideTimeout = useCallback(() => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  }, []);

  const getHiddenOffset = useCallback(
    () => -(insets.top + Math.max(toastHeight.current, MIN_HEIGHT_FOR_OFFSET) + 32),
    [insets.top]
  );

  const animateIn = useCallback(() => {
    if (reduceMotion.current) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 320,
        damping: 30,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        stiffness: 320,
        damping: 30,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale, translateY]);

  const animateOut = useCallback(
    (after?: () => void, quick = false) => {
      const duration = reduceMotion.current ? 140 : quick ? 110 : 200;
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: getHiddenOffset(),
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start(() => after?.());
    },
    [getHiddenOffset, opacity, translateY]
  );

  const closeToast = useCallback(
    (afterClose?: () => void) => {
      if (!currentToast.current) {
        afterClose?.();
        return;
      }
      clearHideTimeout();
      animateOut(() => {
        const toClose = currentToast.current;
        currentToast.current = null;
        setToast(null);
        toClose?.onClose?.();
        afterClose?.();
      });
    },
    [animateOut, clearHideTimeout]
  );

  const scheduleHide = useCallback(
    (payload: ToastPayload) => {
      const duration = payload.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        shownAt.current = Date.now();
        hideTimeout.current = setTimeout(() => closeToast(), duration);
      }
    },
    [closeToast]
  );

  const showToast = useCallback(
    (payload: ToastPayload) => {
      clearHideTimeout();

      const present = () => {
        currentToast.current = payload;
        setToast(payload);
        translateY.setValue(reduceMotion.current ? 0 : getHiddenOffset());
        scale.setValue(0.97);
        opacity.setValue(0);
        shownAt.current = Date.now();
        animateIn();
        scheduleHide(payload);
      };

      if (currentToast.current) {
        animateOut(present, true);
      } else {
        present();
      }
    },
    [animateIn, animateOut, clearHideTimeout, getHiddenOffset, opacity, scale, scheduleHide, translateY]
  );

  const resumeHide = useCallback(() => {
    const payload = currentToast.current;
    if (!payload) return;
    const duration = payload.duration ?? DEFAULT_DURATION;
    if (duration <= 0) return;
    const remaining = Math.max(duration - (Date.now() - shownAt.current), 1500);
    hideTimeout.current = setTimeout(() => closeToast(), remaining);
  }, [closeToast]);

  useEffect(() => {
    setToastHandler(showToast);
    return () => {
      setToastHandler(undefined);
      clearHideTimeout();
    };
  }, [showToast, clearHideTimeout]);

  const closeToastRef = useRef(closeToast);
  closeToastRef.current = closeToast;
  const resumeHideRef = useRef(resumeHide);
  resumeHideRef.current = resumeHide;
  const clearHideTimeoutRef = useRef(clearHideTimeout);
  clearHideTimeoutRef.current = clearHideTimeout;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        clearHideTimeoutRef.current();
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        translateY.setValue(gesture.dy < 0 ? gesture.dy : gesture.dy * 0.25);
        if (gesture.dy < 0) {
          opacity.setValue(Math.max(0.4, 1 + gesture.dy / 220));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < SWIPE_DISMISS_DISTANCE || gesture.vy < SWIPE_DISMISS_VELOCITY) {
          closeToastRef.current();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            stiffness: 420,
            damping: 32,
            useNativeDriver: true,
          }).start();
          Animated.timing(opacity, {
            toValue: 1,
            duration: 140,
            useNativeDriver: true,
          }).start();
          resumeHideRef.current();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 420,
          damping: 32,
          useNativeDriver: true,
        }).start();
        Animated.timing(opacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }).start();
        resumeHideRef.current();
      },
    })
  ).current;

  const styles = useMemo(() => createStyles(isDark), [isDark]);

  const accentColor = toast ? toast.accentColor ?? accentByType[toast.type] : '#C9A35A';
  const iconName: IoniconName = toast ? iconByType[toast.type] : 'information';
  const surfaceColor = toast?.backgroundColor ?? (isDark ? '#262B2E' : '#151B1E');

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
          accessibilityLiveRegion="polite"
          style={[
            styles.toastWrapper,
            {
              top: insets.top + 12,
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          <View
            style={[styles.toastContainer, { backgroundColor: surfaceColor }]}
            onLayout={(event) => {
              toastHeight.current = event.nativeEvent.layout.height;
            }}
            {...panResponder.panHandlers}
          >
            <View style={styles.toastContent}>
              <View style={[styles.iconBadge, { backgroundColor: withAlpha(accentColor, 0.18) }]}>
                {toast.icon ? (
                  <Text style={styles.customIcon}>{toast.icon}</Text>
                ) : (
                  <Ionicons name={iconName} size={18} color={accentColor} />
                )}
              </View>
              <View style={styles.textBlock}>
                {toast.title ? (
                  <Text style={styles.toastTitle} numberOfLines={2}>
                    {toast.title}
                  </Text>
                ) : null}
                <Text style={styles.toastMessage} numberOfLines={4}>
                  {toast.message}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => closeToast()}
                accessibilityRole="button"
                accessibilityLabel={t('shared.toast.closeLabel')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={17} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>
            {toastActions.length > 0 ? (
              <View style={styles.actionsRow}>
                {toastActions.map((action, index) => (
                  <TouchableOpacity
                    key={`${action.label}-${index}`}
                    style={[styles.actionButton, actionButtonVariant(action.variant, colors.primary)]}
                    onPress={() => handleActionPress(action)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.actionText, actionTextVariant(action.variant)]}>
                      {action.label}
                    </Text>
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
      left: 14,
      right: 14,
      zIndex: 999,
      elevation: 20,
    },
    toastContainer: {
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.07)',
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.5 : 0.3,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
      overflow: 'hidden',
    },
    toastContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    customIcon: {
      fontSize: 18,
    },
    textBlock: {
      flex: 1,
      flexShrink: 1,
      paddingRight: 8,
    },
    toastTitle: {
      // fontFamily: TOAST_FONT,
      fontSize: 15,
      fontWeight: '700',
      color: '#F5F7F7',
      letterSpacing: 0.1,
      marginBottom: 1,
    },
    toastMessage: {
      // fontFamily: TOAST_FONT,
      fontSize: 13.5,
      color: 'rgba(235,240,241,0.72)',
      lineHeight: 19,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 2,
    },
    actionsRow: {
      flexDirection: 'row',
      marginTop: 12,
      justifyContent: 'flex-end',
      gap: 8,
      flexWrap: 'wrap',
    },
    actionButton: {
      minWidth: 76,
      paddingVertical: 9,
      paddingHorizontal: 18,
      borderRadius: 999,
      alignItems: 'center',
    },
    actionText: {
      // fontFamily: TOAST_FONT,
      fontSize: 13.5,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
  });

const actionButtonVariant = (variant: ToastActionVariant = 'default', primary: string) => {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: primary,
      };
    case 'destructive':
      return {
        backgroundColor: '#E5484D',
      };
    default:
      return {
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
      };
  }
};

const actionTextVariant = (variant: ToastActionVariant = 'default') => {
  switch (variant) {
    case 'primary':
      return {
        color: '#1A130B',
      };
    case 'destructive':
      return {
        color: '#FFFFFF',
      };
    default:
      return {
        color: '#E9EDEE',
      };
  }
};

export default TopToastProvider;
