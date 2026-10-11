import React from 'react';
import { Text, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface ActiveRideCTAButtonsProps {
  show: boolean;
  ctaLabel: string;
  ctaIcon: keyof typeof MaterialIcons.glyphMap;
  updating: boolean;
  isCancellingRide: boolean;
  cancelButtonScale: Animated.Value;
  colors: any;
  onCTAPress: () => void;
  onCancelRide: () => void;
  styles: any;
  t: TFunction;
}

export function ActiveRideCTAButtons({
  show,
  ctaLabel,
  ctaIcon,
  updating,
  isCancellingRide,
  cancelButtonScale,
  colors,
  onCTAPress,
  onCancelRide,
  styles,
  t,
}: ActiveRideCTAButtonsProps) {
  return (
    <>
      {show && (
        <TouchableOpacity
          style={[styles.primaryButton, updating && styles.buttonDisabled]}
          onPress={onCTAPress}
          disabled={updating}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ disabled: updating }}
        >
          {updating ? (
            <LoadingIcon size={20} color="#1C1917" />
          ) : (
            <MaterialIcons name={ctaIcon} size={20} color="#1C1917" />
          )}
          <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}

      <AnimatedTouchableOpacity
        style={[
          styles.cancelGhost,
          (updating || isCancellingRide) && styles.buttonDisabled,
          { transform: [{ scale: cancelButtonScale }] },
        ]}
        onPress={onCancelRide}
        disabled={updating || isCancellingRide}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ disabled: updating || isCancellingRide }}
      >
        {isCancellingRide ? (
          <LoadingIcon size={18} color={colors.error} />
        ) : (
          <>
            <MaterialIcons name="close" size={17} color={colors.error} />
            <Text style={styles.cancelGhostText}>
              {t('driver.activeRide.buttons.cancelRide')}
            </Text>
          </>
        )}
      </AnimatedTouchableOpacity>
    </>
  );
}
