import { useEffect, useState } from 'react';
import earningsService from '../../../services/earningsService';

export function useDriverTodayStats(
  navigation: any,
  markTaskCompleted: (task: string) => void,
) {
  const [todayStats, setTodayStats] = useState({ trips: 0, earnings: 0 });

  useEffect(() => {
    let isMounted = true;
    let loading = false;

    const loadTodayStats = async () => {
      // El evento 'focus' también se dispara al montar — sin este guard,
      // la carga inicial y ese focus disparaban dos callables en paralelo.
      if (loading) return;
      loading = true;
      try {
        const response = await earningsService.getDriverEarnings('today');
        if (isMounted && response?.summary) {
          setTodayStats({
            trips: response.summary.totalRides ?? 0,
            earnings: response.summary.netEarnings ?? response.summary.totalEarnings ?? 0,
          });
        }
      } catch (err) {
        console.error('❌ [DriverHomeScreenNewDesign] Error cargando ganancias:', err);
      } finally {
        loading = false;
      }
    };

    loadTodayStats().finally(() => markTaskCompleted('todayStats'));
    const unsubscribe = navigation.addListener('focus', loadTodayStats);

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [navigation, markTaskCompleted]);

  return { todayStats };
}
