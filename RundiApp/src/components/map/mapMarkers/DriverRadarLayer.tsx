import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';
import { Circle } from 'react-native-maps';
import type { DriverMarker } from '../../../hooks/shared/map/useMarkerHeading';
import { isValidCoord, toLatLng } from '../../../hooks/shared/map/useMapCamera';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  drivers: DriverMarker[];
  zoom: number;
}

export default function DriverRadarLayer({ drivers, zoom }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    }).catch(() => {});
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const appSub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => {
      mounted = false;
      motionSub.remove();
      appSub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion || !active || drivers.length === 0) return;
    progress.setValue(0);
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 2400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, drivers.length, progress]);

  if (reduceMotion || !active) return null;

  return (
    <>
      {drivers.filter(isValidCoord).map((driver) => {
        // Google Maps circles are measured in meters; keep their apparent size
        // approximately stable as the camera zoom changes.
        const metersPerPixel = 156543.03392 * Math.cos(driver.latitude * Math.PI / 180) / Math.pow(2, zoom);
        const radius = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [Math.max(1, metersPerPixel * 10), Math.max(2, metersPerPixel * 34)],
        });
        const strokeColor = progress.interpolate({
          inputRange: [0, 0.25, 1],
          outputRange: ['rgba(179,135,55,0)', 'rgba(179,135,55,0.45)', 'rgba(179,135,55,0)'],
        });
        return (
          <AnimatedCircle
            key={`radar-${driver.id}`}
            center={toLatLng(driver)}
            radius={radius as unknown as number}
            strokeColor={strokeColor as unknown as string}
            strokeWidth={1.5}
            fillColor="transparent"
            zIndex={1}
          />
        );
      })}
    </>
  );
}
