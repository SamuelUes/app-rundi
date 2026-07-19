import { useEffect, useState } from 'react';
import { parseBlockedFlag, MIN_RECHARGE_BALANCE_REQUIRED } from '../../../utils/driverHomeHelpers';

interface RechargeFundsSummary {
  availableBalance: number;
  blocked: boolean;
}

export function useDriverWalletListener(
  userId: string | undefined,
  initialSummary: RechargeFundsSummary | null,
  markTaskCompleted: (task: string) => void,
) {
  const [rechargeFundsSummary, setRechargeFundsSummary] = useState<RechargeFundsSummary | null>(initialSummary);

  useEffect(() => {
    if (!userId) {
      markTaskCompleted('penaltySummary');
      return;
    }

    let isMounted = true;
    let cleanup: null | (() => void) = null;

    (async () => {
      try {
        const { initializeFirebase } = await import('../../../config/firebase');
        const { getDatabase, ref: dbRef, onValue, off } = await import('firebase/database');

        const { app } = await initializeFirebase();
        if (!app) {
          console.error('❌ [DriverHomeScreenNewDesign] Firebase no inicializado');
          markTaskCompleted('penaltySummary');
          return;
        }

        const db = getDatabase(app);
        const walletRef = dbRef(db, `drivers/${userId}/wallet`);

        const handleSnapshot = (snapshot: any) => {
          if (!isMounted) return;
          const data = snapshot.val();

          if (!data) {
            setRechargeFundsSummary((prev) => prev ?? { availableBalance: 0, blocked: false });
            markTaskCompleted('penaltySummary');
            return;
          }

          const availableBalance = Number(
            data.availableBalance ??
              data.available_balance ??
              data.balance ??
              data.current_recharge_balance ??
              data.currentBalance ??
              data.currentRechargeBalance ??
              0,
          );
          const normalizedBalance = Number.isFinite(availableBalance) ? availableBalance : 0;
          const explicitBlocked = parseBlockedFlag(data.blocked);

          setRechargeFundsSummary({
            availableBalance: normalizedBalance,
            blocked: explicitBlocked ?? normalizedBalance <= MIN_RECHARGE_BALANCE_REQUIRED,
          });
          markTaskCompleted('penaltySummary');
        };

        onValue(walletRef, handleSnapshot, (err) => {
          console.error('❌ [DriverHomeScreenNewDesign] Error escuchando drivers wallet:', err);
          if (isMounted) {
            setRechargeFundsSummary((prev) => prev ?? { availableBalance: 0, blocked: false });
          }
          markTaskCompleted('penaltySummary');
        });

        cleanup = () => off(walletRef, 'value', handleSnapshot);
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error iniciando listener de fondos:', err);
        if (isMounted) {
          setRechargeFundsSummary((prev) => prev ?? { availableBalance: 0, blocked: false });
        }
        markTaskCompleted('penaltySummary');
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, [userId, markTaskCompleted]);

  return { rechargeFundsSummary, setRechargeFundsSummary };
}
