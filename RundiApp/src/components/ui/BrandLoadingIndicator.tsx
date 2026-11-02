/**
 * Indicador de carga de marca: la R de Rundi centrada con un arco dorado
 * orbitando a su alrededor. Reemplaza el spinner genérico azul en los
 * estados de carga a pantalla completa.
 *
 * - Entrada: fade + leve scale-up (ease-out cúbica, ~420ms)
 * - Órbita: arco de ~90° en colors.primary girando en loop lineal
 * - Se adapta a tema claro/oscuro vía useTheme()
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../hooks/shared/theme/useTheme';

const R_MARK = require('../../assets/images/rundi_mark.png');

interface BrandLoadingIndicatorProps {
  /** Alto/ancho de la marca R en px (el anillo es ~1.6x mayor) */
  size?: number;
  style?: ViewStyle;
}

export const BrandLoadingIndicator: React.FC<BrandLoadingIndicatorProps> = ({
  size = 88,
  style,
}) => {
  const { colors } = useTheme();
  const entrance = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  const ringSize = Math.round(size * 1.6);

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const orbit = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    orbit.start();
    return () => orbit.stop();
  }, [entrance, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      accessible
      accessibilityLabel="Rundi"
      style={[
        styles.container,
        {
          width: ringSize,
          height: ringSize,
          opacity: entrance,
          transform: [
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 2.5,
          borderColor: 'transparent',
          borderTopColor: colors.primary,
          transform: [{ rotate }],
        }}
      />
      <Image
        source={R_MARK}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Rundi"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BrandLoadingIndicator;
