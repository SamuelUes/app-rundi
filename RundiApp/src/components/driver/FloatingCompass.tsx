import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';

interface FloatingCompassProps {
  // Rumbo GPS (course over ground) usado solo como respaldo cuando el
  // magnetómetro del dispositivo no reporta (sin sensor, sin permiso, error).
  heading?: number | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CARDINALS = ['N', 'E', 'S', 'W'] as const;

function normalizeHeading(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return ((value % 360) + 360) % 360;
}

export default function FloatingCompass({ heading, onPress, style, testID }: FloatingCompassProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();

  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const lastRotationRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | null = null;

    Location.watchHeadingAsync((next) => {
      if (!mounted) return;
      const raw = normalizeHeading(next.trueHeading) ?? normalizeHeading(next.magHeading);
      if (raw !== null) setDeviceHeading(raw);
    })
      .then((sub) => {
        if (mounted) subscription = sub;
        else sub?.remove();
      })
      .catch(() => {
        // Sin brújula de hardware o sin permiso: queda el fallback del GPS.
      });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  const resolvedHeading = deviceHeading ?? normalizeHeading(heading);

  useEffect(() => {
    if (resolvedHeading === null) return;
    // La rosa queda fija (N siempre arriba); la aguja gira con el heading
    // del dispositivo. Se acumula sobre la rotación anterior tomando el
    // camino angular más corto para no dar una vuelta completa al cruzar 359° -> 0°.
    const target = resolvedHeading;
    const delta = ((target - lastRotationRef.current + 540) % 360) - 180;
    const next = lastRotationRef.current + delta;
    lastRotationRef.current = next;
    Animated.timing(rotationAnim, {
      toValue: next,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [resolvedHeading, rotationAnim]);

  const spin = rotationAnim.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
    extrapolate: 'extend',
  });

  const activeCardinal =
    resolvedHeading === null
      ? null
      : CARDINALS[Math.round(resolvedHeading / 90) % 4];

  const accessibilityLabel =
    resolvedHeading !== null
      ? t('driver.compass.accessibility.label', { degrees: Math.round(resolvedHeading) })
      : t('driver.compass.accessibility.labelUnknown');

  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.button, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.dial}>
        {CARDINALS.map((cardinal) => (
          <Text
            key={cardinal}
            style={[
              styles.cardinal,
              styles[`cardinal${cardinal}`],
              cardinal === activeCardinal && styles.cardinalActive,
            ]}
          >
            {cardinal}
          </Text>
        ))}
      </View>
      {/* Rosa fija (N arriba); la aguja dorada gira con el heading y
          resalta el cardinal hacia el que apunta el dispositivo. */}
      {resolvedHeading !== null && (
        <Animated.View
          pointerEvents="none"
          style={[styles.needle, { transform: [{ rotate: spin }] }]}
        >
          <View style={styles.needleTip} />
          <View style={styles.needleHeading} />
          <View style={styles.needleTail} />
          <View style={styles.pivot} />
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    button: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(28,25,23,0.1)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.4 : 0.14,
      shadowRadius: 12,
      elevation: 8,
      zIndex: 20,
    },
    dial: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardinal: {
      position: 'absolute',
      fontSize: 9,
      fontWeight: '700',
      color: colors.textTertiary,
    },
    cardinalActive: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
    },
    cardinalN: {
      top: 0.5,
    },
    cardinalS: {
      bottom: 0.5,
    },
    cardinalE: {
      right: 1.5,
    },
    cardinalW: {
      left: 1.5,
    },
    needle: {
      position: 'absolute',
      top: 3,
      bottom: 3,
      left: 3,
      right: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    needleTip: {
      position: 'absolute',
      top: 11,
      width: 0,
      height: 0,
      borderLeftWidth: 2,
      borderRightWidth: 1,
      borderBottomWidth: 4,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: colors.primary,
    },
    needleHeading: {
      position: 'absolute',
      top: 16,
      width: 2,
      height: 7,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    needleTail: {
      position: 'absolute',
      bottom: 19,
      width: 2,
      height: 3,
      borderRadius: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(28,25,23,0.2)',
    },
    pivot: {
      width: 6,
      height: 6,
      borderRadius: 2,
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: isDark ? '#181411' : '#FFFFFF',
    },
  });
