import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../../config/firebase';
import { FS_COL } from '../../../constants/firestore';
import { MIN_RECHARGE_BALANCE_REQUIRED } from '../../../utils/driver/driverHomeHelpers';
import { getRechargeSummary } from '../../../api/drivers';

interface RechargeFundsSummary {
  availableBalance: number;
  blocked: boolean;
  pendingRecharges?: number;
  pendingAmount?: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Saldo del conductor en vivo — doc REALTIME_driver_wallet/{uid} proyectado
 * por el consumer desde eventos driver.recharge (balance + pendientes).
 * Desbloqueo instantáneo al confirmar operaciones, sin refrescar la app.
 * Fallback REST una sola vez si el doc aún no fue proyectado (p.ej. saldo
 * anterior al feature).
 */
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
    let taskDone = false;
    const done = () => {
      if (!taskDone) {
        taskDone = true;
        markTaskCompleted('penaltySummary');
      }
    };

    const fallbackRest = async () => {
      try {
        const { balance } = await getRechargeSummary(1);
        if (!isMounted) return;
        const normalized = num(balance);
        setRechargeFundsSummary({
          availableBalance: normalized,
          blocked: normalized <= MIN_RECHARGE_BALANCE_REQUIRED,
        });
      } catch (err) {
        if (!isMounted) return;
        console.warn('⚠️ [DriverHomeScreenNewDesign] Error leyendo balance:', err);
        setRechargeFundsSummary((prev) => prev ?? { availableBalance: 0, blocked: false });
      } finally {
        done();
      }
    };

    let unsub: (() => void) | undefined;
    void (async () => {
      const walletRef = doc(await getFirebaseFirestore(), FS_COL.driverWallet, userId);
      if (!isMounted) return;
      unsub = onSnapshot(
        walletRef,
        (snap) => {
          if (!isMounted) return;
          if (!snap.exists()) {
            void fallbackRest();
            return;
          }
          const d = snap.data();
          const balance = num(d.balance);
          setRechargeFundsSummary({
            availableBalance: balance,
            blocked: balance <= MIN_RECHARGE_BALANCE_REQUIRED,
            pendingRecharges: num(d.pendingRecharges),
            pendingAmount: num(d.pendingAmount),
          });
          done();
        },
        (err) => {
          if (!isMounted) return;
          console.warn('⚠️ [DriverHomeScreenNewDesign] Error en wallet listener:', err);
          void fallbackRest();
        },
      );
    })();

    return () => {
      isMounted = false;
      unsub?.();
    };
  }, [userId, markTaskCompleted]);

  return { rechargeFundsSummary, setRechargeFundsSummary };
}
