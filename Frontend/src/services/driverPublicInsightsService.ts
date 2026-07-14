import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

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

const isValidComplimentId = (value: string): value is DriverPublicInsightCompliment['id'] =>
  value === 'punctuality' ||
  value === 'cleanliness' ||
  value === 'communication' ||
  value === 'driving' ||
  value === 'safety' ||
  value === 'friendliness';

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
    const functions = await getFirebaseFunctions();
    const callable = httpsCallable<{ driverId: string; limit?: number }, any>(
      functions,
      'getDriverPublicInsights',
    );

    const result = await callable({
      driverId: resolvedDriverId,
      limit: options?.limit,
    });

    if (result?.data?.success) {
      const normalized: DriverPublicInsights = {
        driverId: String(result.data.driverId || resolvedDriverId),
        stats: {
          averageRating: Number(result.data?.stats?.averageRating || 0),
          totalRatings: Number(result.data?.stats?.totalRatings || 0),
          totalRides: Number(result.data?.stats?.totalRides || 0),
          totalEarnings: Number(result.data?.stats?.totalEarnings || 0),
          yearsOnPlatform: Number(result.data?.stats?.yearsOnPlatform || 0),
        },
        compliments: Array.isArray(result.data?.compliments)
          ? result.data.compliments
            .map((item: any) => {
              const id = String(item?.id || '');
              if (!isValidComplimentId(id)) return null;
              return {
                id,
                count: Number(item?.count || 0),
              };
            })
            .filter((item: DriverPublicInsightCompliment | null): item is DriverPublicInsightCompliment => item !== null)
          : [],
        reviews: Array.isArray(result.data?.reviews)
          ? result.data.reviews.map((item: any) => ({
              id: String(item?.id || ''),
              author: typeof item?.author === 'string' ? item.author : 'Passenger',
              comment: typeof item?.comment === 'string' ? item.comment : '',
              rating: Number(item?.rating || 5),
              createdAt: typeof item?.createdAt === 'number' ? item.createdAt : null,
            }))
          : [],
      };
      cache.set(resolvedDriverId, normalized);
      return normalized;
    }
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
