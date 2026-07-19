import { useCallback, useState } from 'react';
import earningsService from '../../../services/earningsService';
import type { DriverStats } from '../../driver/DriverProfileScreen/useDriverProfile';

export interface DailyStats {
  rides: number;
  earnings: number;
}

export function useDriverEarnings() {
  const [dailyStats, setDailyStats] = useState<DailyStats>({ rides: 0, earnings: 0 });
  const [stats, setStats] = useState<DriverStats>({
    totalRides: 0,
    totalEarnings: 0,
    averageRating: 5.0,
    completionRate: 100,
  });

  const loadEarningsStats = useCallback(async () => {
    try {
      const [todayResponse, totalsResponse] = await Promise.all([
        earningsService.getDriverEarnings('today'),
        earningsService.getDriverStats(),
      ]);

      if (todayResponse?.summary) {
        setDailyStats({
          rides: todayResponse.summary.totalRides ?? 0,
          earnings:
            todayResponse.summary.netEarnings ?? todayResponse.summary.totalEarnings ?? 0,
        });
      } else {
        setDailyStats({ rides: 0, earnings: 0 });
      }

      if (totalsResponse) {
        setStats((prev) => ({
          ...prev,
          totalRides: totalsResponse.totalRides ?? prev.totalRides ?? 0,
          totalEarnings:
            totalsResponse.totalNetEarnings ?? totalsResponse.totalEarnings ?? prev.totalEarnings ?? 0,
        }));
      }
    } catch (error) {
      console.error('Error cargando estadísticas de ganancias del conductor:', error);
    }
  }, []);

  return {
    dailyStats,
    stats,
    setStats,
    loadEarningsStats,
  };
}
