import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

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
  targetRole?: 'captain' | 'follower';
  finalize?: boolean;
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
  private functions: any = null;

  private async getFunctions() {
    if (!this.functions) {
      this.functions = await getFirebaseFunctions();
    }
    return this.functions;
  }

  async submitRideRating(input: SubmitRideRatingInput): Promise<void> {
    const functions = await this.getFunctions();
    const submitRatingFunction = httpsCallable(functions, 'submitRating');

    await submitRatingFunction({
      rideId: input.rideId,
      rating: input.rating,
      comment: input.comment,
      punctuality: input.punctuality,
      cleanliness: input.cleanliness,
      communication: input.communication,
      driving: input.driving,
      safety: input.safety,
      friendliness: input.friendliness,
      targetRole: input.targetRole,
      finalize: input.finalize,
    });
  }

  async skipRideRating(rideId: string): Promise<void> {
    console.warn('[ratingService.skipRideRating] Callable deprecated/missing in backend. No-op compatibility path.', {
      rideId,
    });
  }

  async getDriverRatings(driverId: string): Promise<DriverRatingsResponse> {
    const functions = await this.getFunctions();
    const getDriverRatingsFunction = httpsCallable(functions, 'getDriverRatings');
    const response = await getDriverRatingsFunction({ driverId });
    return response.data as DriverRatingsResponse;
  }

  async getRecentRatings(driverId: string, limit: number = 10): Promise<{ success: boolean; ratings: DriverRatingItem[] }> {
    const functions = await this.getFunctions();
    const getRecentRatingsFunction = httpsCallable(functions, 'getRecentRatings');
    const response = await getRecentRatingsFunction({ driverId, limit });
    return response.data as { success: boolean; ratings: DriverRatingItem[] };
  }

  async getUserRating(userId: string): Promise<any> {
    console.warn('[ratingService.getUserRating] Callable deprecated/missing in backend.', { userId });
    throw new Error('getUserRating no está disponible en el backend actual');
  }

  async getRideRatings(rideId: string): Promise<any> {
    console.warn('[ratingService.getRideRatings] Callable deprecated/missing in backend.', { rideId });
    throw new Error('getRideRatings no está disponible en el backend actual');
  }
}

const ratingService = new RatingService();

export default ratingService;
