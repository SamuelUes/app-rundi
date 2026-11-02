import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';

type AnimationType = 'none' | 'spin' | 'pulse' | 'bounce';
type IconFamily = 'ionicons' | 'material' | 'material-community';

interface AnimatedIconProps {
  name: string;
  family?: IconFamily;
  size?: number;
  color?: string;
  animation?: AnimationType;
  duration?: number;
  style?: ViewStyle;
}

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  name,
  family = 'material',
  size = 24,
  color = '#000',
  animation = 'none',
  duration = 1000,
  style,
}) => {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animation === 'none') return;

    const loop = Animated.loop(
      Animated.timing(animValue, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animation, animValue, duration]);

  const getAnimatedStyle = (): any => {
    if (animation === 'spin') {
      const rotate = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
      });
      return { transform: [{ rotate }] };
    }
    if (animation === 'pulse') {
      const scale = animValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.2, 1],
      });
      return { transform: [{ scale }] };
    }
    if (animation === 'bounce') {
      const translateY = animValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, -8, 0],
      });
      return { transform: [{ translateY }] };
    }
    return {};
  };

  return (
    <Animated.View
      style={[{ alignItems: 'center', justifyContent: 'center' }, getAnimatedStyle(), style]}
    >
      {family === 'ionicons' ? (
        <Ionicons name={name as any} size={size} color={color} />
      ) : family === 'material-community' ? (
        <MaterialCommunityIcons name={name as any} size={size} color={color} />
      ) : (
        <MaterialIcons name={name as any} size={size} color={color} />
      )}
    </Animated.View>
  );
};

export default AnimatedIcon;
