import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GetRideHistoryDto } from './dto/get-ride-history.dto';

@Injectable()
export class RideHistoryService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getTodayRides(userId: string, userRole: 'driver' | 'client') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const column = userRole === 'driver' ? 'driver_id' : 'client_id';

    const { data, error } = await this.supabaseService.client
      .from('rides')
      .select('*')
      .eq(column, userId)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo viajes del día:', error);
      throw new Error('Error al obtener viajes del día');
    }

    return {
      success: true,
      rides: data || [],
      count: data?.length || 0,
    };
  }

  async getRideHistory(userId: string, userRole: 'driver' | 'client', dto: GetRideHistoryDto) {
    const column = userRole === 'driver' ? 'driver_id' : 'client_id';

    const { data, error } = await this.supabaseService.client
      .from('rides')
      .select('*')
      .eq(column, userId)
      .order('created_at', { ascending: false })
      .range(dto.offset, dto.offset + dto.limit - 1);

    if (error) {
      console.error('❌ Error obteniendo historial:', error);
      throw new Error('Error al obtener historial de viajes');
    }

    return {
      success: true,
      rides: data || [],
      count: data?.length || 0,
      hasMore: data?.length === dto.limit,
    };
  }

  async getDriverStats(driverId: string) {
    try {
      // Total de viajes completados
      const { count: totalRides, error: ridesError } = await this.supabaseService.client
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('status', 'completed');

      if (ridesError) {
        console.error('❌ Error obteniendo total de viajes:', ridesError);
      }

      // Total de ganancias
      const { data: paymentsData, error: paymentsError } = await this.supabaseService.client
        .from('payments')
        .select('total')
        .eq('status', 'completed')
        .in('ride_id', 
          this.supabaseService.client
            .from('rides')
            .select('id')
            .eq('driver_id', driverId)
            .eq('status', 'completed')
        );

      if (paymentsError) {
        console.error('❌ Error obteniendo ganancias:', paymentsError);
      }

      const totalEarnings = paymentsData?.reduce((sum: number, p: any) => sum + (parseFloat(p.total) || 0), 0) || 0;

      // Rating promedio
      const { data: ratingsData, error: ratingsError } = await this.supabaseService.client
        .from('ratings')
        .select('rating')
        .eq('to_user_id', driverId);

      if (ratingsError) {
        console.error('❌ Error obteniendo ratings:', ratingsError);
      }

      const averageRating = ratingsData && ratingsData.length > 0
        ? ratingsData.reduce((sum: number, r: any) => sum + r.rating, 0) / ratingsData.length
        : 0;

      return {
        success: true,
        stats: {
          totalRides: totalRides || 0,
          totalEarnings: totalEarnings.toFixed(2),
          averageRating: averageRating.toFixed(2),
        },
      };
    } catch (error) {
      console.error('❌ Error en getDriverStats:', error);
      return {
        success: true,
        stats: {
          totalRides: 0,
          totalEarnings: '0.00',
          averageRating: '0.00',
        },
      };
    }
  }

  async getRideDetails(rideId: string, userId: string) {
    const { data: ride, error } = await this.supabaseService.client
      .from('rides')
      .select(`
        *,
        payments (
          amount,
          tip,
          total,
          payment_method,
          status,
          paid_at
        ),
        ratings (
          rating,
          comment,
          from_user_id,
          to_user_id
        )
      `)
      .eq('id', rideId)
      .single();

    if (error) {
      console.error('❌ Error obteniendo detalles del viaje:', error);
      throw new Error('Viaje no encontrado');
    }

    // Verificar que el usuario tenga acceso a este viaje
    if (ride.client_id !== userId && ride.driver_id !== userId) {
      throw new Error('No tienes acceso a este viaje');
    }

    return {
      success: true,
      ride,
    };
  }
}
