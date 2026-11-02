import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import driverOfferCacheService, { type DriverOfferCacheEntry } from '../../../services/driver/driverOfferCacheService';

export function useDriverOfferCache(userId: string | undefined) {
  const [offerCacheEntries, setOfferCacheEntries] = useState<DriverOfferCacheEntry[]>([]);

  const refreshOfferCache = useCallback(async () => {
    if (!userId) {
      setOfferCacheEntries([]);
      return;
    }
    try {
      const entries = await driverOfferCacheService.getAll(userId);
      setOfferCacheEntries(entries);
    } catch (error) {
      console.warn('[DriverHome] Failed to load offer cache', error);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      refreshOfferCache();
      return () => {};
    }, [refreshOfferCache]),
  );

  return { offerCacheEntries, refreshOfferCache };
}
