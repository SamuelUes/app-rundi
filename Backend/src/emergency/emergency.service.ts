import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LogEmergencyCallDto, UpdateEmergencyCallStatusDto } from './dto/log-emergency-call.dto';

@Injectable()
export class EmergencyService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async logEmergencyCall(userId: string, userRole: string, dto: LogEmergencyCallDto) {
    const emergencyNumber = dto.emergencyType === 'police' ? '118' : '102';

    const { data, error } = await this.supabaseService.client
      .from('emergency_calls')
      .insert({
        user_id: userId,
        user_role: userRole,
        emergency_type: dto.emergencyType,
        emergency_number: emergencyNumber,
        lat: dto.location?.latitude || null,
        lng: dto.location?.longitude || null,
        address: dto.location?.address || null,
        ride_id: dto.rideId || null,
        notes: dto.notes || null,
        call_status: 'initiated',
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error guardando llamada de emergencia:', error);
      throw new Error('Error al registrar llamada de emergencia');
    }

    console.log(`🚨 Llamada de emergencia registrada: ${dto.emergencyType} (${emergencyNumber}) - Usuario: ${userId}`);

    return {
      success: true,
      emergencyNumber,
      callId: data.id,
      message: `Llamando a ${dto.emergencyType === 'police' ? 'Policía' : 'Ambulancia'} (${emergencyNumber})`,
    };
  }

  async updateEmergencyCallStatus(userId: string, dto: UpdateEmergencyCallStatusDto) {
    const { error } = await this.supabaseService.client
      .from('emergency_calls')
      .update({ call_status: dto.status })
      .eq('id', dto.callId)
      .eq('user_id', userId); // Solo el usuario que hizo la llamada puede actualizarla

    if (error) {
      console.error('❌ Error actualizando estado:', error);
      throw new Error('Error al actualizar estado de llamada');
    }

    console.log(`✅ Estado de llamada actualizado: ${dto.callId} -> ${dto.status}`);

    return {
      success: true,
      status: dto.status,
    };
  }

  async getEmergencyCalls(userId: string) {
    const { data, error } = await this.supabaseService.client
      .from('emergency_calls')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ Error obteniendo llamadas:', error);
      throw new Error('Error al obtener historial de llamadas');
    }

    return {
      success: true,
      calls: data || [],
    };
  }
}
