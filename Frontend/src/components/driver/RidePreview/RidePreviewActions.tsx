import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface RidePreviewActionsProps {
  acceptingRide: boolean;
  isRejectingRide: boolean;
  acceptButtonScale: Animated.Value;
  rejectButtonScale: Animated.Value;
  colors: any;
  onAccept: () => void;
  onReject: () => void;
  styles: any;
  t: TFunction;
}

export function RidePreviewActions({
  acceptingRide,
  isRejectingRide,
  acceptButtonScale,
  rejectButtonScale,
  colors,
  onAccept,
  onReject,
  styles,
  t,
}: RidePreviewActionsProps) {
  return (
    <View style={styles.actionsRow}>
      <AnimatedTouchableOpacity
        style={[
          styles.acceptButton,
          {
            backgroundColor: colors.warning,
            transform: [{ scale: acceptButtonScale }],
            opacity: acceptingRide ? 0.7 : 1,
          },
        ]}
        onPress={onAccept}
        activeOpacity={0.85}
        disabled={acceptingRide}
      >
        {acceptingRide ? (
          <LoadingIcon size={20} color="#FFFFFF" />
        ) : (
          <Text style={styles.actionButtonText}>{t('driver.ridePreview.buttons.accept')}</Text>
        )}
      </AnimatedTouchableOpacity>

      <AnimatedTouchableOpacity
        style={[
          styles.rejectButton,
          {
            backgroundColor: colors.error,
            transform: [{ scale: rejectButtonScale }],
            opacity: isRejectingRide ? 0.7 : 1,
          },
        ]}
        onPress={onReject}
        activeOpacity={0.85}
        disabled={isRejectingRide}
      >
        {isRejectingRide ? (
          <LoadingIcon size={20} color="#FFFFFF" />
        ) : (
          <Text style={styles.actionButtonText}>{t('driver.ridePreview.buttons.reject')}</Text>
        )}
      </AnimatedTouchableOpacity>
    </View>
  );
}
