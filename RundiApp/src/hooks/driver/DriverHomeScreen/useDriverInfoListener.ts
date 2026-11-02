import { useEffect, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { extractVehicleTypeFromInfo, ensureVehicleIconSource } from '../../../utils/driver/vehicleIcons';
import { resolveDocumentPhotoUrl } from '../../../services/media/storageService';

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
    const unsubs: Array<() => void> = [];

    (async () => {
      try {
        const db = await getFirebaseFirestore();

        // Perfil proyectado del conductor → DATA-MAIN_drivers/{uid}
        unsubs.push(
          onSnapshot(
            doc(db, FS_COL.drivers, userId),
            (snap) => {
              if (!isMounted) return;
              const myInfo: any = snap.exists() ? { id: snap.id, ...snap.data() } : null;
              driverInfoCacheRef.current[userId] = myInfo;

              const rawPhoto =
                typeof myInfo?.photoUrl === 'string' && myInfo.photoUrl.trim()
                  ? myInfo.photoUrl
                  : typeof myInfo?.profilePhoto === 'string' && myInfo.profilePhoto.trim()
                    ? myInfo.profilePhoto
                    : null;
              resolveDocumentPhotoUrl(rawPhoto)
                .then((resolved) => {
                  if (isMounted) setProfilePhotoUri(resolved);
                })
                .catch(() => {});

              markTaskCompleted('driverInfo');
            },
            (err) => {
              console.error('❌ [DriverHomeScreenNewDesign] Error escuchando drivers:', err);
              markTaskCompleted('driverInfo');
            },
          ),
        );

        // Vehículo activo → DATA-MAIN_vehicles where driverUid==uid && isActive
        unsubs.push(
          onSnapshot(
            query(
              collection(db, FS_COL.vehicles),
              where('driverUid', '==', userId),
              where('isActive', '==', true),
            ),
            (snap) => {
              if (!isMounted) return;
              const vehicle: any = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
              const vehicleType = extractVehicleTypeFromInfo({ vehicle });
              setCurrentVehicleType(vehicleType);
              setCurrentVehicleId(vehicle?.id ?? null);
              setCurrentVehicleIconSource(vehicleType ? ensureVehicleIconSource(vehicleType) : undefined);
            },
            (err) => {
              console.error('❌ [DriverHomeScreenNewDesign] Error escuchando vehicles:', err);
            },
          ),
        );
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de drivers:', err);
        markTaskCompleted('driverInfo');
      }
    })();

    return () => {
      isMounted = false;
      unsubs.forEach((u) => u());
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
