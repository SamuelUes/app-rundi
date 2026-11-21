import React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * TouchableOpacity con feedback de escala al presionar (Reanimated, UI thread).
 * Acepta las mismas props que TouchableOpacity.
 */
export const PressableScale: React.FC<TouchableOpacityProps> = ({
  onPressIn,
  onPressOut,
  style,
  ...props
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedTouchable
      activeOpacity={0.9}
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        scale.value = withTiming(0.97, {
          duration: 140,
          reduceMotion: ReduceMotion.System,
        });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, {
          duration: 160,
          reduceMotion: ReduceMotion.System,
        });
        onPressOut?.(event);
      }}
    />
  );
};
