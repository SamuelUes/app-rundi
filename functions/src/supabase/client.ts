/**
 * Cliente de Supabase REST API
 * Alternativa a conexión PostgreSQL directa (que no funciona en Firebase Functions)
 * 
 * ✅ Funciona en Firebase Functions
 * ✅ No requiere conexión PostgreSQL directa
 * ✅ Usa REST API de Supabase
 */

import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

dotenv.config();

// Obtener credenciales de Supabase
let supabaseUrl: string | undefined;
let supabaseAnonKey: string | undefined;
let supabaseServiceRoleKey: string | undefined;

type SupabaseRuntimeConfig = {
  url?: string;
  key?: string;
  service_role_key?: string;
  service_role?: string;
};

function loadRuntimeConfig(): SupabaseRuntimeConfig {
  const candidatePaths = [
    path.resolve(process.cwd(), '.runtimeconfig.json'),
    path.resolve(__dirname, '..', '..', '.runtimeconfig.json'),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (!existsSync(candidate)) {
        continue;
      }
      const raw = readFileSync(candidate, 'utf8');
      const json = JSON.parse(raw);
      if (json?.supabase) {
        console.log(`✅ [Supabase Client] Credenciales obtenidas de ${candidate}`);
        return json.supabase as SupabaseRuntimeConfig;
      }
    } catch (error: any) {
      console.log(`⚠️ [Supabase Client] No se pudo leer ${candidate}:`, error.message);
    }
  }

  return {};
}

const runtimeSupabase = loadRuntimeConfig();

supabaseUrl = process.env.SUPABASE_URL ?? runtimeSupabase.url;
supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? runtimeSupabase.key;
supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? runtimeSupabase.service_role_key ?? runtimeSupabase.service_role;

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
  console.error(`❌ [Supabase Client] ERROR: Credenciales de Supabase no configuradas`);
  console.error(`   SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`);
  console.error(`   SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✅' : '❌'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceRoleKey ? '✅' : '❌'}`);
  console.error(`   Configura en Firebase: firebase functions:config:set supabase.url="..." supabase.key="..."`);
  console.error(`   y opcionalmente supabase.service_role_key="..." para operaciones privilegiadas`);
}

console.log(`✅ [Supabase Client] Inicializado`);
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Clave anónima disponible: ${supabaseAnonKey ? '✅' : '❌'}`);
console.log(`   Clave service_role disponible: ${supabaseServiceRoleKey ? '✅' : '❌'}`);

function getAuthKey(requireServiceRole: boolean): string {
  if (requireServiceRole) {
    if (supabaseServiceRoleKey) {
      return supabaseServiceRoleKey;
    }
    throw new Error('Supabase service role key no configurada. Define supabase.service_role_key o SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (supabaseAnonKey) {
    return supabaseAnonKey;
  }

  if (supabaseServiceRoleKey) {
    return supabaseServiceRoleKey;
  }

  throw new Error('Supabase anon key no configurada. Define supabase.key o SUPABASE_ANON_KEY.');
}

function buildHeaders(requireServiceRole: boolean, extra?: Record<string, string>) {
  const key = getAuthKey(requireServiceRole);
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  } as Record<string, string>;
}

/**
 * Hacer una consulta GET a Supabase REST API
 * @param table - Tabla principal
 * @param filters - Filtros a aplicar
 * @param select - Campos a seleccionar (default: *)
 * @param limit - Límite de registros (default: 1000, max: 10000)
 */
export type SupabaseGetOptions = {
  limit?: number;
  requireServiceRole?: boolean;
  preferExactCount?: boolean;
  headers?: Record<string, string>;
};

export async function supabaseGet(
  table: string,
  filters?: Record<string, any>,
  select: string = '*',
  limitOrOptions: number | SupabaseGetOptions = 1000,
) {
  try {
    const options: SupabaseGetOptions =
      typeof limitOrOptions === 'number'
        ? { limit: limitOrOptions }
        : { limit: limitOrOptions.limit ?? 1000, ...limitOrOptions };

    const limit = Math.min(Math.max(options.limit ?? 1000, 1), 10000);

    // ✅ IMPORTANTE: Construir URL manualmente para NO codificar paréntesis en JOINs
    // Los paréntesis en Supabase JOINs NO deben estar codificados
    let urlString = `${supabaseUrl}/rest/v1/${table}?select=${select}&limit=${limit}`;
    
    // Agregar filtros con sintaxis correcta de Supabase
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        // Usar sintaxis: key=eq.value
        // ✅ IMPORTANTE: Codificar SOLO el valor, no los operadores
        const encodedValue = encodeURIComponent(value);
        urlString += `&${key}=eq.${encodedValue}`;
        console.log(`   Filtro: ${key}=eq.${encodedValue}`);
      });
    }
    
    console.log(`🔍 [Supabase GET] Tabla: ${table}, Filtros: ${JSON.stringify(filters)}`);
    console.log(`🔗 [Supabase GET] URL: ${urlString.substring(0, 200)}${urlString.length > 200 ? '...' : ''}`);
    
    const response = await fetch(urlString, {
      method: 'GET',
      headers: buildHeaders(options.requireServiceRole ?? false, {
        ...(options.preferExactCount ? { Prefer: 'count=exact' } : {}),
        ...options.headers,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Supabase GET] HTTP ${response.status}:`, errorText);
      console.error(`❌ [Supabase GET] Headers:`, {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
      });
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ [Supabase GET] Registros encontrados: ${data.length}`);
    console.log(`✅ [Supabase GET] Response headers:`, {
      'content-type': response.headers.get('content-type'),
      'content-range': response.headers.get('content-range'),
    });
    if (data.length > 0) {
      console.log(`📊 [Supabase GET] Primer registro:`, JSON.stringify(data[0], null, 2));
    }
    return data;
  } catch (error: any) {
    console.error(`❌ [Supabase GET] Error:`, error.message);
    throw error;
  }
}

/**
 * ✅ NUEVA: Función simplificada para obtener viajes del conductor
 * Busca directamente en la tabla rides sin JOINs complejos
 */
export async function supabaseGetSimpleRides(userId: string, userType: 'driver' | 'client') {
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚗 [supabaseGetSimpleRides] BÚSQUEDA SIMPLIFICADA`);
    console.log(`   userType: ${userType}`);
    console.log(`   userId: ${userId}`);
    console.log(`${'='.repeat(70)}`);
    
    const filterKey = userType === 'driver' ? 'driver_id' : 'client_id';
    
    // Paso 1: Obtener TODOS los viajes para ver qué hay
    console.log(`📋 Paso 1: Obteniendo TODOS los viajes...`);
    const allRides = await supabaseGet('rides', {}, 'id,client_id,driver_id,status,created_at,final_fare', {
      requireServiceRole: true,
    });
    console.log(`✅ Total de viajes en BD: ${allRides.length}`);
    
    if (allRides.length > 0) {
      console.log(`📊 Primeros 3 viajes:`);
      allRides.slice(0, 3).forEach((r: any, idx: number) => {
        console.log(`   ${idx + 1}. ID: ${r.id}, Client: ${r.client_id}, Driver: ${r.driver_id}, Status: ${r.status}`);
      });
    }
    
    // Paso 2: Filtrar por userId
    console.log(`\n📋 Paso 2: Filtrando por ${filterKey}=${userId}...`);
    const userRides = allRides.filter((r: any) => r[filterKey] === userId);
    console.log(`✅ Viajes encontrados para ${userType}: ${userRides.length}`);
    
    if (userRides.length > 0) {
      console.log(`📊 Viajes del usuario:`);
      userRides.forEach((r: any, idx: number) => {
        console.log(`   ${idx + 1}. ID: ${r.id}, Status: ${r.status}, Fare: ${r.final_fare}`);
      });
    }
    
    console.log(`${'='.repeat(70)}\n`);
    return userRides;
  } catch (error: any) {
    console.error(`❌ [supabaseGetSimpleRides] Error:`, error.message);
    throw error;
  }
}

/**
 * Obtener viajes con datos relacionados (JOIN con drivers, vehicles, payments, etc)
 * 
 * Estructura esperada:
 * {
 *   id, status, estimated_price, final_fare, estimated_distance, actual_distance,
 *   estimated_duration, actual_duration, created_at, completed_at, client_id, driver_id,
 *   drivers: { id, first_name, last_name, profile_photo, average_rating },
 *   payments: [{ id, amount, status, payment_method }],
 *   ride_locations: [{ id, latitude, longitude, address, location_type }]
 * }
 */
/**
 * ✅ OPTIMIZADO: Obtener viajes con ubicaciones y pagos en DOS consultas paralelas
 * En lugar de N+1 queries (1 por viaje), hacemos:
 * 1. Una consulta para rides
 * 2. Una consulta para TODAS las ubicaciones de esos viajes
 * 3. Una consulta para TODOS los pagos de esos viajes
 * Luego se relacionan en memoria
 */
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
    
    // 1️⃣ Obtener rides sin JOINs (Supabase puede procesar esto)
    const ridesSelect = 'id,status,estimated_price,final_fare,estimated_distance,actual_distance,estimated_duration,actual_duration,created_at,completed_at,requested_at,accepted_at,started_at,canceled_at,client_id,driver_id,payment_type,ride_type,vehicle_type,passengers,notes,waypoints_count,has_multiple_stops';
    
    let ridesUrl = `${supabaseUrl}/rest/v1/rides?select=${ridesSelect}`;
    ridesUrl += `&order=created_at.desc`;
    ridesUrl += `&limit=${limit}`;
    ridesUrl += `&offset=${offset}`;

    if (options?.rideId) {
      const encodedRideId = encodeURIComponent(options.rideId);
      ridesUrl += `&id=eq.${encodedRideId}`;
    } else {
      const encodedValue = encodeURIComponent(userId);
      ridesUrl += `&${filterKey}=eq.${encodedValue}`;
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
    
    // 2️⃣ Obtener TODAS las ubicaciones para estos viajes (en una sola consulta)
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
    
    // 3️⃣ Obtener TODOS los pagos para estos viajes (en una sola consulta)
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
    
    // 4️⃣ Relacionar datos en memoria
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

      // DEBUG: Loguear primeros 3 viajes
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

/**
 * Obtener ubicaciones de un viaje (ordenadas por location_order)
 * ✅ IMPORTANTE: Obtiene origin, waypoints y destination en orden
 * ⚠️ DEPRECATED: Usar supabaseGetRidesWithLocationsAndPayments en su lugar
 */
export async function supabaseGetRideLocations(rideId: string) {
  try {
    // ✅ NUEVO: Construir URL con order by para obtener ubicaciones en orden
    const url = new URL(`${supabaseUrl}/rest/v1/ride_locations`);
    url.searchParams.append('ride_id', `eq.${rideId}`);
    url.searchParams.append('select', 'id,latitude,longitude,address,location_type,location_order');
    url.searchParams.append('order', 'location_order.asc'); // Ordenar por location_order ascendente
    
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

/**
 * Obtener pagos de un viaje
 */
export async function supabaseGetRidePayments(rideId: string) {
  try {
    const payments = await supabaseGet('payments', { ride_id: rideId }, 'id,amount,status,payment_method,tip', {
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
    
    // ✅ IMPORTANTE: NO usar JOINs en el select (causa error 300 en Supabase)
    // Obtener SOLO campos de rides, sin relaciones
    // Los pagos y ubicaciones se obtienen en consultas separadas si es necesario
    const select = `id,status,estimated_price,final_fare,estimated_distance,actual_distance,estimated_duration,actual_duration,created_at,completed_at,requested_at,accepted_at,started_at,canceled_at,client_id,driver_id,payment_type,ride_type,vehicle_type,passengers,notes,origin_location_id,destination_location_id,waypoints_count,has_multiple_stops`;
    
    console.log(`🚗 [supabaseGetRidesWithDetails] Obteniendo viajes para ${userType}: ${userId}`);
    console.log(`🔍 [supabaseGetRidesWithDetails] Filtrando por: ${filterKey}=${userId}`);
    
    let rides: any[] = [];
    
    // Si es conductor, intentar primero con Firebase UID, luego con UUID
    if (userType === 'driver') {
      console.log(`🔎 [supabaseGetRidesWithDetails] Intentando búsqueda 1: driver_id como Firebase UID`);
      rides = await supabaseGet('rides', { driver_id: userId }, select, {
        limit: 10000,
        requireServiceRole: true,
      });
      console.log(`📊 [supabaseGetRidesWithDetails] Búsqueda 1 resultados: ${rides.length}`);
      
      if (rides.length === 0) {
        console.log(`⚠️ [supabaseGetRidesWithDetails] No encontrados con Firebase UID, intentando con UUID del conductor...`);
        
        // Obtener UUID del conductor desde tabla drivers
        try {
          console.log(`🔍 [supabaseGetRidesWithDetails] Buscando conductor en tabla drivers con user_id: ${userId}`);
          const driverData = await supabaseGet('drivers', { user_id: userId }, 'id', {
            requireServiceRole: true,
          });
          console.log(`📊 [supabaseGetRidesWithDetails] Conductores encontrados: ${driverData.length}`);
          
          if (driverData.length > 0) {
            const driverUUID = driverData[0].id;
            console.log(`✅ [supabaseGetRidesWithDetails] UUID del conductor encontrado: ${driverUUID}`);
            console.log(`🔎 [supabaseGetRidesWithDetails] Intentando búsqueda 2: driver_id como UUID`);
            rides = await supabaseGet('rides', { driver_id: driverUUID }, select, {
              limit: 10000,
              requireServiceRole: true,
            });
            console.log(`📊 [supabaseGetRidesWithDetails] Búsqueda 2 resultados: ${rides.length}`);
          } else {
            console.warn(`⚠️ [supabaseGetRidesWithDetails] Conductor no encontrado en tabla drivers`);
            // DEBUG: Obtener todos los conductores para ver qué hay
            console.log(`🔎 [supabaseGetRidesWithDetails] DEBUG: Obteniendo TODOS los conductores...`);
            const allDrivers = await supabaseGet('drivers', {}, 'id,user_id,first_name,last_name', {
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
      // Para clientes, buscar por client_id (Firebase UID)
      console.log(`🔎 [supabaseGetRidesWithDetails] Buscando viajes de cliente por client_id: ${userId}`);
      rides = await supabaseGet('rides', { client_id: userId }, select, {
        limit: 10000,
        requireServiceRole: true,
      });
      console.log(`📊 [supabaseGetRidesWithDetails] Viajes de cliente encontrados: ${rides.length}`);
    }
    
    console.log(`✅ [supabaseGetRidesWithDetails] Viajes con detalles: ${rides.length}`);
    if (rides.length > 0) {
      console.log(`📋 [supabaseGetRidesWithDetails] Primer viaje:`, JSON.stringify(rides[0], null, 2));
    } else {
      // DEBUG: Si no hay viajes, obtener todos para ver qué hay
      console.log(`🔎 [supabaseGetRidesWithDetails] DEBUG: No hay viajes, obteniendo TODOS...`);
      try {
        const allRides = await supabaseGet('rides', {}, 'id,client_id,driver_id,status,created_at', {
          requireServiceRole: true,
        });
        console.log(`📊 [supabaseGetRidesWithDetails] Total de viajes en BD: ${allRides.length}`);
        if (allRides.length > 0) {
          console.log(`📊 [supabaseGetRidesWithDetails] Primeros 3 viajes:`, JSON.stringify(allRides.slice(0, 3), null, 2));
          
          // Verificar si alguno coincide con el userId
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

/**
 * Obtener perfil del conductor con vehículos
 */
export async function supabaseGetDriverWithVehicles(userId: string) {
  try {
    // Seleccionar campos del conductor y sus vehículos relacionados
    const select = `
      id,
      user_id,
      profile_photo,
      license_number,
      license_expiry,
      license_photo_front,
      license_photo_back,
      department,
      municipality,
      account_status,
      documents_status,
      verified_at,
      total_rides,
      average_rating,
      total_earnings,
      created_at,
      updated_at,
      vehicles(
        id,
        driver_id,
        plate,
        brand,
        model,
        year,
        color,
        type,
        is_active,
        registration_number,
        registration_expiry,
        registration_photo_front,
        registration_photo_back,
        insurance_number,
        insurance_company,
        insurance_expiry,
        insurance_photo,
        vehicle_photo
      )
    `.replace(/\s+/g, '');
    
    console.log(`👤 [supabaseGetDriverWithVehicles] Obteniendo conductor con vehículos: ${userId}`);
    
    const drivers = await supabaseGet('drivers', { user_id: userId }, select, {
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
        license_photo: driver.license_photo ? '✅' : '❌',
      });
      return driver;
    }
    
    console.warn(`⚠️ [supabaseGetDriverWithVehicles] No se encontró conductor con user_id: ${userId}`);
    return null;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Hacer una consulta POST a Supabase REST API
 */
export async function supabasePost(table: string, data: Record<string, any>) {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(true, { Prefer: 'return=representation' }),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error(`❌ [Supabase POST] Error:`, error.message);
    throw error;
  }
}

/**
 * Hacer una consulta UPDATE a Supabase REST API
 */
export async function supabaseUpdate(table: string, id: string, data: Record<string, any>) {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: buildHeaders(true, { Prefer: 'return=representation' }),
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error(`❌ [Supabase UPDATE] Error:`, error.message);
    throw error;
  }
}

/**
 * Hacer una consulta DELETE a Supabase REST API
 */
export async function supabaseDelete(table: string, id: string) {
  try {
    const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(true),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Supabase DELETE] Error:`, error.message);
    throw error;
  }
}
