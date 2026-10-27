import { useCallback, useEffect, useRef, useState } from 'react';
import designatedCrewService, { isArrivalPhotoFresh } from '../../../services/designatedCrewService';

export function useArrivalPhotoGate(userId: string | undefined) {
  const [photo, setPhoto] = useState<{ path: string; takenAt: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userId) return;
    return designatedCrewService.subscribeArrivalPhoto(userId, setPhoto);
  }, [userId]);

  const runWithArrivalPhoto = useCallback(
    (isDesignated: boolean, action: () => void) => {
      if (!isDesignated) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setVisible(true);
    },
    [],
  );

  const onReady = useCallback(() => {
    setVisible(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, []);

  const onCancel = useCallback(() => {
    pendingActionRef.current = null;
    setVisible(false);
  }, []);

  return {
    modalProps: {
      visible,
      userId: userId ?? '',
      currentPath: isArrivalPhotoFresh(photo) ? photo!.path : null,
      onReady,
      onCancel,
    },
    runWithArrivalPhoto,
  };
}
