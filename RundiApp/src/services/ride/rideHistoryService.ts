/**
 * Ride History Service — v2 REST /v1/rides.
 */

import { getMyRides, getRideDetail } from '../../api/rides';
import type { RideSummary } from '../../api/rides';

// Adapta RideSummary (v2) al shape legacy que consumen las pantallas
// (snake_case de Supabase + campos camelCase de RTDB).
const normalizeRide = (r: RideSummary): any => ({
  ...r,
  // camelCase legacy
  clientId: r.clientId,
  driverId: r.driverId ?? null,
  followerId: r.followerDriverId ?? null,
  finalPrice: r.finalFare ?? r.estimatedPrice ?? 0,
  estimatedPrice: r.estimatedPrice ?? 0,
  clientSuggestedPrice: (r as any).clientSuggestedPrice,
  createdAt: r.requestedAt,
  completedAt: r.completedAt ?? null,
  // snake_case legacy (pantallas TodayRides/RideDetails)
  id: r.id,
  client_id: r.clientId,
  driver_id: r.driverId ?? null,
  origin_address: (r as any).originAddress ?? '',
  destination_address: (r as any).destinationAddress ?? '',
  estimated_distance: (r as any).estimatedDistance ?? 0,
  final_fare: r.finalFare ?? r.estimatedPrice ?? 0,
  created_at: r.requestedAt,
  completed_at: r.completedAt ?? null,
  status: r.status,
});

class RideHistoryService {
  /**
   * Obtener historial completo de viajes del usuario
   */
  async getRideHistory(limit: number = 50, _offset: number = 0) {
    try {
      const rides = await getMyRides({ limit });
      console.log(`✅ Historial obtenido: ${rides.length} viajes`);
      return rides.map(normalizeRide);
    } catch (error: any) {
      console.error('❌ Error obteniendo historial:', error.message);
      return [];
    }
  }

  /**
   * Obtener viajes del día (filtrado en cliente)
   */
  async getTodayRides() {
    try {
      const allRides = await this.getRideHistory(100, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayRides = allRides.filter((ride: any) => {
        const raw = ride.requestedAt ?? ride.createdAt;
        const rideDate = new Date(raw);
        rideDate.setHours(0, 0, 0, 0);
        return rideDate.getTime() === today.getTime();
      });

      console.log(`✅ Viajes de hoy: ${todayRides.length}`);
      return todayRides;
    } catch (error: any) {
      console.error('❌ Error obteniendo viajes del día:', error.message);
      return [];
    }
  }

  /**
   * Obtener estadísticas del conductor (calculadas en cliente)
   */
  async getDriverStats() {
    try {
      const allRides = await getMyRides({ role: 'driver', limit: 100 });

      const completedRides = allRides.filter((ride: any) => ride.status === 'completed');
      const totalEarnings = completedRides.reduce(
        (sum: number, ride: any) => sum + (ride.finalFare ?? ride.finalPrice ?? 0),
        0,
      );

      return {
        totalRides: completedRides.length,
        totalEarnings,
        averageRating: 0, // rating agregado viene de /drivers/me/stats, no del historial
      };
    } catch (error: any) {
      console.error('❌ Error obteniendo estadísticas:', error.message);
      return {
        totalRides: 0,
        totalEarnings: 0,
        averageRating: 0,
      };
    }
  }

  /**
   * Obtener detalles de un viaje específico
   */
  async getRideDetails(rideId: string) {
    try {
      const ride = await getRideDetail(rideId);
      return ride ? normalizeRide(ride) : null;
    } catch (error: any) {
      console.error('❌ Error obteniendo detalles del viaje:', error.message);
      throw error;
    }
  }
}

export default new RideHistoryService();
