import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { getPremiumStatus } from '../../utils/driver/premiumStatus';

type PremiumVehicle = {
  vehicleId: string;
  plate: string;
  ocrYear: number | null;
  premiumFrom: number | null;
  premiumGraceFrom: number | null;
  premiumUntil: number | null;
};

const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : null;

export function useActiveVehiclePremium(uid?: string) {
  const [vehicle, setVehicle] = useState<PremiumVehicle | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setVehicle(null);
    if (!uid) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void getFirebaseFirestore().then((db) => {
      if (!alive) return;
      unsubscribe = onSnapshot(doc(db, FS_COL.driversLive, uid, 'vehicles', 'active'), (snap) => {
        const data = snap.data();
        if (!data?.vehicleId) { setVehicle(null); return; }
        setVehicle({
          vehicleId: data.vehicleId,
          plate: data.plate ?? '',
          ocrYear: typeof data.ocrYear === 'number' ? data.ocrYear : null,
          premiumFrom: millis(data.premiumFrom),
          premiumGraceFrom: millis(data.premiumGraceFrom),
          premiumUntil: millis(data.premiumUntil),
        });
        setNow(Date.now());
      }, (err) => {
        setVehicle(null);
        console.warn('[Premium] Error leyendo vehículo activo:', err);
      });
    }).catch((err) => console.warn('[Premium] Error inicializando Firestore:', err));
    return () => { alive = false; unsubscribe?.(); };
  }, [uid]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);

  return { vehicle, ...getPremiumStatus(
    vehicle?.premiumFrom ?? null, vehicle?.premiumGraceFrom ?? null, vehicle?.premiumUntil ?? null, now,
  ) };
}
