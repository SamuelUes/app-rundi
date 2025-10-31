/**
 * RatingRepository - Data Access Layer para calificaciones
 */

import Rating from '../models/Rating';
import { fn, col } from 'sequelize';

export class RatingRepository {
  async create(data: any) {
    return await Rating.create(data);
  }

  async findByRideId(rideId: string) {
    return await Rating.findAll({
      where: { ride_id: rideId },
    });
  }

  async findByUserId(userId: string) {
    return await Rating.findAll({
      where: { to_user_id: userId },
    });
  }

  async getAverageRating(userId: string) {
    const result = await Rating.findOne({
      attributes: [
        [fn('AVG', col('rating')), 'averageRating'],
        [fn('COUNT', col('id')), 'totalRatings'],
      ],
      where: { to_user_id: userId },
      raw: true,
    });
    return result;
  }

  async checkIfRated(rideId: string, fromUserId: string) {
    return await Rating.findOne({
      where: { ride_id: rideId, from_user_id: fromUserId },
    });
  }

  async getRecentRatings(userId: string, limit: number = 10) {
    return await Rating.findAll({
      where: { to_user_id: userId },
      order: [['created_at', 'DESC']],
      limit,
    });
  }

  async getCategoryAverages(userId: string) {
    const result = await Rating.findOne({
      attributes: [
        [fn('AVG', col('punctuality')), 'avgPunctuality'],
        [fn('AVG', col('cleanliness')), 'avgCleanliness'],
        [fn('AVG', col('communication')), 'avgCommunication'],
        [fn('AVG', col('driving')), 'avgDriving'],
        [fn('AVG', col('safety')), 'avgSafety'],
        [fn('AVG', col('friendliness')), 'avgFriendliness'],
      ],
      where: { to_user_id: userId },
      raw: true,
    });
    return result;
  }
}
