/**
 * Inspections Service
 * Servicio para guardar inspecciones de vehículos en Supabase
 */

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import i18n from '../i18n';

// Configuración de Supabase
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || 'https://ceytngpresytjhafcadu.supabase.co';
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNleXRuZ3ByZXN5dGpoYWZjYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5Nzg4NzIsImV4cCI6MjA3NTU1NDg3Mn0.3G9aCmJsjOIL-VG6E49sNnxvKBLITX-I1gFFlWKVslo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface DesignatedDriverInspection {
  ride_id: string;
  driver_id: string;
  vehicle_front_photo: string;
  vehicle_rear_photo: string;
  interior_front_photo: string;
  interior_rear_photo: string;
  status?: string;
  inspected_at?: string;
}

const tr = (path: string, options?: Record<string, any>) =>
  i18n.t(`services.inspectionsService.${path}`, options) as string;

/**
 * Guardar inspección de vehículo del cliente en designated_driver_inspections table
 * @param inspection - Datos de la inspección
 * @returns ID de la inspección guardada
 */
export const saveDesignatedDriverInspection = async (
  inspection: DesignatedDriverInspection
): Promise<string> => {
  try {
    console.log('💾 Guardando inspección en designated_driver_inspections...');

    const { data, error } = await supabase
      .from('designated_driver_inspections')
      .insert([
        {
          ride_id: inspection.ride_id,
          driver_id: inspection.driver_id,
          vehicle_front_photo: inspection.vehicle_front_photo,
          vehicle_rear_photo: inspection.vehicle_rear_photo,
          interior_front_photo: inspection.interior_front_photo,
          interior_rear_photo: inspection.interior_rear_photo,
          status: inspection.status || 'completed',
          inspected_at: inspection.inspected_at || new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('❌ Error guardando inspección:', error);
      throw new Error(`${tr('errors.saveFailed')} ${error.message ?? ''}`.trim());
    }

    if (!data || data.length === 0) {
      throw new Error(tr('errors.missingData'));
    }

    console.log('✅ Inspección guardada exitosamente:', data[0]);
    return data[0].id;
  } catch (error: any) {
    console.error('❌ Error en saveDesignatedDriverInspection:', error);
    throw error;
  }
};

/**
 * Obtener inspección por ride_id
 * @param rideId - ID del viaje
 * @returns Datos de la inspección
 */
export const getInspectionByRideId = async (rideId: string) => {
  try {
    console.log('🔍 Obteniendo inspección para ride:', rideId);

    const { data, error } = await supabase
      .from('designated_driver_inspections')
      .select('*')
      .eq('ride_id', rideId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      console.error('❌ Error obteniendo inspección:', error);
      throw new Error(error.message || tr('errors.fetchFailed'));
    }

    console.log('✅ Inspección obtenida:', data);
    return data;
  } catch (error: any) {
    console.error('❌ Error en getInspectionByRideId:', error);
    throw error;
  }
};

/**
 * Obtener inspecciones por conductor
 * @param driverId - Firebase UID del conductor
 * @returns Array de inspecciones
 */
export const getInspectionsByDriverId = async (driverId: string) => {
  try {
    console.log('🔍 Obteniendo inspecciones del conductor:', driverId);

    const { data, error } = await supabase
      .from('designated_driver_inspections')
      .select('*')
      .eq('driver_id', driverId)
      .order('inspected_at', { ascending: false });

    if (error) {
      console.error('❌ Error obteniendo inspecciones:', error);
      throw new Error(error.message || tr('errors.listFailed'));
    }

    console.log('✅ Inspecciones obtenidas:', data?.length || 0);
    return data || [];
  } catch (error: any) {
    console.error('❌ Error en getInspectionsByDriverId:', error);
    throw error;
  }
};

export default {
  saveDesignatedDriverInspection,
  getInspectionByRideId,
  getInspectionsByDriverId,
};
