import { useState, useEffect, useCallback } from 'react';
import earningsService, {
  EarningsSummary,
  RideEarning,
  DriverStats,
} from '../../../services/driver/earningsService';

type Period = 'today' | 'week' | 'month';

export function useEarningsScreenData(selectedPeriod: Period) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [rides, setRides] = useState<RideEarning[]>([]);
  const [stats, setStats] = useState<DriverStats | null>(null);

  const loadEarnings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await earningsService.getDriverEarnings(selectedPeriod);
      setSummary(data.summary);
      setRides(data.rides || []);
    } catch (error: any) {
      console.error('Error cargando ganancias:', error);
      setSummary(null);
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  const loadStats = useCallback(async () => {
    try {
      const statsData = await earningsService.getDriverStats();
      setStats(statsData);
    } catch (error: any) {
      console.error('Error cargando estadísticas:', error);
    }
  }, []);

  useEffect(() => {
    loadEarnings();
    loadStats();
  }, [loadEarnings, loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadEarnings(), loadStats()]);
    setRefreshing(false);
  }, [loadEarnings, loadStats]);

  return {
    loading,
    refreshing,
    summary,
    rides,
    stats,
    onRefresh,
  };
}
