import { useEffect, useState } from 'react';

export function useDriverLocations(serviceAreaId: string | null) {
  const [driverLocations, setDriverLocations] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { collection, onSnapshot, query, where } = await import('firebase/firestore');
      const { getFirebaseFirestore } = await import('../../../config/firebase');
      const { FS_COL } = await import('../../../constants/firestore');
      const db = await getFirebaseFirestore();
      const locQuery = serviceAreaId
        ? query(
            collection(db, FS_COL.driversLive),
            where('status', '==', 'online'),
            where('serviceAreaId', '==', serviceAreaId),
          )
        : query(collection(db, FS_COL.driversLive), where('status', '==', 'online'));
      const unsub = onSnapshot(locQuery, (snap) => {
        if (!mounted) return;
        const val: Record<string, any> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          val[d.id] = { ...data, latitude: data?.location?.latitude, longitude: data?.location?.longitude };
        });
        setDriverLocations(val);
      });
      cleanup = () => unsub();
    })();

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [serviceAreaId]);

  return { driverLocations, setDriverLocations };
}
