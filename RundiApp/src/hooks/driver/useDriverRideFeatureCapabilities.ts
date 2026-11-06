import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { useActiveVehiclePremium } from './useActiveVehiclePremium';

export function useDriverRideFeatureCapabilities(
  userId: string | undefined,
  _vehicleId: string | null,
) {
  const [driverFeatureCodes, setDriverFeatureCodes] = useState<string[]>([]);
  const [vehicleFeatureCodes, setVehicleFeatureCodes] = useState<string[]>([]);
  const premium = useActiveVehiclePremium(userId);

  useEffect(() => {
    if (!userId) {
      setDriverFeatureCodes([]);
      setVehicleFeatureCodes([]);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    setDriverFeatureCodes([]);
    setVehicleFeatureCodes([]);
    void getFirebaseFirestore().then((db) => {
      if (cancelled) return;
      unsubscribe = onSnapshot(doc(db, FS_COL.drivers, userId), (snapshot) => {
        const raw = snapshot.data()?.features;
        const features = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
        setDriverFeatureCodes(features.filter((code) => code !== 'premium'));
        setVehicleFeatureCodes(features.filter((code) => code === 'premium'));
      }, (error) => {
        console.warn('[RideFeatures] No se pudieron obtener las capacidades:', error);
        setDriverFeatureCodes([]);
        setVehicleFeatureCodes([]);
      });
    }).catch((error) => console.warn('[RideFeatures] Error inicializando Firestore:', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId]);

  const effectiveVehicleFeatures = useMemo(() => {
    const nonPremium = vehicleFeatureCodes.filter((code) => code !== 'premium');
    return premium.vehicle && premium.eligible ? [...nonPremium, 'premium'] : nonPremium;
  }, [vehicleFeatureCodes, premium.vehicle, premium.eligible]);
  return {
    driverFeatureCodes,
    premium,
    vehicleFeatureCodes: effectiveVehicleFeatures,
  };
}
