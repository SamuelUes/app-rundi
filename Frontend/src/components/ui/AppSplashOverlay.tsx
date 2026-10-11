/**
 * Splash animado en JS que replica el splash nativo (mismo fondo #0F2628
 * y mismo logo) para una transición seamless cuando se oculta el splash
 * nativo. Hace una entrada sutil del logo y, cuando la app esta lista,
 * un fade-out con leve scale-up antes de desmontarse via onFinished.
 */

import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';

const SPLASH_IMAGE = require('../../assets/images/splash-icon.png');
const SPLASH_BACKGROUND = '#0F2628';
const GOLD = '#E2B866';
// Debe coincidir con imageWidth del plugin expo-splash-screen en app.config.js
const LOGO_WIDTH = 200;

interface AppSplashOverlayProps {
  ready: boolean;
  onFinished: () => void;
}

const AppSplashOverlay = ({ ready, onFinished }: AppSplashOverlayProps) => {
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0.85)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const spinnerOpacity = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // El indicador solo aparece si la carga tarda (evita parpadeo en cargas rapidas)
    const spinnerIn = Animated.timing(spinnerOpacity, {
      toValue: 1,
      duration: 250,
      delay: 700,
      useNativeDriver: true,
    });
    spinnerIn.start();
    return () => spinnerIn.stop();
  }, [logoOpacity, logoScale, spinnerOpacity]);

  useEffect(() => {
    if (!ready || finishedRef.current) return;
    finishedRef.current = true;
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1.05,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(spinnerOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => onFinished());
  }, [ready, onFinished, overlayOpacity, logoScale, spinnerOpacity]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.Image
        source={SPLASH_IMAGE}
        resizeMode="contain"
        style={[
          styles.logo,
          { opacity: logoOpacity, transform: [{ scale: logoScale }] },
        ]}
      />
      <Animated.View style={{ opacity: spinnerOpacity }}>
        <ActivityIndicator size="small" color={GOLD} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_WIDTH,
    marginBottom: 40,
  },
});

export default AppSplashOverlay;
