import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { MIN_RECHARGE_BALANCE_REQUIRED } from '../../../utils/driver/driverHomeHelpers';
import { getRechargeSummary } from '../../../api/drivers';

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

    const refresh = async () => {
      try {
        // v2: el balance no está proyectado en DATA-MAIN_drivers — fuente de
        // verdad es REST /drivers/me/recharges. Refresh al entrar a foreground.
        const { balance } = await getRechargeSummary(1);
        if (!isMounted) return;
        const normalized = Number.isFinite(balance) ? balance : 0;
        setRechargeFundsSummary({
          availableBalance: normalized,
          blocked: normalized <= MIN_RECHARGE_BALANCE_REQUIRED,
        });
      } catch (err) {
        if (!isMounted) return;
        console.warn('⚠️ [DriverHomeScreenNewDesign] Error leyendo balance:', err);
        setRechargeFundsSummary((prev) => prev ?? { availableBalance: 0, blocked: false });
      } finally {
        if (isMounted) markTaskCompleted('penaltySummary');
      }
    };

    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, [userId, markTaskCompleted]);

  return { rechargeFundsSummary, setRechargeFundsSummary };
}
