import { useEffect, useState } from 'react';

export function useDriverLocations(serviceAreaId: string | null) {
  const [driverLocations, setDriverLocations] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { getDatabase, ref, onValue, off } = await import('firebase/database');
      const db = getDatabase();
      const path = serviceAreaId ? `driverLocationsByArea/${serviceAreaId}` : 'driverLocations';
      const locRef = ref(db, path);
      onValue(locRef, (snap) => {
        if (!mounted) return;
        const val = snap.val();
        setDriverLocations(val && typeof val === 'object' ? val : null);
      });
      cleanup = () => {
        try { off(locRef); } catch {}
      };
    })();

    return () => {
      mounted = false;
      if (cleanup) cleanup();
    };
  }, [serviceAreaId]);

  return { driverLocations, setDriverLocations };
}
