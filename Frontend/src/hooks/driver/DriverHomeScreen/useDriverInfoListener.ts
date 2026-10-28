import { useEffect, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../../utils/vehicleIcons';
import { resolveDocumentPhotoUrl } from '../../../services/supabaseStorage';

export function useDriverInfoListener(
  userId: string | undefined,
  markTaskCompleted: (task: string) => void,
) {
  const [currentVehicleType, setCurrentVehicleType] = useState<string | null>(null);
  const [currentVehicleId, setCurrentVehicleId] = useState<string | null>(null);
  const [currentVehicleIconSource, setCurrentVehicleIconSource] = useState<ImageSourcePropType | undefined>(undefined);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const driverInfoCacheRef = useRef<Record<string, any>>({});

  useEffect(() => {
    if (!userId) {
      markTaskCompleted('driverInfo');
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');
        const db = getDatabase();
        const driversInfoRef = dbRef(db, 'driversInfo');

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;
          const data = snapshot.val() || {};
          driverInfoCacheRef.current = data;

          if (userId) {
            const myInfo = data[userId];
            const vehicleType = extractVehicleTypeFromInfo(myInfo);
            setCurrentVehicleType(vehicleType);
            const vehicleId = myInfo?.vehicle?.id ?? myInfo?.currentVehicle?.id;
            setCurrentVehicleId(typeof vehicleId === 'string' ? vehicleId : null);
            setCurrentVehicleIconSource(vehicleType ? ensureVehicleIconSource(vehicleType) : undefined);

            const rawPhoto =
              typeof myInfo?.profilePhoto === 'string' && myInfo.profilePhoto.trim()
                ? myInfo.profilePhoto
                : typeof myInfo?.photoURL === 'string' && myInfo.photoURL.trim()
                  ? myInfo.photoURL
                  : null;
            resolveDocumentPhotoUrl(rawPhoto)
              .then((resolved) => {
                if (isMounted) setProfilePhotoUri(resolved);
              })
              .catch(() => {});
          }

          markTaskCompleted('driverInfo');
        };

        onValue(driversInfoRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando driversInfo:', err);
          markTaskCompleted('driverInfo');
        });

        cleanup = () => off(driversInfoRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de driversInfo:', err);
        markTaskCompleted('driverInfo');
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [userId, markTaskCompleted]);

  return {
    currentVehicleType,
    currentVehicleId,
    currentVehicleIconSource,
    driverInfoCacheRef,
    profilePhotoUri,
  };
}
