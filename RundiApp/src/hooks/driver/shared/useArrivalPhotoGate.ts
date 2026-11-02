import { useCallback, useEffect, useRef, useState } from 'react';
import designatedCrewService, { isArrivalPhotoFresh } from '../../../services/driver/designatedCrewService';

export function useArrivalPhotoGate(userId: string | undefined) {
  const [photo, setPhoto] = useState<{ path: string; takenAt: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const pendingRideIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    return designatedCrewService.subscribeArrivalPhoto(userId, setPhoto);
  }, [userId]);

  const runWithArrivalPhoto = useCallback(
    (isDesignated: boolean, action: () => void, rideId?: string) => {
      if (!isDesignated) {
        action();
        return;
      }
      pendingActionRef.current = action;
      pendingRideIdRef.current = rideId;
      setVisible(true);
    },
    [],
  );

  const onReady = useCallback(() => {
    setVisible(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    pendingRideIdRef.current = undefined;
    action?.();
  }, []);

  const onCancel = useCallback(() => {
    pendingActionRef.current = null;
    pendingRideIdRef.current = undefined;
    setVisible(false);
  }, []);

  return {
    modalProps: {
      visible,
      userId: userId ?? '',
      currentPath: isArrivalPhotoFresh(photo) ? photo!.path : null,
      rideId: pendingRideIdRef.current,
      onReady,
      onCancel,
    },
    runWithArrivalPhoto,
  };
}
