import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import BrandLoadingIndicator from './BrandLoadingIndicator';

type IconFamily = 'ionicons' | 'material' | 'material-community';

interface LoadingIconProps {
  icon?: string;
  family?: IconFamily;
  size?: number;
  color?: string;
  animation?: 'spin' | 'pulse' | 'bounce';
  style?: ViewStyle;
}

/**
 * PRUEBA: ahora renderiza el indicador de marca (R + arco dorado) en lugar del
 * icono animado genérico. `size` se interpreta como el alto del dibujo total,
 * por eso la marca R se pasa al ~62% (el anillo es ~1.6x la marca).
 */
export const LoadingIcon: React.FC<LoadingIconProps> = ({
  size = 32,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <BrandLoadingIndicator size={Math.max(12, Math.round(size * 0.625))} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 8 },
});

export default LoadingIcon;
