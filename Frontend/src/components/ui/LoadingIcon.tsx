import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { AnimatedIcon } from './AnimatedIcon';

type IconFamily = 'ionicons' | 'material' | 'material-community';

interface LoadingIconProps {
  icon?: string;
  family?: IconFamily;
  size?: number;
  color?: string;
  animation?: 'spin' | 'pulse' | 'bounce';
  style?: ViewStyle;
}

export const LoadingIcon: React.FC<LoadingIconProps> = ({
  icon = 'refresh',
  family = 'material',
  size = 32,
  color = '#007AFF',
  animation = 'spin',
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <AnimatedIcon name={icon} family={family} size={size} color={color} animation={animation} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 8 },
});

export default LoadingIcon;
