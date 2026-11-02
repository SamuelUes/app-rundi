import {
  getDriverPublicInsights,
  getDriverRatings as getDriverRatingsV2,
  submitRating,
} from '../../api/ratings';
import { sqlRideIdForTrip } from '../../live/tripIds';

export type RatingCategoryKey =
  | 'punctuality'
  | 'cleanliness'
  | 'communication'
  | 'driving'
  | 'safety'
  | 'friendliness';

export interface SubmitRideRatingInput {
  rideId: string;
  rating: number;
  comment?: string;
  punctuality?: number;
  cleanliness?: number;
  communication?: number;
  driving?: number;
  safety?: number;
  friendliness?: number;
  targetRole?: 'driver' | 'captain' | 'follower' | 'client';
  finalize?: boolean;
  /** Requerido por v2: destinatario de la calificación. */
  toUserId?: string;
}

export interface DriverRatingItem {
  id: string;
  rating: number;
  comment?: string;
  fromUserId?: string;
  createdAt?: string | number;
}

export interface DriverRatingsResponse {
  success: boolean;
  ratings: DriverRatingItem[];
  averageRating: number;
  totalRatings: number;
  categoryAverages?: Record<string, number>;
}

class RatingService {
  async submitRideRating(input: SubmitRideRatingInput): Promise<void> {
    if (!input.toUserId) {
      console.warn('[ratingService] submitRideRating sin toUserId — v2 lo requiere');
      return;
    }
    const sqlRideId = await sqlRideIdForTrip(input.rideId);
    await submitRating({
      rideId: sqlRideId,
      toUserId: input.toUserId,
      ratedRole: input.targetRole ?? 'driver',
      rating: input.rating,
      comment: input.comment,
      punctuality: input.punctuality,
      cleanliness: input.cleanliness,
      communication: input.communication,
      driving: input.driving,
      safety: input.safety,
      friendliness: input.friendliness,
      finalize: input.finalize,
    });
  }

  async skipRideRating(rideId: string): Promise<void> {
    // v2: rating_skipped vía submit con skip (requiere toUserId del viaje).
    // Sin toUserId disponible aquí, se omite sin fila — el flujo cierra por timeout del backend.
    console.warn('[ratingService.skipRideRating] skip sin toUserId — rating queda pendiente', { rideId });
  }

  async getDriverRatings(driverId: string): Promise<DriverRatingsResponse> {
    const [ratings, insights] = await Promise.all([
      getDriverRatingsV2(driverId, 30),
      getDriverPublicInsights(driverId, 1).catch(() => null),
    ]);
    const items: DriverRatingItem[] = ratings.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment ?? undefined,
      fromUserId: r.fromUserId,
      createdAt: r.createdAt,
    }));
    const average = insights?.driver.averageRating ??
      (items.length ? items.reduce((a, r) => a + r.rating, 0) / items.length : 0);
    return {
      success: true,
      ratings: items,
      averageRating: average,
      totalRatings: items.length,
    };
  }

  async getRecentRatings(driverId: string, limit: number = 10): Promise<{ success: boolean; ratings: DriverRatingItem[] }> {
    const ratings = await getDriverRatingsV2(driverId, limit);
    return {
      success: true,
      ratings: ratings.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment ?? undefined,
        fromUserId: r.fromUserId,
        createdAt: r.createdAt,
      })),
    };
  }

  async getUserRating(userId: string): Promise<any> {
    console.warn('[ratingService.getUserRating] No existe en v2.', { userId });
    throw new Error('getUserRating no está disponible en el backend actual');
  }

  async getRideRatings(rideId: string): Promise<any> {
    console.warn('[ratingService.getRideRatings] No existe en v2.', { rideId });
    throw new Error('getRideRatings no está disponible en el backend actual');
  }
}

const ratingService = new RatingService();

export default ratingService;
