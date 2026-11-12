import { useCallback, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export function useRideFlowTransition() {
  const progress = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);
  const reducedMotion = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    leaving.current = false;
    progress.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((enabled) => {
      if (!active) return;
      reducedMotion.current = enabled;
      Animated.timing(progress, {
        toValue: 1,
        duration: enabled ? 0 : 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [progress]));

  const exit = useCallback((next: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion.current ? 0 : 380,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) next();
    });
  }, [progress]);

  const topStyle = {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) }],
  };
  const bottomStyle = {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }],
  };

  return { exit, progress, topStyle, bottomStyle };
}
