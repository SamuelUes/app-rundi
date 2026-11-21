import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { findDateIssues, type PrivateDocumentSnapshot } from '../../../utils/driver/complianceDates';

export function useDriverDocumentDates(userId?: string) {
  const [snapshot, setSnapshot] = useState<{ userId: string; data: PrivateDocumentSnapshot } | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setSnapshot(null);
    if (!userId) return;
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    void getFirebaseFirestore().then((db) => {
      if (stopped) return;
      unsubscribe = onSnapshot(doc(db, FS_COL.driversLive, userId, 'private', 'documents'),
        (result) => {
          if (!stopped) setSnapshot(result.exists()
            ? { userId, data: result.data() as PrivateDocumentSnapshot } : null);
        },
        () => { if (!stopped) setSnapshot(null); });
    }).catch(() => { if (!stopped) setSnapshot(null); });
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [userId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const time = Date.now();
      setNow(new Date(time));
      clearTimeout(timer);
      const day = 24 * 60 * 60 * 1000;
      const offset = 6 * 60 * 60 * 1000;
      const nextMidnight = (Math.floor((time - offset) / day) + 1) * day + offset;
      timer = setTimeout(refresh, nextMidnight - time + 1000);
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []);

  return useMemo(() => findDateIssues(snapshot && snapshot.userId === userId ? snapshot.data : null, now), [snapshot, now, userId]);
}
