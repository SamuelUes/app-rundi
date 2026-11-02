import { getDriverPublicInsights } from '../../api/ratings';

export interface DriverPublicInsightReview {
  id: string;
  author: string;
  comment: string;
  rating: number;
  createdAt: number | null;
}

export interface DriverPublicInsightCompliment {
  id: 'punctuality' | 'cleanliness' | 'communication' | 'driving' | 'safety' | 'friendliness';
  count: number;
}

export interface DriverPublicInsights {
  driverId: string;
  stats: {
    averageRating: number;
    totalRatings: number;
    totalRides: number;
    totalEarnings: number;
    yearsOnPlatform: number;
  };
  compliments: DriverPublicInsightCompliment[];
  reviews: DriverPublicInsightReview[];
}

const cache = new Map<string, DriverPublicInsights | null>();

export async function fetchDriverPublicInsights(
  driverId?: string | null,
  options?: { forceRefresh?: boolean; limit?: number },
): Promise<DriverPublicInsights | null> {
  const resolvedDriverId = typeof driverId === 'string' ? driverId.trim() : '';
  if (!resolvedDriverId) return null;

  if (!options?.forceRefresh && cache.has(resolvedDriverId)) {
    return cache.get(resolvedDriverId) ?? null;
  }

  try {
    // v2: GET /v1/ratings/driver/{id}/insights — sin compliments/earnings públicos.
    const data = await getDriverPublicInsights(resolvedDriverId, options?.limit ?? 10);

    const reviews: DriverPublicInsightReview[] = (data.recentComments || []).map((item, idx) => ({
      id: `${resolvedDriverId}:${idx}`,
      author: typeof item?.fromName === 'string' && item.fromName ? item.fromName : 'Passenger',
      comment: typeof item?.comment === 'string' ? item.comment : '',
      rating: Number(item?.rating || 5),
      createdAt: item?.createdAt ? Date.parse(item.createdAt) || null : null,
    }));

    const normalized: DriverPublicInsights = {
      driverId: data.driver?.userId || resolvedDriverId,
      stats: {
        averageRating: Number(data.driver?.averageRating || 0),
        totalRatings: reviews.length,
        totalRides: Number(data.driver?.totalRides || 0),
        totalEarnings: 0,
        yearsOnPlatform: 0,
      },
      compliments: [],
      reviews,
    };
    cache.set(resolvedDriverId, normalized);
    return normalized;
  } catch (error) {
    console.warn('[driverPublicInsightsService] Error obteniendo insights:', error);
  }

  return null;
}

export function clearDriverPublicInsightsCache(driverId?: string) {
  if (!driverId) {
    cache.clear();
    return;
  }
  cache.delete(driverId);
}
