/**
 * Supabase REST API — Consultas de conductores
 * Extraído de client.ts para modularidad.
 */

import { supabaseGet } from './rest';
import { supabaseUrl, buildHeaders } from './config';

const DRIVER_WITH_VEHICLES_SELECT = [
  'id',
  'user_id',
  'profile_photo',
  'license_number',
  'license_expiry',
  'license_photo_front',
  'license_photo_back',
  'department',
  'municipality',
  'account_status',
  'documents_status',
  'designated_rol_requested',
  'verified_at',
  'total_rides',
  'average_rating',
  'total_earnings',
  'created_at',
  'updated_at',
  'vehicles(' + [
    'id',
    'driver_id',
    'plate',
    'brand',
    'model',
    'year',
    'color',
    'type',
    'is_active',
    'registration_number',
    'registration_expiry',
    'registration_photo_front',
    'registration_photo_back',
    'insurance_number',
    'insurance_company',
    'insurance_expiry',
    'insurance_photo',
    'vehicle_photo'
  ].join(',') + ')'
].join(',');

/**
 * ✅ Grupo 7 (H6): Batch query para obtener múltiples conductores en una sola petición.
 * Resuelve el N+1 en rideHistory.ts usando el operador `in` de PostgREST.
 */
export async function supabaseGetDriversWithVehiclesBatch(userIds: string[]): Promise<Record<string, any>> {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  try {
    // PostgREST soporta `user_id=in.(id1,id2,id3)` para filtros batch
    const inFilter = userIds.map(id => encodeURIComponent(id)).join(',');
    const urlString = `${supabaseUrl}/rest/v1/drivers?select=${DRIVER_WITH_VEHICLES_SELECT}&user_id=in.(${inFilter})&limit=${userIds.length}`;

    console.log(`👥 [supabaseGetDriversWithVehiclesBatch] Obteniendo ${userIds.length} conductores en batch`);

    const response = await fetch(urlString, {
      method: 'GET',
      headers: buildHeaders(true),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [supabaseGetDriversWithVehiclesBatch] HTTP ${response.status}:`, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const drivers = await response.json();
    console.log(`✅ [supabaseGetDriversWithVehiclesBatch] ${drivers.length} conductores obtenidos`);

    // Mapear por user_id para acceso O(1)
    const result: Record<string, any> = {};
    for (const driver of drivers) {
      if (driver.user_id) {
        result[driver.user_id] = driver;
      }
    }
    return result;
  } catch (error: any) {
    console.error(`❌ [supabaseGetDriversWithVehiclesBatch] Error:`, error.message);
    throw error;
  }
}

export async function supabaseGetDriverWithVehicles(userId: string) {
  try {
    console.log(`👤 [supabaseGetDriverWithVehicles] Obteniendo conductor con vehículos: ${userId}`);

    const drivers = await supabaseGet('drivers', { user_id: userId }, DRIVER_WITH_VEHICLES_SELECT, {
      requireServiceRole: true,
    });
    
    if (drivers && drivers.length > 0) {
      const driver = drivers[0];
      console.log(`✅ [supabaseGetDriverWithVehicles] Conductor encontrado con ${driver.vehicles?.length || 0} vehículos`);
      console.log(`📋 [supabaseGetDriverWithVehicles] Vehículos retornados:`, driver.vehicles?.length || 0);
      
      if (driver.vehicles && driver.vehicles.length > 0) {
        console.log(`📋 [supabaseGetDriverWithVehicles] Primer vehículo:`, JSON.stringify(driver.vehicles[0], null, 2));
      }
      
      console.log(`📋 [supabaseGetDriverWithVehicles] Fotos del conductor:`, {
        license_photo_front: driver.license_photo_front ? '✅' : '❌',
        license_photo_back: driver.license_photo_back ? '✅' : '❌',
      });
      return driver;
    }
    
    console.warn(`⚠️ [supabaseGetDriverWithVehicles] No se encontró conductor con user_id: ${userId}`);
    return null;
  } catch (error: any) {
    throw error;
  }
}
