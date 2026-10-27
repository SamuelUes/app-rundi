/**
 * Supabase REST API — Consultas de viajes
 * Extraído de client.ts para modularidad.
 */

import { supabaseUrl, buildHeaders } from './config';
import { supabaseGet } from './rest';

export async function supabaseGetSimpleRides(userId: string, userType: 'driver' | 'client') {
  try {
    console.log(`🚗 [supabaseGetSimpleRides] userType: ${userType}, userId: ${userId}`);

    const filterKey = userType === 'driver' ? 'driver_id' : 'client_id';

    // Filtrar en la BD en lugar de cargar todos los rides y filtrar en JS
    const userRides = await supabaseGet(
      'rides',
      { [filterKey]: userId },
      'id,client_id,driver_id,status,created_at,final_fare',
      { requireServiceRole: true },
    );
    console.log(`✅ [supabaseGetSimpleRides] Viajes encontrados: ${userRides.length}`);

    return userRides;
  } catch (error: any) {
    console.error(`❌ [supabaseGetSimpleRides] Error:`, error.message);
    throw error;
  }
}

export async function supabaseGetRidesWithLocationsAndPayments(
  userId: string,
  userType: 'driver' | 'client',
  options?: {
    limit?: number;
    offset?: number;
    includeTotals?: boolean;
    rideId?: string;
  }
) {
  try {
    const filterKey = userType === 'driver' ? 'driver_id' : 'client_id';
    const limit = options?.rideId
      ? 1
      : Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const offset = options?.rideId ? 0 : Math.max(options?.offset ?? 0, 0);
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 [supabaseGetRidesWithLocationsAndPayments] OPTIMIZADO - 3 CONSULTAS PARALELAS`);
    console.log(`   userType: ${userType}, userId: ${userId}`);
    console.log(`${'='.repeat(70)}`);
    
    const ridesSelect = 'id,status,estimated_price,final_fare,estimated_distance,actual_distance,estimated_duration,actual_duration,created_at,completed_at,requested_at,accepted_at,started_at,canceled_at,client_id,driver_id,follower_driver_id,follower_status,payment_type,ride_type,vehicle_type,passengers,notes,waypoints_count,has_multiple_stops';
    
    let ridesUrl = `${supabaseUrl}/rest/v1/rides?select=${ridesSelect}`;
    ridesUrl += `&order=created_at.desc`;
    ridesUrl += `&limit=${limit}`;
    ridesUrl += `&offset=${offset}`;

    if (options?.rideId) {
      const encodedRideId = encodeURIComponent(options.rideId);
      ridesUrl += `&id=eq.${encodedRideId}`;
    } else {
      const encodedValue = encodeURIComponent(userId);
      ridesUrl += userType === 'driver'
        ? `&or=(driver_id.eq.${encodedValue},follower_driver_id.eq.${encodedValue})`
        : `&${filterKey}=eq.${encodedValue}`;
    }
    
    console.log(`🔗 [supabaseGetRidesWithLocationsAndPayments] Consultando rides...`);
    
    const ridesHeaders = buildHeaders(true, options?.includeTotals ? { Prefer: 'count=exact' } : undefined);

    const ridesResponse = await fetch(ridesUrl, {
      method: 'GET',
      headers: ridesHeaders,
    });
    
    if (!ridesResponse.ok) {
      const errorText = await ridesResponse.text();
      console.error(`❌ [supabaseGetRidesWithLocationsAndPayments] HTTP ${ridesResponse.status}:`, errorText);
      return [];
    }
    
    const rides = await ridesResponse.json();
    const contentRange = ridesResponse.headers.get('content-range');
    let totalCount: number | null = null;
    if (contentRange) {
      const [, total] = contentRange.split('/');
      totalCount = total ? Number(total) : null;
    }
    console.log(`✅ [supabaseGetRidesWithLocationsAndPayments] Rides obtenidos: ${rides.length}`);
    if (totalCount !== null && !Number.isNaN(totalCount)) {
      console.log(`📊 [supabaseGetRidesWithLocationsAndPayments] Total disponible: ${totalCount}`);
    }
    
    if (rides.length === 0) {
      if (options?.includeTotals) {
        return { rides: [], totalCount: totalCount ?? 0 };
      }
      return [];
    }
    
    const rideIds = rides.map((r: any) => r.id);
    let locationsUrl = `${supabaseUrl}/rest/v1/ride_locations?select=id,ride_id,latitude,longitude,address,location_type,location_order&limit=50000`;
    locationsUrl += `&order=location_order.asc`;
    
    if (rideIds.length > 0) {
      const rideIdList = rideIds.map((id: string) => `"${id}"`).join(',');
      locationsUrl += `&ride_id=in.(${rideIdList})`;
    }
    
    console.log(`🔗 [supabaseGetRidesWithLocationsAndPayments] Consultando ubicaciones para ${rideIds.length} viajes...`);
    
    const locationsResponse = await fetch(locationsUrl, {
      method: 'GET',
      headers: buildHeaders(true),
    });
    
    let locations: any[] = [];
    if (locationsResponse.ok) {
      locations = await locationsResponse.json();
      console.log(`✅ [supabaseGetRidesWithLocationsAndPayments] Ubicaciones obtenidas: ${locations.length}`);
      if (locations.length > 0) {
        console.log(`   Primeras 2 ubicaciones:`, JSON.stringify(locations.slice(0, 2), null, 2));
      }
    } else {
      const errorText = await locationsResponse.text();
      console.warn(`⚠️ [supabaseGetRidesWithLocationsAndPayments] No se pudieron obtener ubicaciones (${locationsResponse.status}):`, errorText.substring(0, 200));
    }
    
    let paymentsUrl = `${supabaseUrl}/rest/v1/payments?select=id,ride_id,amount,tip,status,payment_method,commission,paid_at&limit=50000`;
    paymentsUrl += `&order=paid_at.desc.nullslast`;
    
    if (rideIds.length > 0) {
      const rideIdList = rideIds.map((id: string) => `"${id}"`).join(',');
      paymentsUrl += `&ride_id=in.(${rideIdList})`;
    }
    
    console.log(`🔗 [supabaseGetRidesWithLocationsAndPayments] Consultando pagos para ${rideIds.length} viajes...`);
    
    const paymentsResponse = await fetch(paymentsUrl, {
      method: 'GET',
      headers: buildHeaders(true),
    });
    
    let payments: any[] = [];
    if (paymentsResponse.ok) {
      payments = await paymentsResponse.json();
      console.log(`✅ [supabaseGetRidesWithLocationsAndPayments] Pagos obtenidos: ${payments.length}`);
    } else {
      console.warn(`⚠️ [supabaseGetRidesWithLocationsAndPayments] No se pudieron obtener pagos`);
    }
    
    const ridesWithData = rides.map((ride: any, idx: number) => {
      const rideLocationsRaw = locations.filter((loc: any) => loc.ride_id === ride.id);
      const ridePayments = payments.filter((p: any) => p.ride_id === ride.id);

      const rideLocations = rideLocationsRaw
        .slice()
        .sort((a: any, b: any) => (a.location_order ?? 0) - (b.location_order ?? 0))
        .map((loc: any) => ({
          ...loc,
          address:
            typeof loc.address === 'string' && loc.address.trim().length > 0
              ? loc.address
              : `${Number(loc.latitude).toFixed(6)}, ${Number(loc.longitude).toFixed(6)}`,
        }));

      const origin = rideLocations.find((loc: any) => loc.location_type === 'origin');
      const destination = rideLocations.find((loc: any) => loc.location_type === 'destination');

      const primaryPayment = ridePayments.reduce((latest: any, current: any) => {
        if (!latest) return current;
        const latestTs = latest?.paid_at ? new Date(latest.paid_at).getTime() : 0;
        const currentTs = current?.paid_at ? new Date(current.paid_at).getTime() : 0;
        return currentTs >= latestTs ? current : latest;
      }, null);

      if (idx < 3) {
        console.log(`\n📍 [supabaseGetRidesWithLocationsAndPayments] Viaje ${idx}: ${ride.id}`);
        console.log(`   Ubicaciones encontradas: ${rideLocations.length}`);
        console.log(`   Pagos encontrados: ${ridePayments.length}`);
        if (rideLocations.length > 0) {
          console.log(`   Primeras ubicaciones:`, JSON.stringify(rideLocations.slice(0, 2), null, 2));
        }
      }
      
      return {
        ...ride,
        origin_address: origin?.address ?? null,
        destination_address: destination?.address ?? null,
        ride_locations: rideLocations,
        payments: ridePayments,
        primary_payment: primaryPayment,
      };
    });
    
    console.log(`\n💾 [supabaseGetRidesWithLocationsAndPayments] 3 consultas en lugar de ${rides.length * 2 + 1} consultas`);
    console.log(`${'='.repeat(70)}\n`);
    
    if (options?.includeTotals) {
      return {
        rides: ridesWithData,
        totalCount: totalCount ?? ridesWithData.length,
      };
    }

    return ridesWithData;
  } catch (error: any) {
    console.error(`❌ [supabaseGetRidesWithLocationsAndPayments] Error:`, error.message);
    if (options?.includeTotals) {
      return {
        rides: [],
        totalCount: 0,
      };
    }
    return [];
  }
}

export async function supabaseGetRideLocations(rideId: string) {
  try {
    const url = new URL(`${supabaseUrl}/rest/v1/ride_locations`);
    url.searchParams.append('ride_id', `eq.${rideId}`);
    url.searchParams.append('select', 'id,latitude,longitude,address,location_type,location_order');
    url.searchParams.append('order', 'location_order.asc');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: buildHeaders(false),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [supabaseGetRideLocations] HTTP ${response.status}:`, errorText);
      return [];
    }
    
    const locations = await response.json();
    console.log(`✅ [supabaseGetRideLocations] Ubicaciones obtenidas para ${rideId}: ${locations.length}`);
    return locations;
  } catch (error: any) {
    console.error(`❌ [supabaseGetRideLocations] Error:`, error.message);
    return [];
  }
}

export async function supabaseGetRidePayments(rideId: string) {
  try {
    const payments = await supabaseGet('payments', { ride_id: rideId, deleted_at: null }, 'id,amount,status,payment_method,tip', {
      requireServiceRole: true,
    });
    return payments;
  } catch (error: any) {
    console.error(`❌ [supabaseGetRidePayments] Error:`, error.message);
    return [];
  }
}

export async function supabaseGetRidesWithDetails(userId: string, userType: 'driver' | 'client') {
  try {
    const filterKey = userType === 'driver' ? 'driver_id' : 'client_id';
    
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚗 [supabaseGetRidesWithDetails] INICIANDO BÚSQUEDA`);
    console.log(`   userType: ${userType}`);
    console.log(`   userId: ${userId}`);
    console.log(`   filterKey: ${filterKey}`);
    console.log(`${'='.repeat(70)}`);
    
    const select = `id,status,estimated_price,final_fare,estimated_distance,actual_distance,estimated_duration,actual_duration,created_at,completed_at,requested_at,accepted_at,started_at,canceled_at,client_id,driver_id,payment_type,ride_type,vehicle_type,passengers,notes,origin_location_id,destination_location_id,waypoints_count,has_multiple_stops`;
    
    console.log(`🚗 [supabaseGetRidesWithDetails] Obteniendo viajes para ${userType}: ${userId}`);
    console.log(`🔍 [supabaseGetRidesWithDetails] Filtrando por: ${filterKey}=${userId}`);
    
    let rides: any[] = [];
    
    if (userType === 'driver') {
      console.log(`🔎 [supabaseGetRidesWithDetails] Intentando búsqueda 1: driver_id como Firebase UID`);
      rides = await supabaseGet('rides', { driver_id: userId, deleted_at: null }, select, {
        limit: 10000,
        requireServiceRole: true,
      });
      console.log(`📊 [supabaseGetRidesWithDetails] Búsqueda 1 resultados: ${rides.length}`);
      
      if (rides.length === 0) {
        console.log(`⚠️ [supabaseGetRidesWithDetails] No encontrados con Firebase UID, intentando con UUID del conductor...`);
        
        try {
          console.log(`🔍 [supabaseGetRidesWithDetails] Buscando conductor en tabla drivers con user_id: ${userId}`);
          const driverData = await supabaseGet('drivers', { user_id: userId, deleted_at: null }, 'id', {
            requireServiceRole: true,
          });
          console.log(`📊 [supabaseGetRidesWithDetails] Conductores encontrados: ${driverData.length}`);
          
          if (driverData.length > 0) {
            const driverUUID = driverData[0].id;
            console.log(`✅ [supabaseGetRidesWithDetails] UUID del conductor encontrado: ${driverUUID}`);
            console.log(`🔎 [supabaseGetRidesWithDetails] Intentando búsqueda 2: driver_id como UUID`);
            rides = await supabaseGet('rides', { driver_id: driverUUID, deleted_at: null }, select, {
              limit: 10000,
              requireServiceRole: true,
            });
            console.log(`📊 [supabaseGetRidesWithDetails] Búsqueda 2 resultados: ${rides.length}`);
          } else {
            console.warn(`⚠️ [supabaseGetRidesWithDetails] Conductor no encontrado en tabla drivers`);
            console.log(`🔎 [supabaseGetRidesWithDetails] DEBUG: Obteniendo TODOS los conductores...`);
            const allDrivers = await supabaseGet('drivers', { deleted_at: null }, 'id,user_id,department,municipality,account_status', {
              requireServiceRole: true,
            });
            console.log(`📊 [supabaseGetRidesWithDetails] Total de conductores: ${allDrivers.length}`);
            if (allDrivers.length > 0) {
              console.log(`📊 [supabaseGetRidesWithDetails] Primeros 3 conductores:`, JSON.stringify(allDrivers.slice(0, 3), null, 2));
            }
          }
        } catch (driverError: any) {
          console.error(`❌ [supabaseGetRidesWithDetails] Error buscando conductor:`, driverError.message);
        }
      }
    } else {
      console.log(`🔎 [supabaseGetRidesWithDetails] Buscando viajes de cliente por client_id: ${userId}`);
      rides = await supabaseGet('rides', { client_id: userId, deleted_at: null }, select, {
        limit: 10000,
        requireServiceRole: true,
      });
      console.log(`📊 [supabaseGetRidesWithDetails] Viajes de cliente encontrados: ${rides.length}`);
    }
    
    console.log(`✅ [supabaseGetRidesWithDetails] Viajes con detalles: ${rides.length}`);
    if (rides.length > 0) {
      console.log(`📋 [supabaseGetRidesWithDetails] Primer viaje:`, JSON.stringify(rides[0], null, 2));
    } else {
      console.log(`🔎 [supabaseGetRidesWithDetails] DEBUG: No hay viajes, obteniendo TODOS...`);
      try {
        const allRides = await supabaseGet('rides', { deleted_at: null }, 'id,client_id,driver_id,status,created_at', {
          requireServiceRole: true,
        });
        console.log(`📊 [supabaseGetRidesWithDetails] Total de viajes en BD: ${allRides.length}`);
        if (allRides.length > 0) {
          console.log(`📊 [supabaseGetRidesWithDetails] Primeros 3 viajes:`, JSON.stringify(allRides.slice(0, 3), null, 2));
          
          const matchingRides = allRides.filter((r: any) => r.driver_id === userId || r.client_id === userId);
          console.log(`🔍 [supabaseGetRidesWithDetails] Viajes que coinciden con userId: ${matchingRides.length}`);
          if (matchingRides.length > 0) {
            console.log(`📋 [supabaseGetRidesWithDetails] Viajes coincidentes:`, JSON.stringify(matchingRides, null, 2));
          }
        }
      } catch (debugError: any) {
        console.error(`❌ [supabaseGetRidesWithDetails] Error en debug:`, debugError.message);
      }
    }
    
    console.log(`${'='.repeat(70)}\n`);
    return rides;
  } catch (error: any) {
    console.error(`❌ [supabaseGetRidesWithDetails] Error:`, error.message);
    console.error(`❌ [supabaseGetRidesWithDetails] Stack:`, error.stack);
    throw error;
  }
}
