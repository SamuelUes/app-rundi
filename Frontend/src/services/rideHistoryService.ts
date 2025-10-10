/**
 * Ride History Service
 * Servicio para obtener historial de viajes desde Supabase PostgreSQL
 */

import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

class RideHistoryService {
  /**
   * Obtener historial completo de viajes del usuario
   */
  async getRideHistory(limit: number = 50, offset: number = 0) {
    try {
      // Usar Firebase Callable Function que consulta Supabase
      const getMyRides = httpsCallable(functions, 'getMyRides');
      const response = await getMyRides({ limit, offset });
      
      const result = response.data as { success: boolean; rides: any[] };
      
      if (result.success) {
        console.log(`✅ Historial obtenido: ${result.rides.length} viajes`);
        return result.rides;
      } else {
        console.warn('⚠️ No se pudieron obtener los viajes');
        return [];
      }
    } catch (error: any) {
      console.error('❌ Error obteniendo historial:', error.message);
      // Retornar array vacío en lugar de lanzar error
      return [];
    }
  }

  /**
   * Obtener viajes del día (filtrado en cliente)
   */
  async getTodayRides() {
    try {
      const allRides = await this.getRideHistory(100, 0);
      
      // Filtrar viajes de hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayRides = allRides.filter((ride: any) => {
        const rideDate = new Date(ride.createdAt);
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
      const allRides = await this.getRideHistory(1000, 0);
      
      // Calcular estadísticas
      const completedRides = allRides.filter((ride: any) => ride.status === 'completed');
      const totalEarnings = completedRides.reduce((sum: number, ride: any) => sum + (ride.finalPrice || 0), 0);
      const averageRating = completedRides.reduce((sum: number, ride: any) => sum + (ride.rating || 0), 0) / completedRides.length || 0;
      
      return {
        totalRides: completedRides.length,
        totalEarnings,
        averageRating: Math.round(averageRating * 10) / 10,
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
      const getRideDetailsFunc = httpsCallable(functions, 'getRideDetails');
      const response = await getRideDetailsFunc({ rideId });
      
      const result = response.data as { success: boolean; ride: any };
      
      if (result.success) {
        return result.ride;
      } else {
        throw new Error('No se pudo obtener el viaje');
      }
    } catch (error: any) {
      console.error('❌ Error obteniendo detalles del viaje:', error.message);
      throw error;
    }
  }
}

export default new RideHistoryService();
