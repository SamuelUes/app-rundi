import React from 'react';
import { View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../ui/LoadingIcon';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface RideTrackingActionButtonsProps {
  rideStatus: string;
  paymentMethod?: 'cash' | 'card';
  isCancellingRide: boolean;
  cancelButtonScale: Animated.Value;
  colors: any;
  onGoToPayment: () => void;
  onShareTrip: () => void;
  onCancelRide: () => void;
  tr: (path: string, options?: Record<string, any>) => string;
  styles: any;
}

export function RideTrackingActionButtons({
  rideStatus,
  paymentMethod,
  isCancellingRide,
  cancelButtonScale,
  colors,
  onGoToPayment,
  onShareTrip,
  onCancelRide,
  tr,
  styles,
}: RideTrackingActionButtonsProps) {
  const isPendingPayment = rideStatus === 'pending_payment';
  const shareIcon = Platform.OS === 'ios' ? 'ios-share' : 'share';

  return (
    <View style={styles.actionButtons}>
      {isPendingPayment ? (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onGoToPayment}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <MaterialIcons
            name={paymentMethod === 'card' ? 'credit-card' : 'payments'}
            size={20}
            color="#1C1917"
          />
          <Text style={styles.primaryButtonText}>{tr('buttons.goToPayment')}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onShareTrip}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <MaterialIcons name={shareIcon} size={19} color="#ffffff" />
          <Text style={styles.primaryButtonText}>{tr('buttons.shareLocation')}</Text>
        </TouchableOpacity>
      )}

      <AnimatedTouchableOpacity
        style={[
          styles.cancelGhost,
          isCancellingRide && styles.buttonDisabled,
          { transform: [{ scale: cancelButtonScale }] },
        ]}
        onPress={onCancelRide}
        disabled={isCancellingRide}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ disabled: isCancellingRide }}
      >
        {isCancellingRide ? (
          <LoadingIcon size={18} color={colors.error} animation="spin" />
        ) : (
          <>
            <MaterialIcons name="close" size={17} color="#ffffff" />
            <Text style={styles.cancelGhostText}>{tr('buttons.cancel')}</Text>
          </>
        )}
      </AnimatedTouchableOpacity>
    </View>
  );
}
