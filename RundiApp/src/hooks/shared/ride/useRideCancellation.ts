import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import alertService from '../../../services/notification/alertService';
import ridesService from '../../../services/ride/ridesService';

interface UseRideCancellationOptions {
  rideId: string;
  cancelReason: string;
  cancelOptions?: Record<string, any>;
  canCancel: boolean;
  cannotCancelTitle: string;
  cannotCancelMessage: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel: string;
  continueLabel: string;
  cancelErrorLabel: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function useRideCancellation({
  rideId,
  cancelReason,
  cancelOptions,
  canCancel,
  cannotCancelTitle,
  cannotCancelMessage,
  confirmTitle,
  confirmMessage,
  confirmLabel,
  continueLabel,
  cancelErrorLabel,
  onSuccess,
  onCancel,
}: UseRideCancellationOptions) {
  const [isCancellingRide, setIsCancellingRide] = useState(false);
  const cancelButtonScale = useRef(new Animated.Value(1)).current;

  const resetCancelAnimation = useCallback(() => {
    Animated.timing(cancelButtonScale, {
      toValue: 1,
      duration: 170,
      useNativeDriver: true,
    }).start();
    setIsCancellingRide(false);
  }, [cancelButtonScale]);

  const handleCancelRide = useCallback(() => {
    if (isCancellingRide) return;

    if (!canCancel) {
      alertService.showInfoAlert(cannotCancelTitle, cannotCancelMessage);
      return;
    }

    setIsCancellingRide(true);
    Animated.timing(cancelButtonScale, {
      toValue: 0.94,
      duration: 130,
      useNativeDriver: true,
    }).start();

    alertService.showConfirmAlert(
      confirmTitle,
      confirmMessage,
      async () => {
        try {
          const result = await ridesService.cancelRide(rideId, cancelReason, cancelOptions);
          if (result.success) {
            onSuccess();
          } else {
            alertService.showErrorAlert(result.message || cancelErrorLabel);
          }
        } catch (error: any) {
          alertService.showErrorAlert(error?.message || cancelErrorLabel);
        } finally {
          resetCancelAnimation();
        }
      },
      () => {
        resetCancelAnimation();
        onCancel?.();
      },
      confirmLabel,
      continueLabel,
      true,
    );
  }, [
    isCancellingRide,
    canCancel,
    cannotCancelTitle,
    cannotCancelMessage,
    confirmTitle,
    confirmMessage,
    confirmLabel,
    continueLabel,
    cancelErrorLabel,
    rideId,
    cancelReason,
    cancelOptions,
    onSuccess,
    onCancel,
    resetCancelAnimation,
    cancelButtonScale,
  ]);

  return {
    isCancellingRide,
    cancelButtonScale,
    handleCancelRide,
  };
}
