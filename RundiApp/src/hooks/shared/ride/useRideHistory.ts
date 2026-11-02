import { useState, useEffect, useCallback } from 'react';
import ridesService from '../../../services/ride/ridesService';
import { formatNicaraguaRelativeDate } from '../../../utils/format/dateUtils';

export type RideFilter = 'all' | 'completed' | 'canceled';

export function useRideHistory(userId: string | undefined, userType?: 'client' | 'driver') {
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<RideFilter>('all');

  const loadRides = useCallback(async () => {
    try {
      if (!userId) return;
      setLoading(true);
      const data = await ridesService.getMyRides(userId, userType);
      if (data && Array.isArray(data)) {
        let filtered = data;
        if (filter === 'completed') {
          filtered = data.filter((r: any) => r.status === 'completed');
        } else if (filter === 'canceled') {
          filtered = data.filter((r: any) => r.status === 'canceled');
        }
        setRides(filtered);
      }
    } catch (error) {
      console.error('Error loading rides:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, userType, filter]);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadRides();
  }, [loadRides]);

  const getStatusColor = useCallback((status: string): string => {
    const colorMap: Record<string, string> = {
      completed: '#4CAF50',
      canceled: '#F44336',
      requested: '#FF9800',
      accepted: '#2196F3',
      started: '#9C27B0',
      in_progress: '#FF9800',
    };
    return colorMap[status] || '#757575';
  }, []);

  const formatDate = useCallback((dateString: any, fallback: string = 'N/A'): string => {
    if (!dateString || typeof dateString === 'object') return fallback;
    try {
      const formatted = formatNicaraguaRelativeDate(dateString);
      return typeof formatted === 'string' ? formatted : fallback;
    } catch {
      return fallback;
    }
  }, []);

  return {
    rides,
    loading,
    refreshing,
    filter,
    setFilter,
    loadRides,
    handleRefresh,
    getStatusColor,
    formatDate,
  };
}
