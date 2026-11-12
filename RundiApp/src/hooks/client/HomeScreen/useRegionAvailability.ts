import { useCallback, useState } from 'react';

export interface RegionStatus {
  checked: boolean;
  allowed: boolean;
  areaName?: string;
  message?: string;
  reasonCode?: string;
  serviceAreaId?: string | null;
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
  const [regionStatus, setRegionStatus] = useState<RegionStatus>(() => ({
    checked: !!initialRegion,
    allowed: initialRegion ? !!initialRegion.allowed : true,
    areaName: initialRegion?.areaName,
    message: initialRegion?.message,
    reasonCode: initialRegion?.reasonCode,
    serviceAreaId: initialRegion?.serviceAreaId ?? null,
  }));

  // Callers publish the result only after checking it is still current.
  const checkRegionForCoords = useCallback(async (latitude: number, longitude: number): Promise<RegionStatus> => {
    const { getRegionAvailability } = await import('../../../api/platform');
    const data = await getRegionAvailability(latitude, longitude);
    if (typeof data?.available !== 'boolean') throw new Error('Invalid region availability');
    return {
      checked: true,
      allowed: data.available,
      areaName: data.areaName,
      serviceAreaId: data.areaId || null,
    };
  }, []);

  return {
    regionStatus,
    serviceAreaId: regionStatus.serviceAreaId ?? null,
    setRegionStatus,
    checkRegionForCoords,
  };
}
