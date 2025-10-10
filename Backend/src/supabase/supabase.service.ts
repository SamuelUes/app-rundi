import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService implements OnModuleInit {
  public client: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || 'https://ceytngpresytjhafcadu.supabase.co';
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_KEY') || '';

    if (!supabaseKey) {
      console.warn('⚠️ SUPABASE_SERVICE_KEY no configurada');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('✅ Supabase client initialized');
  }

  // Helper para sincronizar viaje a Supabase
  async syncRideToSupabase(rideData: any) {
    try {
      const { data, error } = await this.client
        .from('rides')
        .upsert({
          id: rideData.id,
          client_id: rideData.clientId,
          driver_id: rideData.driverId || null,
          origin_lat: rideData.origin?.lat,
          origin_lng: rideData.origin?.lng,
          origin_address: rideData.origin?.address,
          destination_lat: rideData.destination?.lat,
          destination_lng: rideData.destination?.lng,
          destination_address: rideData.destination?.address,
          estimated_distance: rideData.estimatedDistance,
          estimated_duration: rideData.estimatedDuration,
          actual_distance: rideData.actualDistance || null,
          actual_duration: rideData.actualDuration || null,
          estimated_price: rideData.estimatedPrice,
          final_fare: rideData.finalFare || null,
          client_suggested_price: rideData.clientSuggestedPrice || null,
          notes: rideData.notes || null,
          ride_type: rideData.rideType || 'normal',
          status: rideData.status,
          cancel_reason: rideData.cancelReason || null,
          canceled_by: rideData.canceledBy || null,
          requested_at: rideData.requestedAt || new Date().toISOString(),
          accepted_at: rideData.acceptedAt || null,
          started_at: rideData.startedAt || null,
          completed_at: rideData.completedAt || null,
          canceled_at: rideData.canceledAt || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error sincronizando viaje a Supabase:', error);
        return null;
      }

      console.log(`✅ Viaje sincronizado a Supabase: ${rideData.id}`);
      return data;
    } catch (error) {
      console.error('❌ Error en syncRideToSupabase:', error);
      return null;
    }
  }

  // Helper para guardar ubicación del viaje
  async saveRideLocation(rideId: string, location: any) {
    try {
      const { error } = await this.client
        .from('ride_locations')
        .insert({
          ride_id: rideId,
          lat: location.lat,
          lng: location.lng,
          speed: location.speed || null,
          heading: location.heading || null,
          accuracy: location.accuracy || null,
          timestamp: new Date().toISOString(),
        });

      if (error) {
        console.error('❌ Error guardando ubicación:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error en saveRideLocation:', error);
      return false;
    }
  }
}
