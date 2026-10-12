/**
 * Ride History API
 * Historial de viajes y ganancias
 */

import * as functions from 'firebase-functions/v1';
import { supabaseGetRidesWithLocationsAndPayments, supabaseGet, supabaseGetDriverWithVehicles, supabaseGetDriversWithVehiclesBatch } from '../supabase/client';
import { firestore } from '../config/firebase';
import { ensureActiveSession } from '../utils/sessionUtils';

type RideContext = {
  userProfiles: Record<string, any>;
  driverDetails: Record<string, any>;
};

const parseFloatSafe = (value: any, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseFloatNullable = (value: any): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toTimestamp = (value: any): number | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const getDateRange = (period?: string, startDate?: string, endDate?: string): { start: number; end: number } | null => {
  if (!period || period === 'all') {
    return null;
  }

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  const toStartOfDay = (d: Date) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const toEndOfDay = (d: Date) => {
    d.setHours(23, 59, 59, 999);
    return d;
  };

  switch (period) {
    case 'today': {
      return {
        start: toStartOfDay(start).getTime(),
        end: toEndOfDay(end).getTime(),
      };
    }
    case 'week': {
      const startOfWeek = toStartOfDay(start);
      startOfWeek.setDate(startOfWeek.getDate() - 6);
      return {
        start: startOfWeek.getTime(),
        end: toEndOfDay(end).getTime(),
      };
    }
    case 'month': {
      const startOfMonth = toStartOfDay(start);
      startOfMonth.setMonth(startOfMonth.getMonth() - 1);
      return {
        start: startOfMonth.getTime(),
        end: toEndOfDay(end).getTime(),
      };
    }
    case 'custom': {
      if (!startDate || !endDate) {
        return null;
      }

      const customStart = new Date(startDate);
      const customEnd = new Date(endDate);

      if (Number.isNaN(customStart.getTime()) || Number.isNaN(customEnd.getTime())) {
        return null;
      }

      return {
        start: toStartOfDay(customStart).getTime(),
        end: toEndOfDay(customEnd).getTime(),
      };
    }
    default:
      return null;
  }
};

const filterRidesByDateRange = (rides: any[], range: { start: number; end: number } | null) => {
  if (!range) return rides;

  return rides.filter((ride: any) => {
    const rawTimestamp =
      typeof ride.completedAt === 'number' && !Number.isNaN(ride.completedAt)
        ? ride.completedAt
        : typeof ride.primaryPayment?.paidAt === 'number'
          ? ride.primaryPayment.paidAt
          : typeof ride.createdAt === 'number'
            ? ride.createdAt
            : null;

    if (!rawTimestamp) {
      return false;
    }

    return rawTimestamp >= range.start && rawTimestamp <= range.end;
  });
};

const buildDisplayName = (profile: any): string | null => {
  if (!profile) return null;
  const candidates = [
    profile.displayName,
    profile.fullName,
    profile.name,
    [profile.firstName, profile.lastName]
      .filter((part: any) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim(),
  ].filter((value: any) => typeof value === 'string' && value.trim().length > 0);

  return candidates.length > 0 ? String(candidates[0]).trim() : null;
};

const fetchRideContext = async (rides: any[]): Promise<RideContext> => {
  const driverIds = Array.from(new Set(
    rides
      .map((ride: any) => ride.driver_id)
      .filter((id: string | null | undefined) => typeof id === 'string' && id.trim().length > 0),
  )) as string[];

  const clientIds = Array.from(new Set(
    rides
      .map((ride: any) => ride.client_id)
      .filter((id: string | null | undefined) => typeof id === 'string' && id.trim().length > 0),
  )) as string[];

  const userProfiles: Record<string, any> = {};
  let driverDetails: Record<string, any> = {};

  // ✅ Grupo 7 (H6): Batch queries para resolver N+1.
  // Antes: N queries individuales a Firestore + N queries individuales a Supabase.
  // Ahora: 1 query batch a Firestore (getAll) + 1 query batch a Supabase (in filter).
  const userIds = Array.from(new Set([...driverIds, ...clientIds]));
  if (userIds.length > 0) {
    try {
      // Firestore: getAll() obtiene múltiples documentos en una sola petición
      const docRefs = userIds.map(uid => firestore.collection('users').doc(uid));
      const docSnaps = await firestore.getAll(...docRefs);
      docSnaps.forEach((docSnap, index) => {
        if (docSnap.exists) {
          userProfiles[userIds[index]] = docSnap.data();
        }
      });
    } catch (err: any) {
      console.warn(`⚠️ [rideHistory] Error obteniendo perfiles de usuario en batch:`, err.message);
      // Fallback: intentar individualmente si el batch falla
      await Promise.all(userIds.map(async (uid) => {
        try {
          const docSnap = await firestore.collection('users').doc(uid).get();
          if (docSnap.exists) {
            userProfiles[uid] = docSnap.data();
          }
        } catch (err: any) {
          console.warn(`⚠️ [rideHistory] Error obteniendo perfil de usuario ${uid}:`, err.message);
        }
      }));
    }
  }

  if (driverIds.length > 0) {
    try {
      // Supabase: una sola petición con filtro `in` para todos los driverIds
      driverDetails = await supabaseGetDriversWithVehiclesBatch(driverIds);
    } catch (err: any) {
      console.warn(`⚠️ [rideHistory] Error obteniendo conductores en batch:`, err.message);
      // Fallback: intentar individualmente si el batch falla
      await Promise.all(driverIds.map(async (driverId) => {
        try {
          const driverProfile = await supabaseGetDriverWithVehicles(driverId);
          if (driverProfile) {
            driverDetails[driverId] = driverProfile;
          }
        } catch (err: any) {
          console.warn(`⚠️ [rideHistory] Error obteniendo datos del conductor ${driverId} en Supabase:`, err.message);
        }
      }));
    }
  }

  return { userProfiles, driverDetails };
};

const mapRide = (ride: any, index: number, context: RideContext) => {
  const driverSupabase = ride.driver_id ? (context.driverDetails[ride.driver_id] || null) : null;
  const driverUserProfile = ride.driver_id ? (context.userProfiles[ride.driver_id] || null) : null;
  const clientUserProfile = ride.client_id ? (context.userProfiles[ride.client_id] || null) : null;

  const locationsRaw: any[] = Array.isArray(ride.ride_locations) ? ride.ride_locations : [];
  const orderedLocations = locationsRaw
    .slice()
    .sort((a: any, b: any) => (a.location_order ?? 0) - (b.location_order ?? 0))
    .map((loc: any) => ({
      ...loc,
      address:
        typeof loc.address === 'string' && loc.address.trim().length > 0
          ? loc.address
          : `${Number(loc.latitude).toFixed(6)}, ${Number(loc.longitude).toFixed(6)}`,
    }));

  let originAddress = ride.origin_address || 'Origen desconocido';
  let destinationAddress = ride.destination_address || 'Destino desconocido';
  if (orderedLocations.length > 0) {
    const originLoc = orderedLocations.find((loc: any) => loc.location_type === 'origin');
    const destLoc = orderedLocations.find((loc: any) => loc.location_type === 'destination');
    if (originLoc?.address) originAddress = originLoc.address;
    if (destLoc?.address) destinationAddress = destLoc.address;
  }

  const allAddresses = orderedLocations
    .map((loc: any) => loc.address)
    .filter((address: string | null | undefined) => Boolean(address && address.trim().length > 0));

  const paymentsRaw: any[] = Array.isArray(ride.payments) ? ride.payments : [];
  const payments = paymentsRaw.map((p: any) => ({
    id: p.id,
    amount: parseFloatSafe(p.amount),
    tip: parseFloatSafe(p.tip),
    commission: parseFloatNullable(p.commission),
    status: p.status,
    paymentMethod: p.payment_method,
    paidAt: toTimestamp(p.paid_at),
    createdAt: toTimestamp(p.created_at),
    updatedAt: toTimestamp(p.updated_at),
  }));

  const primaryPayment = paymentsRaw.reduce((latest: any, current: any) => {
    if (!latest) return current;
    const latestTs = latest?.paid_at ? new Date(latest.paid_at).getTime() : 0;
    const currentTs = current?.paid_at ? new Date(current.paid_at).getTime() : 0;
    return currentTs >= latestTs ? current : latest;
  }, null);

  if (index < 3) {
    console.log(`📍 [rideHistory] Viaje ${index}: ${ride.id}`);
    console.log(`   ride_locations: ${orderedLocations.length} ubicaciones`);
    if (orderedLocations.length > 0) {
      console.log(`   Primeras ubicaciones:`, JSON.stringify(orderedLocations.slice(0, 2), null, 2));
    }
  }

  const finalFareFromPrimary = primaryPayment ? parseFloatSafe(primaryPayment.amount) : null;
  const commissionFromPrimary = primaryPayment && primaryPayment.commission !== undefined
    ? parseFloatSafe(primaryPayment.commission)
    : null;

  const driverDisplayName = buildDisplayName(driverUserProfile)
    || buildDisplayName(driverSupabase)
    || [driverSupabase?.first_name, driverSupabase?.last_name]
      .filter((part: any) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim() || null;

  const clientDisplayName = buildDisplayName(clientUserProfile) || null;

  const driverVehicles = Array.isArray(driverSupabase?.vehicles)
    ? driverSupabase.vehicles.map((vehicle: any) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        type: vehicle.type,
        isActive: vehicle.is_active,
        registrationNumber: vehicle.registration_number ?? vehicle.registrationNumber ?? null,
        insuranceCompany: vehicle.insurance_company ?? vehicle.insuranceCompany ?? null,
      }))
    : [];

  const primaryVehicle = driverVehicles.find((vehicle: any) => vehicle.isActive) || driverVehicles[0] || null;

  return {
    id: ride.id,
    status: ride.status,
    estimatedPrice: parseFloatSafe(ride.estimated_price),
    estimatedFare: parseFloatSafe(ride.estimated_price),
    finalFare: finalFareFromPrimary !== null ? finalFareFromPrimary : parseFloatSafe(ride.final_fare),
    commission: commissionFromPrimary !== null ? commissionFromPrimary : (payments[0]?.commission ?? null),
    distance: ride.actual_distance || ride.estimated_distance || 0,
    estimatedDistance: ride.estimated_distance || 0,
    actualDistance: ride.actual_distance || null,
    duration: ride.actual_duration || ride.estimated_duration || 0,
    estimatedDuration: ride.estimated_duration || 0,
    actualDuration: ride.actual_duration || null,
    originAddress,
    destinationAddress,
    allAddresses,
    hasMultipleStops: Boolean(ride.has_multiple_stops || orderedLocations.some((loc: any) => loc.location_type === 'waypoint')),
    waypointsCount: ride.waypoints_count ?? orderedLocations.filter((loc: any) => loc.location_type === 'waypoint').length,
    createdAt: toTimestamp(ride.created_at),
    completedAt: toTimestamp(ride.completed_at),
    requestedAt: toTimestamp(ride.requested_at),
    acceptedAt: toTimestamp(ride.accepted_at),
    startedAt: toTimestamp(ride.started_at),
    canceledAt: toTimestamp(ride.canceled_at),
    updatedAt: toTimestamp(ride.updated_at),
    timeline: {
      requestedAt: toTimestamp(ride.requested_at),
      acceptedAt: toTimestamp(ride.accepted_at),
      startedAt: toTimestamp(ride.started_at),
      completedAt: toTimestamp(ride.completed_at),
      canceledAt: toTimestamp(ride.canceled_at),
    },
    clientId: ride.client_id,
    driverId: ride.driver_id,
    paymentType: ride.payment_type,
    rideType: ride.ride_type,
    vehicleType: ride.vehicle_type,
    passengers: ride.passengers || 1,
    notes: ride.notes,
    driver: ride.driver_id ? {
      id: ride.driver_id,
      name: driverDisplayName,
      email: driverUserProfile?.email || driverSupabase?.email || null,
      phone: driverUserProfile?.phoneNumber || driverUserProfile?.phone || driverSupabase?.phone || null,
      licenseNumber: driverSupabase?.license_number ?? driverSupabase?.licenseNumber ?? null,
      rating: driverSupabase?.average_rating ?? null,
      totalRides: driverSupabase?.total_rides ?? null,
      photo: driverSupabase?.profile_photo || driverUserProfile?.photoURL || driverUserProfile?.photoUrl || null,
      vehicles: driverVehicles,
      department: driverSupabase?.department ?? null,
      municipality: driverSupabase?.municipality ?? null,
    } : null,
    client: ride.client_id ? {
      id: ride.client_id,
      name: clientDisplayName,
      email: clientUserProfile?.email || null,
      phone: clientUserProfile?.phoneNumber || clientUserProfile?.phone || null,
    } : null,
    vehicle: primaryVehicle ? {
      id: primaryVehicle.id,
      brand: primaryVehicle.brand ?? null,
      model: primaryVehicle.model ?? null,
      color: primaryVehicle.color ?? null,
      plate: primaryVehicle.plate ?? null,
      type: primaryVehicle.type ?? null,
      year: primaryVehicle.year ?? null,
      registrationNumber: primaryVehicle.registrationNumber ?? null,
      insuranceCompany: primaryVehicle.insuranceCompany ?? null,
    } : null,
    payments,
    locations: orderedLocations.map((loc: any) => ({
      id: loc.id,
      latitude: parseFloatSafe(loc.latitude),
      longitude: parseFloatSafe(loc.longitude),
      address: loc.address,
      type: loc.location_type,
      order: loc.location_order,
    })),
    primaryPayment: primaryPayment ? {
      id: primaryPayment.id,
      amount: parseFloatSafe(primaryPayment.amount),
      tip: parseFloatSafe(primaryPayment.tip),
      commission: primaryPayment.commission !== undefined && primaryPayment.commission !== null
        ? parseFloatSafe(primaryPayment.commission)
        : null,
      status: primaryPayment.status,
      paymentMethod: primaryPayment.payment_method,
      paidAt: toTimestamp(primaryPayment.paid_at),
      createdAt: toTimestamp(primaryPayment.created_at),
      updatedAt: toTimestamp(primaryPayment.updated_at),
    } : null,
  };
};

export const mapRides = async (rides: any[]) => {
  if (!Array.isArray(rides) || rides.length === 0) {
    return [];
  }

  const context = await fetchRideContext(rides);
  return rides.map((ride: any, index: number) => mapRide(ride, index, context));
};

const fetchAllRidesForUser = async (
  userId: string,
  userType: 'driver' | 'client',
  pageSize: number = 200,
) => {
  const limit = Math.min(Math.max(pageSize, 1), 200);
  let offset = 0;
  let totalCount: number | null = null;
  const rawRides: any[] = [];

  while (true) {
    const result = await supabaseGetRidesWithLocationsAndPayments(userId, userType, {
      limit,
      offset,
      includeTotals: true,
    });

    const ridesBatch: any[] = Array.isArray(result) ? result : (result?.rides ?? []);
    rawRides.push(...ridesBatch);

    if (typeof result?.totalCount === 'number' && !Number.isNaN(result.totalCount)) {
      totalCount = result.totalCount;
    }

    if (ridesBatch.length < limit) {
      break;
    }

    offset += limit;

    if (totalCount !== null && rawRides.length >= totalCount) {
      break;
    }
  }

  return {
    rawRides,
    totalCount: totalCount ?? rawRides.length,
  };
};

/**
 * Función de diagnóstico - Verificar por qué no se encuentran viajes
 */
export const diagnosticRides = functions.https.onCall(async (data, context) => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔧 [diagnosticRides] INICIANDO DIAGNÓSTICO`);
  console.log(`${'='.repeat(70)}\n`);
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;
    console.log(`👤 Usuario ID: ${userId}`);

    // Paso 1: Obtener TODOS los viajes
    console.log(`\n📋 PASO 1: Obteniendo TODOS los viajes...`);
    const allRides = await supabaseGet('rides', { deleted_at: null }, 'id,client_id,driver_id,status,created_at,final_fare', {
      requireServiceRole: true,
    });
    console.log(`✅ Total de viajes en BD: ${allRides.length}`);
    
    if (allRides.length === 0) {
      console.log(`⚠️ NO HAY VIAJES EN LA BD`);
      return {
        success: false,
        error: 'No hay viajes en la BD',
        diagnosis: 'La tabla rides está vacía',
      };
    }

    console.log(`📊 Primeros 5 viajes:`);
    allRides.slice(0, 5).forEach((ride: any, idx: number) => {
      console.log(`   ${idx + 1}. ID: ${ride.id}`);
      console.log(`      Client: ${ride.client_id || 'NULL'}`);
      console.log(`      Driver: ${ride.driver_id || 'NULL'}`);
      console.log(`      Status: ${ride.status}`);
      console.log(`      Fare: ${ride.final_fare || 'N/A'}`);
    });

    // Paso 2: Buscar viajes del usuario actual
    console.log(`\n📋 PASO 2: Buscando viajes para usuario actual (${userId})...`);
    
    // Búsqueda como cliente
    console.log(`   - Buscando como CLIENT_ID...`);
    const ridesAsClient = await supabaseGet('rides', { client_id: userId, deleted_at: null }, 'id,client_id,driver_id,status', {
      requireServiceRole: true,
    });
    console.log(`   ✅ Viajes como cliente: ${ridesAsClient.length}`);
    
    // Búsqueda como conductor
    console.log(`   - Buscando como DRIVER_ID...`);
    const ridesAsDriver = await supabaseGet('rides', { driver_id: userId, deleted_at: null }, 'id,client_id,driver_id,status', {
      requireServiceRole: true,
    });
    console.log(`   ✅ Viajes como conductor: ${ridesAsDriver.length}`);

    // Paso 3: Analizar qué client_ids y driver_ids hay en la BD
    console.log(`\n📋 PASO 3: Analizando IDs únicos en la BD...`);
    const uniqueClientIds = [...new Set(allRides.map((r: any) => r.client_id))];
    const uniqueDriverIds = [...new Set(allRides.map((r: any) => r.driver_id).filter((id: any) => id))];
    
    console.log(`   - Client IDs únicos: ${uniqueClientIds.length}`);
    uniqueClientIds.slice(0, 5).forEach((id: any) => {
      console.log(`     • ${id}`);
    });
    
    console.log(`   - Driver IDs únicos: ${uniqueDriverIds.length}`);
    uniqueDriverIds.slice(0, 5).forEach((id: any) => {
      console.log(`     • ${id}`);
    });

    // Paso 4: Verificar si el usuario está en alguna lista
    console.log(`\n📋 PASO 4: ¿Está el usuario en alguna lista?`);
    const isClient = uniqueClientIds.includes(userId);
    const isDriver = uniqueDriverIds.includes(userId);
    
    console.log(`   - ¿Es cliente? ${isClient ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   - ¿Es conductor? ${isDriver ? '✅ SÍ' : '❌ NO'}`);

    if (!isClient && !isDriver) {
      console.log(`\n⚠️ PROBLEMA: El usuario NO está en ningún viaje`);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ DIAGNÓSTICO COMPLETADO`);
    console.log(`${'='.repeat(70)}\n`);

    return {
      success: true,
      diagnosis: {
        userId,
        totalRidesInBD: allRides.length,
        ridesAsClient: ridesAsClient.length,
        ridesAsDriver: ridesAsDriver.length,
        isClientInBD: isClient,
        isDriverInBD: isDriver,
        uniqueClientIds: uniqueClientIds.slice(0, 10),
        uniqueDriverIds: uniqueDriverIds.slice(0, 10),
      },
    };
  } catch (error: any) {
    console.error(`\n${'='.repeat(70)}`);
    console.error(`❌ DIAGNÓSTICO FALLÓ`);
    console.error(`❌ Error:`, error.message);
    console.error(`❌ Stack:`, error.stack);
    console.error(`${'='.repeat(70)}\n`);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener mis viajes (cliente o conductor)
 */
export const getMyRides = functions.https.onCall(async (data, context) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 [getMyRides] INICIANDO FUNCIÓN`);
  console.log(`🚀 [getMyRides] Timestamp: ${new Date().toISOString()}`);
  console.log(`🚀 [getMyRides] Data recibida:`, JSON.stringify(data));
  console.log(`🚀 [getMyRides] Auth UID:`, context.auth?.uid);
  console.log(`${'='.repeat(60)}\n`);
  
  if (!context.auth) {
    console.error(`❌ [getMyRides] Usuario no autenticado`);
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);
  try {
    const userId = context.auth.uid;
    const {
      userType = 'client',
      limit = 100,
      offset = 0,
    } = data || {}; // 'client' o 'driver'

    console.log(`📋 [getMyRides] Obteniendo viajes para ${userType}: ${userId}`);

    // ✅ OPTIMIZADO: Una sola consulta que obtiene rides + ride_locations + payments
    let supabaseResult: any = [];
    try {
      supabaseResult = await supabaseGetRidesWithLocationsAndPayments(
        userId,
        userType as 'driver' | 'client',
        {
          limit,
          offset,
          includeTotals: true,
        },
      );
      const ridesCount = Array.isArray(supabaseResult)
        ? supabaseResult.length
        : supabaseResult?.rides?.length || 0;
      console.log(`📦 [getMyRides] Viajes obtenidos: ${ridesCount}`);
    } catch (dbError: any) {
      console.error(`❌ [getMyRides] Error en Supabase REST API:`, dbError.message);
      supabaseResult = { rides: [], totalCount: 0 };
    }

    const ridesList: any[] = Array.isArray(supabaseResult)
      ? supabaseResult
      : (supabaseResult?.rides || []);

    const totalCount: number = Array.isArray(supabaseResult)
      ? ridesList.length
      : (typeof supabaseResult?.totalCount === 'number' ? supabaseResult.totalCount : ridesList.length);

    const mappedRides = await mapRides(ridesList);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [getMyRides] COMPLETADO EXITOSAMENTE`);
    console.log(`📊 [getMyRides] Viajes retornados: ${mappedRides.length}`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      success: true,
      rides: mappedRides,
      totalCount,
    };
  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [getMyRides] ERROR`);
    console.error(`❌ [getMyRides] Mensaje:`, error.message);
    console.error(`❌ [getMyRides] Stack:`, error.stack);
    console.error(`${'='.repeat(60)}\n`);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener ganancias del conductor
 */
export const getDriverEarnings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);
  try {
    const driverId = context.auth.uid;
    console.log(`💰 [getDriverEarnings] Obteniendo ganancias para conductor: ${driverId}`);
    const { period = 'all', startDate, endDate } = data || {};
    const dateRange = getDateRange(period, startDate, endDate);

    if (dateRange) {
      console.log(
        `🗓️ [getDriverEarnings] Aplicando rango de fechas - inicio: ${new Date(dateRange.start).toISOString()}, fin: ${new Date(dateRange.end).toISOString()}`,
      );
    }

    // Obtener todos los viajes completados del conductor con datos de pagos
    let rides: any[] = [];
    try {
      console.log(`📊 [getDriverEarnings] Buscando viajes en BD para: ${driverId}`);

      const { rawRides, totalCount } = await fetchAllRidesForUser(driverId, 'driver');
      rides = await mapRides(rawRides);
      console.log(`📊 [getDriverEarnings] Viajes encontrados: ${rides.length}${totalCount ? ` / ${totalCount}` : ''}`);
    } catch (dbError: any) {
      console.error(`❌ [getDriverEarnings] Error en Supabase REST API (${dbError.message})`);
      rides = [];
    }
    const completedRides = rides.filter((r: any) => r.status === 'completed');
    const filteredCompletedRides = filterRidesByDateRange(completedRides, dateRange);

    // Calcular ganancias desde tabla payments si existe, sino desde rides
    const totals = filteredCompletedRides.reduce((acc: { gross: number; commission: number; tips: number }, ride: any) => {
      const fare = ride.primaryPayment?.amount ?? ride.finalFare ?? ride.estimatedPrice ?? 0;
      const commission = ride.primaryPayment?.commission ?? ride.commission ?? 0;
      const tip = ride.primaryPayment?.tip ?? ride.payments?.[0]?.tip ?? 0;
      return {
        gross: acc.gross + fare,
        commission: acc.commission + commission,
        tips: acc.tips + (tip || 0),
      };
    }, { gross: 0, commission: 0, tips: 0 });

    const totalNet = totals.gross - totals.commission;

    const totalRides = filteredCompletedRides.length;
    const averageNetEarning = totalRides > 0 ? totalNet / totalRides : 0;

    return {
      success: true,
      earnings: {
        totalEarnings: Math.round(totals.gross * 100) / 100,
        totalRides,
        averageEarning: Math.round(averageNetEarning * 100) / 100,
        totalCommission: Math.round(totals.commission * 100) / 100,
        totalTips: Math.round(totals.tips * 100) / 100,
        netEarnings: Math.round(totalNet * 100) / 100,
        completedRides: filteredCompletedRides.map((r: any) => ({
          id: r.id,
          fare: r.primaryPayment?.amount ?? r.finalFare ?? 0,
          commission: r.primaryPayment?.commission ?? r.commission ?? 0,
          tip: r.primaryPayment?.tip ?? r.payments?.[0]?.tip ?? 0,
          driverEarning: Math.round(((r.primaryPayment?.amount ?? r.finalFare ?? 0) - (r.primaryPayment?.commission ?? r.commission ?? 0)) * 100) / 100,
          completedAt: r.completedAt,
          paymentStatus: r.primaryPayment?.status ?? 'pending',
          origin: r.originAddress,
          destination: r.destinationAddress,
          distance: r.distance,
          duration: r.duration,
          paymentMethod: r.primaryPayment?.paymentMethod ?? r.payments?.[0]?.paymentMethod ?? null,
          paidAt: r.primaryPayment?.paidAt ?? null,
          paymentCreatedAt: r.primaryPayment?.createdAt ?? null,
          createdAt: r.createdAt ?? null,
          requestedAt: r.requestedAt ?? null,
          acceptedAt: r.acceptedAt ?? null,
          startedAt: r.startedAt ?? null,
          canceledAt: r.canceledAt ?? null,
        })),
      },
    };
  } catch (error: any) {
    console.error('❌ [getDriverEarnings] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener estadísticas del conductor
 */
export const getDriverStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);
  try {
    const driverId = context.auth.uid;
    console.log(`📊 [getDriverStats] Obteniendo estadísticas para conductor: ${driverId}`);
    const { period = 'all', startDate, endDate } = data || {};
    const dateRange = getDateRange(period, startDate, endDate);

    if (dateRange) {
      console.log(
        `🗓️ [getDriverStats] Aplicando rango de fechas - inicio: ${new Date(dateRange.start).toISOString()}, fin: ${new Date(dateRange.end).toISOString()}`,
      );
    }

    // Obtener todos los viajes del conductor con detalles
    let rides: any[] = [];
    try {
      const { rawRides, totalCount } = await fetchAllRidesForUser(driverId, 'driver');
      rides = await mapRides(rawRides);
      console.log(`📊 [getDriverStats] Viajes encontrados: ${rides.length}${totalCount ? ` / ${totalCount}` : ''}`);
    } catch (dbError: any) {
      console.error(`❌ [getDriverStats] Error en Supabase REST API (${dbError.message}). Retornando stats vacías`);
      rides = [];
    }
    const completedRides = rides.filter((r: any) => r.status === 'completed');
    const canceledRides = rides.filter((r: any) => r.status === 'canceled');

    const filteredCompletedRides = filterRidesByDateRange(completedRides, dateRange);
    const filteredCanceledRides = filterRidesByDateRange(canceledRides, dateRange);
    const filteredAllRides = filterRidesByDateRange(rides, dateRange);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const startOfWeek = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const completedToday = completedRides.filter((r: any) => {
      const time = r.completedAt ? new Date(r.completedAt).getTime() : null;
      return time !== null && time >= startOfToday && time < endOfToday;
    });
    const completedWeek = completedRides.filter((r: any) => {
      const time = r.completedAt ? new Date(r.completedAt).getTime() : null;
      return time !== null && time >= startOfWeek;
    });
    const completedMonth = completedRides.filter((r: any) => {
      const time = r.completedAt ? new Date(r.completedAt).getTime() : null;
      return time !== null && time >= startOfMonth;
    });

    // Calcular estadísticas desde payments y rides
    const totals = filteredCompletedRides.reduce((acc: { gross: number; commission: number }, ride: any) => {
      const fare = ride.primaryPayment?.amount ?? ride.finalFare ?? ride.estimatedPrice ?? 0;
      const commission = ride.primaryPayment?.commission ?? ride.commission ?? 0;
      return {
        gross: acc.gross + fare,
        commission: acc.commission + commission,
      };
    }, { gross: 0, commission: 0 });

    const totalNet = totals.gross - totals.commission;
    const averageEarning = filteredCompletedRides.length > 0
      ? Math.round((totalNet / filteredCompletedRides.length) * 100) / 100
      : 0;

    const getNetTotals = (ridesForWindow: any[]) => {
      const gross = ridesForWindow.reduce((sum: number, ride: any) => {
        return sum + (ride.primaryPayment?.amount ?? ride.finalFare ?? ride.estimatedPrice ?? 0);
      }, 0);
      const commission = ridesForWindow.reduce((sum: number, ride: any) => {
        return sum + (ride.primaryPayment?.commission ?? ride.commission ?? 0);
      }, 0);
      return {
        gross: Math.round(gross * 100) / 100,
        net: Math.round((gross - commission) * 100) / 100,
      };
    };

    const todayTotals = getNetTotals(completedToday);
    const weekTotals = getNetTotals(completedWeek);
    const monthTotals = getNetTotals(completedMonth);

    // Usar distancia y duración real si existe, sino la estimada
    const totalDistance = filteredCompletedRides.reduce((sum: number, r: any) => sum + (r.distance || 0), 0);
    const totalDuration = filteredCompletedRides.reduce((sum: number, r: any) => sum + (r.duration || 0), 0);

    return {
      success: true,
      stats: {
        totalRides: filteredAllRides.length,
        completedRides: filteredCompletedRides.length,
        canceledRides: filteredCanceledRides.length,
        totalEarnings: Math.round(totals.gross * 100) / 100,
        totalCommission: Math.round(totals.commission * 100) / 100,
        totalNetEarnings: Math.round(totalNet * 100) / 100,
        averageEarning,
        averageFare: averageEarning,
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalDuration,
        ridesToday: completedToday.length,
        earningsToday: todayTotals.gross,
        ridesWeek: completedWeek.length,
        earningsWeek: weekTotals.gross,
        netEarningsWeek: weekTotals.net,
        ridesMonth: completedMonth.length,
        earningsMonth: monthTotals.gross,
        netEarningsMonth: monthTotals.net,
        averageRideDistance: filteredCompletedRides.length > 0 ? Math.round((totalDistance / filteredCompletedRides.length) * 100) / 100 : 0,
        averageRideDuration: filteredCompletedRides.length > 0 ? Math.round(totalDuration / filteredCompletedRides.length) : 0,
      },
    };
  } catch (error: any) {
    console.error('❌ [getDriverStats] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener ganancias por día
 */
export const getEarningsByDay = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  await ensureActiveSession(context, data);
  try {
    const driverId = context.auth.uid;
    const { days = 30 } = data;

    console.log(`📅 [getEarningsByDay] Obteniendo ganancias por día (últimos ${days} días)`);

    // Obtener viajes completados con detalles de pagos
    let rides: any[] = [];
    try {
      const ridesRaw = await supabaseGetRidesWithLocationsAndPayments(driverId, 'driver');
      rides = await mapRides(Array.isArray(ridesRaw) ? ridesRaw : (ridesRaw?.rides || []));
    } catch (dbError: any) {
      console.error(`❌ [getEarningsByDay] Error en Supabase REST API (${dbError.message}). Retornando array vacío`);
      rides = [];
    }
    const completedRides = rides.filter((r: any) => r.status === 'completed');

    // Agrupar por día
    const earningsByDay: { [key: string]: number } = {};

    completedRides.forEach((r: any) => {
      if (r.completedAt) {
        const date = new Date(r.completedAt).toISOString().split('T')[0];
        const fare = r.primaryPayment?.amount ?? r.finalFare ?? r.estimatedPrice ?? 0;
        const commission = r.primaryPayment?.commission ?? r.commission ?? 0;
        const earning = fare - commission;
        earningsByDay[date] = (earningsByDay[date] || 0) + earning;
      }
    });

    // Convertir a array y ordenar
    const result = Object.entries(earningsByDay)
      .map(([date, earning]) => ({
        date,
        earning: Math.round(earning * 100) / 100,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-days);

    return {
      success: true,
      earningsByDay: result,
    };
  } catch (error: any) {
    console.error('❌ [getEarningsByDay] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
