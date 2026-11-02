import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

interface RegionStatus {
  checked: boolean;
  allowed: boolean;
  areaName?: string;
  message?: string;
  reasonCode?: string;
}

export function useRegionAvailability(
  initialRegion: {
    allowed?: boolean;
    areaName?: string;
    message?: string;
    reasonCode?: string;
    serviceAreaId?: string | null;
  } | null,
) {
  const [isOutsideSupportedArea, setIsOutsideSupportedArea] = useState(
    initialRegion ? !initialRegion.allowed : false,
  );
  const [regionStatus, setRegionStatus] = useState<RegionStatus>(() => ({
    checked: !!initialRegion,
    allowed: initialRegion ? !!initialRegion.allowed : true,
    areaName: initialRegion?.areaName,
    message: initialRegion?.message,
    reasonCode: initialRegion?.reasonCode,
  }));
  const [serviceAreaId, setServiceAreaId] = useState<string | null>(initialRegion?.serviceAreaId ?? null);

  const updateRegionForCoords = useCallback(async (latitude: number, longitude: number) => {
    try {
      const { getRegionAvailability } = await import('../../../api/platform');
      const { getFirebaseAuth } = await import('../../../config/firebase');

      const auth = await getFirebaseAuth();
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        console.warn('[useRegionAvailability] No hay sesión Firebase Auth; omitiendo verificación');
        return;
      }

      try {
        await firebaseUser.getIdToken(true);
      } catch (tokenError) {
        console.warn('[useRegionAvailability] No se pudo refrescar token:', tokenError);
      }

      const res = await getRegionAvailability(latitude, longitude);
      const data: any = { ...res, allowed: res?.available, serviceAreaId: res?.areaId };
      const allowed = !!data?.allowed;

      setRegionStatus({
        checked: true,
        allowed,
        areaName: typeof data?.areaName === 'string' ? data.areaName : undefined,
        message: typeof data?.message === 'string' ? data.message : undefined,
        reasonCode: typeof data?.reasonCode === 'string' ? data.reasonCode : undefined,
      });

      const nextServiceAreaId =
        typeof data?.serviceAreaId === 'string' && data.serviceAreaId.trim().length > 0
          ? data.serviceAreaId.trim()
          : null;

      setServiceAreaId(nextServiceAreaId);
      setIsOutsideSupportedArea(!allowed);
    } catch (error: any) {
      console.error(
        '❌ [useRegionAvailability] Error verificando región (HTTP):',
        (error && (error.response?.data || error.message)) || error,
      );
    }
  }, []);

  return {
    isOutsideSupportedArea,
    regionStatus,
    serviceAreaId,
    setServiceAreaId,
    updateRegionForCoords,
  };
}
