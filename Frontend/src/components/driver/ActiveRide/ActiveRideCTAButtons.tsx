import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface ActiveRideCTAButtonsProps {
  show: boolean;
  ctaLabel: string;
  updating: boolean;
  isCancellingRide: boolean;
  cancelButtonScale: Animated.Value;
  onCTAPress: () => void;
  onCancelRide: () => void;
  styles: any;
  t: TFunction;
}

export function ActiveRideCTAButtons({
  show,
  ctaLabel,
  updating,
  isCancellingRide,
  cancelButtonScale,
  onCTAPress,
  onCancelRide,
  styles,
  t,
}: ActiveRideCTAButtonsProps) {
  return (
    <>
      {show && (
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: '#D4AF37' }, updating && styles.buttonDisabled]}
          onPress={onCTAPress}
          disabled={updating}
        >
          <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}

      <AnimatedTouchableOpacity
        style={[
          styles.cancelButton,
          updating && styles.buttonDisabled,
          {
            transform: [{ scale: cancelButtonScale }],
            opacity: isCancellingRide ? 0.7 : 1,
          },
        ]}
        onPress={onCancelRide}
        disabled={updating || isCancellingRide}
        activeOpacity={0.85}
      >
        {isCancellingRide ? (
          <LoadingIcon size={20} color="#f44336" />
        ) : (
          <Text style={[styles.cancelButtonText, { color: '#f44336' }]}>
            {t('driver.activeRide.buttons.cancelRide')}
          </Text>
        )}
      </AnimatedTouchableOpacity>
    </>
  );
}
