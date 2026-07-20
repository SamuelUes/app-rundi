import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface RideTrackingActionButtonsProps {
  rideStatus: string;
  isCancellingRide: boolean;
  cancelButtonScale: Animated.Value;
  onGoToPayment: () => void;
  onShareTrip: () => void;
  onCancelRide: () => void;
  tr: (path: string, options?: Record<string, any>) => string;
  styles: any;
}

export function RideTrackingActionButtons({
  rideStatus,
  isCancellingRide,
  cancelButtonScale,
  onGoToPayment,
  onShareTrip,
  onCancelRide,
  tr,
  styles,
}: RideTrackingActionButtonsProps) {
  return (
    <View style={styles.actionButtons}>
      {rideStatus === 'pending_payment' && (
        <TouchableOpacity
          style={styles.paymentButton}
          onPress={onGoToPayment}
          activeOpacity={0.9}
        >
          <Text style={styles.paymentButtonText}>{tr('buttons.goToPayment')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.shareButton, { backgroundColor: '#609931ff' }]}
        onPress={onShareTrip}
        activeOpacity={0.9}
      >
        <Text style={styles.shareButtonText}>{tr('buttons.shareLocation')}</Text>
      </TouchableOpacity>

      <AnimatedTouchableOpacity
        style={[
          styles.cancelButton,
          {
            backgroundColor: '#FF4444',
            transform: [{ scale: cancelButtonScale }],
            opacity: isCancellingRide ? 0.7 : 1,
          },
        ]}
        onPress={onCancelRide}
        disabled={isCancellingRide}
        activeOpacity={0.85}
      >
        {isCancellingRide ? (
          <LoadingIcon icon="refresh" size={24} color="#FFFFFF" animation="spin" />
        ) : (
          <Text style={styles.cancelButtonText}>{tr('buttons.cancel')}</Text>
        )}
      </AnimatedTouchableOpacity>
    </View>
  );
}
