/**
 * Realtime DB to Supabase Sync
 * 
 * Sistema centralizado que sincroniza automáticamente todos los datos
 * de Firebase Realtime DB a Supabase
 * 
 * Sincroniza:
 * - activeRides → rides table
 * - completedRides → rides table
 * - paymentStatus → payments table
 * - driverLocations → ride_locations table
 */

import * as admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

// 🆕 Lazy loading de Supabase (se inicializa cuando se necesita)
let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY no están configurados');
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  
  return supabase;
}

// ============================================
// VALIDACIÓN: Verificar si existe en Supabase
// ============================================

/**
 * Verificar si un viaje ya existe en Supabase
 */
async function rideExistsInSupabase(rideId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('rides')
      .select('id')
      .eq('id', rideId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = No rows found (es normal)
      console.warn(`⚠️ [rideExistsInSupabase] Error verificando: ${error.message}`);
    }
    
    return !!data;
  } catch (error) {
    console.warn(`⚠️ [rideExistsInSupabase] Error:`, error);
    return false;
  }
}

/**
 * Verificar si un pago ya existe en Supabase
 */
async function paymentExistsInSupabase(paymentId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.warn(`⚠️ [paymentExistsInSupabase] Error verificando: ${error.message}`);
    }
    
    return !!data;
  } catch (error) {
    console.warn(`⚠️ [paymentExistsInSupabase] Error:`, error);
    return false;
  }
}

/**
 * Verificar si una ubicación ya existe en Supabase
 */
async function locationExistsInSupabase(locationId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ride_locations')
      .select('id')
      .eq('id', locationId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.warn(`⚠️ [locationExistsInSupabase] Error verificando: ${error.message}`);
    }
    
    return !!data;
  } catch (error) {
    console.warn(`⚠️ [locationExistsInSupabase] Error:`, error);
    return false;
  }
}

// ============================================
// SYNC ALL RIDE LOCATIONS (Normalized)
// ============================================
async function syncRideLocationsToSupabase(rideId: string, rideData: any): Promise<{ originLocationId?: string; destinationLocationId?: string; waypointsCount: number }> {
  try {
    const supabase = getSupabaseClient();
    const locationIds: { originLocationId?: string; destinationLocationId?: string; waypointsCount: number } = { waypointsCount: 0 };
    
    // ✅ VALIDAR que existan datos de ubicación
    if (!rideData.origin || !rideData.destination) {
      console.warn(`⚠️ [syncRideLocationsToSupabase] Datos de ubicación incompletos para ${rideId}`);
      return locationIds;
    }
    
    // ✅ PASO 1: Guardar origen
    const originLocationId = `${rideId}-origin`;
    const originLocation = {
      id: originLocationId,
      ride_id: rideId,
      lat: rideData.origin.lat || rideData.origin.latitude,
      lng: rideData.origin.lng || rideData.origin.longitude,
      address: rideData.origin.address || 'Origen',
      location_type: 'origin',
      is_origin: true,
      is_destination: false,
      is_waypoint: false,
      waypoint_order: null,
      place_name: null,
      place_id: null,
      timestamp: new Date(),
      created_at: new Date(),
    };
    
    const { error: originError } = await supabase.from('ride_locations').upsert(originLocation);
    if (originError) {
      console.error(`❌ [syncRideLocationsToSupabase] Error guardando origen:`, originError);
    } else {
      locationIds.originLocationId = originLocationId;
      console.log(`✅ [syncRideLocationsToSupabase] Origen guardado: ${originLocationId}`);
    }
    
    // ✅ PASO 2: Guardar destinos extras como waypoints (si existen)
    if (rideData.extraDestinations && Array.isArray(rideData.extraDestinations) && rideData.extraDestinations.length > 0) {
      console.log(`📍 [syncRideLocationsToSupabase] Sincronizando ${rideData.extraDestinations.length} parada(s) extra(s)`);
      
      for (let i = 0; i < rideData.extraDestinations.length; i++) {
        const dest = rideData.extraDestinations[i];
        
        // ✅ Validar que el destino tenga coordenadas
        if (!dest.lat && !dest.latitude) {
          console.warn(`⚠️ [syncRideLocationsToSupabase] Parada ${i + 1} sin coordenadas, saltando`);
          continue;
        }
        
        const waypointLocationId = `${rideId}-waypoint-${i + 1}`;
        const waypointLocation = {
          id: waypointLocationId,
          ride_id: rideId,
          lat: dest.lat || dest.latitude,
          lng: dest.lng || dest.longitude,
          address: dest.address || `Parada ${i + 1}`,
          location_type: 'waypoint',
          is_origin: false,
          is_destination: false,
          is_waypoint: true,
          waypoint_order: i + 1,
          place_name: null,
          place_id: null,
          timestamp: new Date(),
          created_at: new Date(),
        };
        
        const { error: waypointError } = await supabase.from('ride_locations').upsert(waypointLocation);
        if (waypointError) {
          console.error(`❌ [syncRideLocationsToSupabase] Error guardando parada ${i + 1}:`, waypointError);
        } else {
          locationIds.waypointsCount++;
          console.log(`✅ [syncRideLocationsToSupabase] Parada ${i + 1} guardada: ${waypointLocationId}`);
        }
      }
    }
    
    // ✅ PASO 3: Guardar destino final
    const destinationLocationId = `${rideId}-destination`;
    const destinationLocation = {
      id: destinationLocationId,
      ride_id: rideId,
      lat: rideData.destination.lat || rideData.destination.latitude,
      lng: rideData.destination.lng || rideData.destination.longitude,
      address: rideData.destination.address || 'Destino',
      location_type: 'destination',
      is_origin: false,
      is_destination: true,
      is_waypoint: false,
      waypoint_order: null,
      place_name: null,
      place_id: null,
      timestamp: new Date(),
      created_at: new Date(),
    };
    
    const { error: destError } = await supabase.from('ride_locations').upsert(destinationLocation);
    if (destError) {
      console.error(`❌ [syncRideLocationsToSupabase] Error guardando destino:`, destError);
    } else {
      locationIds.destinationLocationId = destinationLocationId;
      console.log(`✅ [syncRideLocationsToSupabase] Destino final guardado: ${destinationLocationId}`);
    }
    
    // ✅ LOG RESUMEN
    console.log(`📊 [syncRideLocationsToSupabase] Resumen:`, {
      rideId,
      originLocationId: locationIds.originLocationId,
      waypointsCount: locationIds.waypointsCount,
      destinationLocationId: locationIds.destinationLocationId,
    });
    
    return locationIds;
  } catch (error: any) {
    console.error(`❌ [syncRideLocationsToSupabase] Error crítico:`, error);
    return { waypointsCount: 0 };
  }
}

// ============================================
// SYNC ACTIVE RIDES
// ============================================
export async function syncActiveRideToSupabase(rideId: string, rideData: any): Promise<void> {
  try {
    const rideIdToUse = rideData.pgRideId || rideId;
    
    // ✅ NUEVO: Verificar si ya existe en Supabase
    const exists = await rideExistsInSupabase(rideIdToUse);
    
    if (exists) {
      console.log(`🔄 [syncActiveRideToSupabase] Viaje ya existe en Supabase, ACTUALIZANDO: ${rideId}`);
    } else {
      console.log(`🆕 [syncActiveRideToSupabase] Viaje NUEVO, INSERTANDO: ${rideId}`);
    }
    
    const supabase = getSupabaseClient();
    
    // Mapear datos de Firebase a Supabase según schema en supabase-only.sql
    const supabaseRide = {
      id: rideIdToUse,
      client_id: rideData.clientId || '',
      driver_id: rideData.driverId || null,
      origin_lat: rideData.origin?.lat || rideData.origin?.latitude || null,
      origin_lng: rideData.origin?.lng || rideData.origin?.longitude || null,
      origin_address: rideData.origin?.address || null,
      destination_lat: rideData.destination?.lat || rideData.destination?.latitude || null,
      destination_lng: rideData.destination?.lng || rideData.destination?.longitude || null,
      destination_address: rideData.destination?.address || null,
      status: rideData.status || 'requested',
      estimated_price: rideData.estimatedPrice || null,
      final_fare: rideData.finalFare || null,
      estimated_distance: rideData.estimatedDistance || null,
      actual_distance: rideData.actualDistance || null,
      estimated_duration: rideData.estimatedDuration || null,
      actual_duration: rideData.actualDuration || null,
      payment_type: rideData.paymentMethod || 'cash',
      ride_type: rideData.rideType || 'normal',
      vehicle_type: rideData.vehicleType || 'auto',
      passengers: rideData.passengers || 1,
      notes: rideData.notes || null,
      service_id: rideData.serviceId || null,
      requested_at: rideData.createdAt ? new Date(rideData.createdAt) : new Date(),
      accepted_at: rideData.acceptedAt ? new Date(rideData.acceptedAt) : null,
      started_at: rideData.startedAt ? new Date(rideData.startedAt) : null,
      completed_at: rideData.completedAt ? new Date(rideData.completedAt) : null,
      canceled_at: rideData.canceledAt ? new Date(rideData.canceledAt) : null,
      cancel_reason: rideData.cancelReason || null,
      canceled_by: rideData.canceledBy || null,
      updated_at: new Date(),
    };
    
    // Upsert en Supabase (inserta si no existe, actualiza si existe)
    const { error } = await supabase
      .from('rides')
      .upsert(supabaseRide);
    
    if (error) {
      console.error(`❌ [syncActiveRideToSupabase] Error sincronizando: ${error.message}`);
      throw error;
    }
    
    const action = exists ? 'actualizado' : 'insertado';
    console.log(`✅ [syncActiveRideToSupabase] Viaje ${action}: ${rideId}`);
    
    // ✅ NUEVO: Sincronizar todas las ubicaciones a ride_locations (normalizado)
    const locationIds = await syncRideLocationsToSupabase(rideId, rideData);
    
    // ✅ NUEVO: Actualizar rides con los IDs de ubicación y metadatos de destinos múltiples
    if (locationIds.originLocationId || locationIds.destinationLocationId || locationIds.waypointsCount > 0) {
      const updateData: any = {};
      
      if (locationIds.originLocationId) {
        updateData.origin_location_id = locationIds.originLocationId;
      }
      if (locationIds.destinationLocationId) {
        updateData.destination_location_id = locationIds.destinationLocationId;
      }
      
      // ✅ Actualizar metadatos de destinos múltiples
      updateData.waypoints_count = locationIds.waypointsCount;
      updateData.has_multiple_stops = locationIds.waypointsCount > 0;
      
      const { error: updateError } = await supabase
        .from('rides')
        .update(updateData)
        .eq('id', rideIdToUse);
      
      if (updateError) {
        console.error(`❌ [syncActiveRideToSupabase] Error actualizando IDs de ubicación:`, updateError);
      } else {
        console.log(`✅ [syncActiveRideToSupabase] Datos de ubicación guardados:`, {
          originLocationId: locationIds.originLocationId,
          waypointsCount: locationIds.waypointsCount,
          destinationLocationId: locationIds.destinationLocationId,
        });
      }
    }
  } catch (error: any) {
    console.error(`❌ [syncActiveRideToSupabase] Error:`, error);
    // No lanzar error - la sincronización es no-bloqueante
  }
}

// ============================================
// SYNC PAYMENT STATUS
// ============================================
export async function syncPaymentStatusToSupabase(rideId: string, paymentData: any, pgRideId?: string | null): Promise<void> {
  try {
    const paymentId = paymentData.id || rideId;
    
    // ✅ NUEVO: Verificar si ya existe en Supabase
    const exists = await paymentExistsInSupabase(paymentId);
    
    if (exists) {
      console.log(`🔄 [syncPaymentStatusToSupabase] Pago ya existe en Supabase, ACTUALIZANDO: ${rideId}`);
    } else {
      console.log(`🆕 [syncPaymentStatusToSupabase] Pago NUEVO, INSERTANDO: ${rideId}`);
    }
    
    const supabase = getSupabaseClient();
    
    // Mapear datos de Firebase a Supabase según schema en supabase-only.sql
    const supabasePayment = {
      id: paymentId,
      ride_id: (pgRideId || rideId) as string,
      amount: paymentData.finalAmount || paymentData.amount || 0,
      tip: paymentData.tip || 0,
      commission: paymentData.commission || 0,
      payment_method: paymentData.method || 'cash',
      payment_provider: paymentData.provider || null,
      status: paymentData.status || 'pending',
      local_transaction_id: paymentData.localTransactionId || null,
      local_authorization_code: paymentData.localAuthCode || null,
      local_bank: paymentData.localBank || null,
      notes: paymentData.message || paymentData.notes || null,
      cancel_reason: paymentData.cancelReason || null,
      synced_to_firebase: true,
      firebase_synced_at: new Date(),
      paid_at: paymentData.completedAt ? new Date(paymentData.completedAt) : null,
      created_at: paymentData.createdAt ? new Date(paymentData.createdAt) : new Date(),
      updated_at: new Date(),
    };
    
    // Upsert en Supabase (inserta si no existe, actualiza si existe)
    const { error } = await supabase
      .from('payments')
      .upsert(supabasePayment);
    
    if (error) {
      console.error(`❌ [syncPaymentStatusToSupabase] Error sincronizando: ${error.message}`);
      throw error;
    }
    
    const action = exists ? 'actualizado' : 'insertado';
    console.log(`✅ [syncPaymentStatusToSupabase] Pago ${action}: ${rideId}`);
  } catch (error: any) {
    console.error(`❌ [syncPaymentStatusToSupabase] Error:`, error);
    // No lanzar error - la sincronización es no-bloqueante
  }
}

// ============================================
// SYNC DRIVER LOCATION
// ============================================
export async function syncDriverLocationToSupabase(rideId: string, locationData: any, pgRideId?: string | null): Promise<void> {
  try {
    const locationId = locationData.id || `${rideId}-${Date.now()}`;
    
    // ✅ NUEVO: Verificar si ya existe en Supabase
    const exists = await locationExistsInSupabase(locationId);
    
    if (exists) {
      console.log(`🔄 [syncDriverLocationToSupabase] Ubicación ya existe en Supabase, ACTUALIZANDO: ${rideId}`);
    } else {
      console.log(`🆕 [syncDriverLocationToSupabase] Ubicación NUEVA, INSERTANDO: ${rideId}`);
    }
    
    const supabase = getSupabaseClient();
    
    // Mapear datos de Firebase a Supabase según schema en supabase-only.sql
    const supabaseLocation = {
      id: locationId,
      ride_id: (pgRideId || rideId) as string,
      lat: locationData.latitude || locationData.lat || null,
      lng: locationData.longitude || locationData.lng || null,
      speed: locationData.speed || null,
      heading: locationData.heading || null,
      accuracy: locationData.accuracy || null,
      timestamp: locationData.timestamp ? new Date(locationData.timestamp) : new Date(),
      created_at: new Date(),
    };
    
    // Upsert en Supabase (inserta si no existe, actualiza si existe)
    const { error } = await supabase
      .from('ride_locations')
      .upsert(supabaseLocation);
    
    if (error) {
      console.error(`❌ [syncDriverLocationToSupabase] Error sincronizando: ${error.message}`);
      throw error;
    }
    
    const action = exists ? 'actualizado' : 'insertado';
    console.log(`✅ [syncDriverLocationToSupabase] Ubicación ${action}: ${rideId}`);
  } catch (error: any) {
    console.error(`❌ [syncDriverLocationToSupabase] Error:`, error);
    // No lanzar error - la sincronización es no-bloqueante
  }
}

// ============================================
// LISTENER: Sincronizar activeRides
// ============================================
export function setupActiveRidesListener(): void {
  try {
    console.log(`🎯 [setupActiveRidesListener] Iniciando listener para activeRides`);
    
    const db = admin.database();
    const activeRidesRef = db.ref('activeRides');
    
    activeRidesRef.on('child_added', (snapshot) => {
      const rideId = snapshot.key as string;
      const rideData = snapshot.val();
      
      console.log(`📥 [activeRides] Nuevo viaje: ${rideId}`);
      
      // Sincronizar en background (no bloqueante)
      syncActiveRideToSupabase(rideId, rideData).catch(err => {
        console.error(`❌ Error sincronizando activeRide ${rideId}:`, err);
      });
    });
    
    activeRidesRef.on('child_changed', (snapshot) => {
      const rideId = snapshot.key as string;
      const rideData = snapshot.val();
      
      console.log(`📤 [activeRides] Viaje actualizado: ${rideId}`);
      
      // Sincronizar en background (no bloqueante)
      syncActiveRideToSupabase(rideId, rideData).catch(err => {
        console.error(`❌ Error sincronizando activeRide ${rideId}:`, err);
      });
    });
    
    console.log(`✅ [setupActiveRidesListener] Listener iniciado`);
  } catch (error) {
    console.error(`❌ [setupActiveRidesListener] Error:`, error);
  }
}

// ============================================
// LISTENER: Sincronizar paymentStatus
// ============================================
export function setupPaymentStatusListener(): void {
  try {
    console.log(`🎯 [setupPaymentStatusListener] Iniciando listener para paymentStatus`);
    
    const db = admin.database();
    const paymentStatusRef = db.ref('paymentStatus');
    
    paymentStatusRef.on('child_added', (snapshot) => {
      const rideId = snapshot.key as string;
      const paymentData = snapshot.val();
      
      console.log(`💳 [paymentStatus] Nuevo pago: ${rideId}`);
      
      // Sincronizar en background (no bloqueante)
      syncPaymentStatusToSupabase(rideId, paymentData).catch(err => {
        console.error(`❌ Error sincronizando paymentStatus ${rideId}:`, err);
      });
    });
    
    paymentStatusRef.on('child_changed', (snapshot) => {
      const rideId = snapshot.key as string;
      const paymentData = snapshot.val();
      
      console.log(`💳 [paymentStatus] Pago actualizado: ${rideId}`);
      
      // Sincronizar en background (no bloqueante)
      syncPaymentStatusToSupabase(rideId, paymentData).catch(err => {
        console.error(`❌ Error sincronizando paymentStatus ${rideId}:`, err);
      });
    });
    
    console.log(`✅ [setupPaymentStatusListener] Listener iniciado`);
  } catch (error) {
    console.error(`❌ [setupPaymentStatusListener] Error:`, error);
  }
}

// ============================================
// LISTENER: Sincronizar driverLocations
// ============================================
export function setupDriverLocationsListener(): void {
  try {
    console.log(`🎯 [setupDriverLocationsListener] Iniciando listener para driverLocations`);
    
    const db = admin.database();
    const driverLocationsRef = db.ref('driverLocations');
    
    driverLocationsRef.on('child_added', (snapshot) => {
      const driverId = snapshot.key as string;
      const locationData = snapshot.val();
      
      console.log(`📍 [driverLocations] Nueva ubicación para conductor: ${driverId}`);
      
      // Sincronizar en background (no bloqueante)
      syncDriverLocationToSupabase(driverId, locationData).catch(err => {
        console.error(`❌ Error sincronizando driverLocation ${driverId}:`, err);
      });
    });
    
    console.log(`✅ [setupDriverLocationsListener] Listener iniciado`);
  } catch (error) {
    console.error(`❌ [setupDriverLocationsListener] Error:`, error);
  }
}

// ============================================
// INICIALIZAR TODOS LOS LISTENERS
// ============================================

let listenersInitialized = false;

export function initializeRealtimeSyncListeners(): void {
  // Evitar inicializar múltiples veces
  if (listenersInitialized) {
    return;
  }
  
  try {
    console.log(`🚀 [initializeRealtimeSyncListeners] Inicializando sincronización Realtime → Supabase`);
    
    setupActiveRidesListener();
    setupPaymentStatusListener();
    setupDriverLocationsListener();
    
    listenersInitialized = true;
    console.log(`✅ [initializeRealtimeSyncListeners] Todos los listeners iniciados`);
  } catch (error) {
    console.warn(`⚠️ [initializeRealtimeSyncListeners] Error inicializando listeners:`, error);
    // No lanzar error - el sistema funcionará sin listeners
  }
}
