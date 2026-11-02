import { useEffect, useState } from 'react';
import { subscribeRecurringRides } from '../../services/ride/recurringRidesService';
import type { RecurringRide } from '../../types/recurringRide';

export function useRecurringRides(userId?: string) {
  const [rides, setRides] = useState<RecurringRide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeRecurringRides(userId, (next) => {
      setRides(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [userId]);

  return { rides, loading };
}
