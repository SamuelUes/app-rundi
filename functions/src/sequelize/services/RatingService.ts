/**
 * RatingService - Business Logic Layer para calificaciones
 */

import { RatingRepository } from '../repositories/RatingRepository';
import { DriverRepository } from '../repositories/DriverRepository';

export class RatingService {
  private ratingRepo = new RatingRepository();
  private driverRepo = new DriverRepository();

  async submitRating(data: any) {
    const existing = await this.ratingRepo.checkIfRated(
      data.ride_id,
      data.from_user_id
    );
    if (existing) {
      throw new Error('Ya has calificado este viaje');
    }

    const rating = await this.ratingRepo.create({
      ...data,
      created_at: new Date(),
    });

    // Actualizar promedio del conductor
    const avgRating = await this.ratingRepo.getAverageRating(data.to_user_id) as any;
    if (avgRating) {
      await this.driverRepo.updateByUserId(data.to_user_id, {
        average_rating: avgRating.averageRating || 0,
      });
    }

    console.log(`⭐ Calificación registrada: ${rating.id}`);
    return rating;
  }

  async getDriverRatings(driverId: string) {
    return await this.ratingRepo.findByUserId(driverId);
  }

  async getAverageRating(driverId: string) {
    return await this.ratingRepo.getAverageRating(driverId);
  }

  async getCategoryAverages(driverId: string) {
    return await this.ratingRepo.getCategoryAverages(driverId);
  }

  async getRecentRatings(driverId: string, limit: number = 10) {
    return await this.ratingRepo.getRecentRatings(driverId, limit);
  }
}
