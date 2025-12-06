/**
 * Rides API - Versión Sequelize Completa
 * Gestión completa de viajes
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';
import { RideLocationRepository } from '../sequelize/repositories/RideLocationRepository';
import { RideService } from '../sequelize/services/RideService';
import { supabaseGetRidesWithLocationsAndPayments } from '../supabase/client';
import { mapRides } from './rideHistory';
import { sendNotificationToUser } from '../services/pushNotifications';
import { RideRepository } from '../sequelize/repositories/RideRepository';
import { DriverPenaltyRepository } from '../sequelize/repositories/DriverPenaltyRepository';
import { ServiceRepository } from '../sequelize/repositories/ServiceRepository';
import { PaymentRepository } from '../sequelize/repositories/PaymentRepository';
import { calculateRideProgress } from '../utils/rideProgressUtils';
import { MIGRATION_FLAGS } from '../config/migration-flags';

const IS_LOAD_TEST =
  (process.env.FUNCTIONS_EMULATOR === 'true' ||
    (process.env.FIREBASE_EMULATOR_RUN_MODE ?? '').toLowerCase() === 'true') &&
  (process.env.SKIP_DB_FOR_LOADTEST ?? '').toLowerCase() === 'true';

const rideRepo = new RideRepository();
const driverRepo = new DriverRepository();
const locationRepo = new RideLocationRepository();
const rideService = new RideService();
const db = admin.database();
const DEFAULT_SERVICE_AREA_ID = 'ni-managua';
const penaltyRepo = new DriverPenaltyRepository();
const serviceRepo = new ServiceRepository();
const paymentRepo = new PaymentRepository();

// ============================================
// Single-session enforcement (DENY policy)
// ============================================
const SESSION_ACTIVE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

const isRecent = (lastSeen: any): boolean => {
  if (typeof lastSeen === 'number') {
    const diff = Date.now() - lastSeen;
    return diff >= 0 && diff <= SESSION_ACTIVE_THRESHOLD_MS;
  }
  // If unknown type (e.g. server timestamp placeholder), treat as recent
  return true;
};

const ensureActiveSession = async (
  context: functions.https.CallableContext,
  data: any,
) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId.trim() : '';
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId requerido');
  }

  const sessionSnap = await db.ref(`sessions/${uid}`).once('value');
  const session = sessionSnap.val();
  if (session && session.deviceId && session.deviceId !== deviceId && isRecent(session.lastSeen)) {
    throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
  }
};

const notifyUserSafe = async (
  userId: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, string | number | boolean | null | undefined> = {},
) => {
  if (!userId) {
    return;
  }

  try {
    const rideIdRaw = data?.rideId ?? data?.ride_id;
    const normalizedRideId = typeof rideIdRaw === 'string'
      ? rideIdRaw
      : typeof rideIdRaw === 'number' && Number.isFinite(rideIdRaw)
        ? String(rideIdRaw)
        : '';
    const explicitNotificationKey = typeof data?.notificationKey === 'string' && data.notificationKey.trim().length
      ? data.notificationKey.trim()
      : undefined;
    const notificationKey = explicitNotificationKey || (normalizedRideId ? `ride-${normalizedRideId}` : undefined);
    const expiresInMsRaw = data?.expiresInMs ?? data?.expires_in_ms;
    const parsedExpires = typeof expiresInMsRaw === 'number'
      ? expiresInMsRaw
      : typeof expiresInMsRaw === 'string'
        ? Number(expiresInMsRaw)
        : NaN;
    const expiresInMs = Number.isFinite(parsedExpires) && parsedExpires > 0 ? parsedExpires : 120_000;

    await sendNotificationToUser(userId, {
      title,
      body,
      data: {
        ...data,
        rideId: normalizedRideId || undefined,
      },
      notificationKey,
      expiresInMs,
    });
  } catch (error) {
    console.error('❌ [rides] Error enviando notificación push:', {
      userId,
      title,
      error,
    });
  }
};

const fetchClientProfileFromRealtime = async (
  clientId: string,
): Promise<{
  fullName?: string | null;
  phone?: string | null;
  rating?: number | null;
  totalRatings?: number | null;
} | null> => {
  try {
    const snapshot = await db.ref(`clientsInfo/${clientId}`).once('value');
    const value = snapshot.val();
    if (!value) {
      return null;
    }

    return {
      fullName: value.fullName ?? value.full_name ?? null,
      phone: value.phone ?? null,
      rating: typeof value.rating === 'number' ? value.rating : null,
      totalRatings: typeof value.totalRatings === 'number' ? value.totalRatings : null,
    };
  } catch (error) {
    console.warn('[hydrateActiveRides] Error leyendo clientsInfo:', { clientId, error });
    return null;
  }
};

const needsEnrichment = (ride: any): boolean => {
  if (!ride) {
    return true;
  }
  const hasName = typeof ride.clientName === 'string' && ride.clientName.trim().length > 0;
  const hasPhone = typeof ride.clientPhone === 'string' && ride.clientPhone.trim().length > 0;
  const hasRating = typeof ride.clientRating === 'number';
  return !(hasName && hasPhone && hasRating);
};

export const hydrateActiveRidesClientProfiles = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const options = (data && typeof data === 'object') ? data : {};
  const missingOnly = options.missingOnly !== false;
  const limit = typeof options.limit === 'number' && Number.isFinite(options.limit)
    ? Math.min(Math.max(Math.floor(options.limit), 1), 200)
    : 50;

  const snapshot = await db.ref('activeRides').once('value');
  const rawValue = snapshot.val() || {};
  const entries = Object.entries<any>(rawValue);

  let processed = 0;
  let updated = 0;
  const errors: Array<{ rideId: string; reason: string }> = [];

  for (const [rideId, ride] of entries) {
    if (processed >= limit) {
      break;
    }

    if (!ride?.clientId) {
      continue;
    }

    if (missingOnly && !needsEnrichment(ride)) {
      continue;
    }

    processed += 1;

    try {
      const profile = await fetchClientProfileFromRealtime(ride.clientId);
      if (!profile) {
        errors.push({ rideId, reason: 'client_profile_missing' });
        continue;
      }

      const updatePayload: Record<string, any> = {
        clientName: profile.fullName ?? ride.clientName ?? null,
        clientPhone: profile.phone ?? ride.clientPhone ?? null,
        clientRating: typeof profile.rating === 'number' ? profile.rating : ride.clientRating ?? null,
        clientTotalRatings: typeof profile.totalRatings === 'number'
          ? profile.totalRatings
          : ride.clientTotalRatings ?? null,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      await db.ref(`activeRides/${rideId}`).update(updatePayload);
      updated += 1;
    } catch (error: any) {
      console.error('[hydrateActiveRides] Error enriqueciendo viaje:', { rideId, error });
      errors.push({ rideId, reason: error?.message ?? 'unknown_error' });
    }
  }

  return {
    success: true,
    totalRides: entries.length,
    updated,
    errors,
    remaining: Math.max(entries.length - processed, 0),
  };
});

const parseToNumber = (value: any): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getNegotiatedFare = (firebaseRide: any, rideRecord: any): number => {
  const candidates = [
    firebaseRide?.finalFare,
    rideRecord?.final_fare,
    firebaseRide?.driverOfferedPrice,
    rideRecord?.driver_offered_price,
    firebaseRide?.clientSuggestedPrice,
    rideRecord?.client_suggested_price,
    firebaseRide?.estimatedPrice,
    rideRecord?.estimated_price,
  ];

  for (const candidate of candidates) {
    const parsed = parseToNumber(candidate);
    if (parsed !== null && parsed > 0) {
      return Number(parsed.toFixed(2));
    }
  }

  return 0;
};

const getCommissionRateForRide = async (rideRecord: any): Promise<number> => {
  let commissionRate = parseToNumber((rideRecord as any)?.commission_rate);

  if (commissionRate === null && rideRecord?.service_id) {
    try {
      const service = await serviceRepo.findById(rideRecord.service_id);
      const serviceRate = parseToNumber(service?.commission_rate);
      if (serviceRate !== null) {
        commissionRate = serviceRate;
      }
    } catch (serviceError) {
      console.warn('⚠️ [rides] Error obteniendo comisión del servicio:', serviceError);
    }
  }

  if (commissionRate === null) {
    commissionRate = 0.11;
  }

  return Number(commissionRate.toFixed(4));
};

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (value: number) => (value * Math.PI) / 180;

const haversineDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const normalizeRealtimeRide = (rideId: string, raw: any) => {
  const toOptionalNumber = (value: any): number | undefined => {
    const parsed = parseToNumber(value);
    return parsed !== null ? parsed : undefined;
  };

  const toTimestamp = (value: any): number | undefined => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? undefined : parsed;
  };

  const originSource = raw?.origin || {};
  const originLat = toOptionalNumber(originSource.lat ?? originSource.latitude ?? raw?.originLat);
  const originLng = toOptionalNumber(originSource.lng ?? originSource.longitude ?? raw?.originLng);
  const originAddress = originSource.address ?? raw?.originAddress ?? undefined;
  const origin = originLat !== undefined && originLng !== undefined
    ? { lat: originLat, lng: originLng, address: originAddress }
    : undefined;

  const destinationSource = raw?.destination || {};
  const destinationLat = toOptionalNumber(destinationSource.lat ?? destinationSource.latitude ?? raw?.destinationLat);
  const destinationLng = toOptionalNumber(destinationSource.lng ?? destinationSource.longitude ?? raw?.destinationLng);
  const destinationAddress = destinationSource.address ?? raw?.destinationAddress ?? undefined;
  const destination = destinationLat !== undefined && destinationLng !== undefined
    ? { lat: destinationLat, lng: destinationLng, address: destinationAddress }
    : undefined;

  const extraSource = Array.isArray(raw?.extraDestinations) ? raw.extraDestinations : [];
  const extraDestinations = extraSource
    .map((stop: any): { lat: number; lng: number; address?: string } | null => {
      const stopLat = toOptionalNumber(stop?.lat ?? stop?.latitude);
      const stopLng = toOptionalNumber(stop?.lng ?? stop?.longitude);
      if (stopLat === undefined || stopLng === undefined) {
        return null;
      }
      return {
        lat: stopLat,
        lng: stopLng,
        address: stop?.address ?? undefined,
      };
    })
    .filter((item: { lat: number; lng: number; address?: string } | null): item is { lat: number; lng: number; address?: string } => item !== null);

  const estimatedPrice = toOptionalNumber(raw?.estimatedPrice ?? raw?.estimated_price ?? raw?.payment?.estimatedPrice) ?? 0;
  const clientSuggestedPrice = toOptionalNumber(raw?.clientSuggestedPrice ?? raw?.client_suggested_price ?? raw?.clientSuggestedFare);
  const driverOfferedPrice = toOptionalNumber(raw?.driverOfferedPrice ?? raw?.driver_offered_price ?? raw?.driverOfferPrice);
  const estimatedDistance = toOptionalNumber(raw?.estimatedDistance ?? raw?.estimated_distance);
  const estimatedDuration = toOptionalNumber(raw?.estimatedDuration ?? raw?.estimated_duration);
  const passengers = toOptionalNumber(raw?.passengers);
  const waypointsCount = toOptionalNumber(raw?.waypointsCount ?? raw?.waypoints_count);
  const clientRating = toOptionalNumber(raw?.clientRating ?? raw?.client_rating ?? raw?.client?.rating);
  const clientTotalRatings = toOptionalNumber(raw?.clientTotalRatings ?? raw?.client_total_ratings ?? raw?.client?.totalRatings);

  let client = raw?.client && typeof raw.client === 'object' ? { ...raw.client } : undefined;
  if (!client) {
    client = {
      name: raw?.clientName ?? 'Cliente',
      rating: clientRating ?? 0,
      phone: raw?.clientPhone ?? null,
    } as any;
    if (clientTotalRatings !== undefined) {
      (client as any).totalRatings = clientTotalRatings;
    }
  } else {
    if (clientRating !== undefined) {
      (client as any).rating = clientRating;
    }
    if (clientTotalRatings !== undefined) {
      (client as any).totalRatings = clientTotalRatings;
    }
  }

  const requestedAt = toTimestamp(raw?.requestedAt ?? raw?.requested_at ?? raw?.createdAt ?? raw?.created_at);
  const updatedAt = toTimestamp(raw?.updatedAt ?? raw?.updated_at);

  return {
    id: rideId,
    status: raw?.status ?? 'requested',
    clientId: raw?.clientId ?? raw?.client_id ?? null,
    driverId: raw?.driverId ?? raw?.driver_id ?? null,
    origin,
    destination,
    extraDestinations: extraDestinations.length > 0 ? extraDestinations : undefined,
    estimatedPrice,
    estimatedDistance,
    estimatedDuration,
    clientSuggestedPrice: clientSuggestedPrice ?? undefined,
    driverOfferedPrice: driverOfferedPrice ?? undefined,
    passengers: passengers ?? undefined,
    rideType: raw?.rideType ?? raw?.serviceType ?? 'normal',
    paymentMethod: raw?.paymentMethod ?? raw?.payment_type ?? raw?.payment?.paymentMethod ?? undefined,
    negotiationStatus: raw?.negotiationStatus ?? raw?.negotiation_status ?? null,
    clientName: raw?.clientName ?? client?.name ?? undefined,
    clientPhone: raw?.clientPhone ?? client?.phone ?? undefined,
    clientRating: clientRating ?? undefined,
    clientTotalRatings: clientTotalRatings ?? undefined,
    client,
    rejections: raw?.rejections ?? undefined,
    offers: raw?.offers ?? undefined,
    requestedAt,
    updatedAt,
    waypointsCount: waypointsCount ?? undefined,
    hasMultipleDestinations: Boolean(raw?.hasMultipleDestinations ?? (extraDestinations.length > 0)),
    payment: raw?.payment ?? undefined,
    timeline: raw?.timeline ?? undefined,
  };
};

export const getAvailableRides = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  // Enforce single-session
  await ensureActiveSession(context, data);

  const latitude = typeof data?.latitude === 'number' && Number.isFinite(data.latitude)
    ? data.latitude
    : undefined;
  const longitude = typeof data?.longitude === 'number' && Number.isFinite(data.longitude)
    ? data.longitude
    : undefined;
  const radiusKmParsed = parseToNumber(data?.radius);
  const radiusKm = radiusKmParsed !== null && radiusKmParsed > 0 ? Math.max(radiusKmParsed, 0.1) : 1.5;
  const hasCoords = latitude !== undefined && longitude !== undefined;
  const radiusMeters = hasCoords ? radiusKm * 1000 : undefined;
  const limit = typeof data?.limit === 'number' && Number.isFinite(data.limit)
    ? Math.min(Math.max(Math.floor(data.limit), 1), 50)
    : 25;

  // Resolver área de servicio del conductor desde la sesión (si existe)
  const uid = context.auth.uid;
  let serviceAreaId = DEFAULT_SERVICE_AREA_ID;

  try {
    const sessionSnap = await db.ref(`sessions/${uid}`).once('value');
    const sessionVal = sessionSnap.val();
    if (sessionVal && typeof sessionVal.serviceAreaId === 'string' && sessionVal.serviceAreaId.trim().length > 0) {
      serviceAreaId = sessionVal.serviceAreaId.trim();
    }
  } catch (e) {
    console.warn('[getAvailableRides] No se pudo leer serviceAreaId de sesión, usando default', {
      uid,
      error: (e as any)?.message || e,
    });
  }

  let rawValue: any = {};
  let usedPath = '';

  try {
    const areaSnap = await db.ref(`activeRidesByArea/${serviceAreaId}`).once('value');
    rawValue = areaSnap.val() || {};
    usedPath = `activeRidesByArea/${serviceAreaId}`;

    // Fallback a path global si el shard está vacío (compatibilidad)
    if (!rawValue || (typeof rawValue === 'object' && Object.keys(rawValue).length === 0)) {
      const fallbackSnap = await db.ref('activeRides').once('value');
      rawValue = fallbackSnap.val() || {};
      usedPath = 'activeRides';
    }
  } catch (err) {
    console.warn('[getAvailableRides] Error leyendo activeRidesByArea, usando activeRides global', {
      uid,
      serviceAreaId,
      error: (err as any)?.message || err,
    });
    const fallbackSnap = await db.ref('activeRides').once('value');
    rawValue = fallbackSnap.val() || {};
    usedPath = 'activeRides';
  }

  const entries = Object.entries<any>(rawValue);

  const rides = [] as any[];

  for (const [rideId, rawRide] of entries) {
    const status = String(rawRide?.status || '').toLowerCase();
    if (status !== 'requested') {
      continue;
    }

    if (rawRide?.driverId) {
      continue;
    }

    const normalized = normalizeRealtimeRide(rideId, rawRide);

    let distanceMeters: number | undefined;
    if (
      hasCoords &&
      normalized.origin?.lat !== undefined &&
      normalized.origin?.lng !== undefined
    ) {
      distanceMeters = Math.round(
        haversineDistanceMeters(
          latitude as number,
          longitude as number,
          normalized.origin.lat,
          normalized.origin.lng,
        ),
      );

      if (radiusMeters !== undefined && distanceMeters > radiusMeters) {
        continue;
      }
    }

    rides.push({
      ...normalized,
      distanceMeters,
    });
  }

  rides.sort((a, b) => {
    const distA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    const distB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    if (distA !== distB) {
      return distA - distB;
    }

    const timeA = typeof a.requestedAt === 'number' ? a.requestedAt : 0;
    const timeB = typeof b.requestedAt === 'number' ? b.requestedAt : 0;
    return timeB - timeA;
  });

  const limited = rides.slice(0, limit);

  console.log('[getAvailableRides] Respondiendo a solicitud', {
    auth: context.auth.uid,
    totalFound: rides.length,
    returned: limited.length,
    hasCoords,
    radiusKm: hasCoords ? radiusKm : null,
    limit,
    serviceAreaId,
    usedPath,
  });

  return {
    success: true,
    rides: limited,
    total: rides.length,
    limit,
  };
});

const updateDriverPenaltySummary = async (driverId: string) => {
  try {
    const penalties = await penaltyRepo.findByDriverId(driverId);
    const list = Array.isArray(penalties) ? penalties : [];
    const pendingOnly = list.filter((p: any) => String(p.status).toLowerCase() === 'pending');
    const pendingCount = pendingOnly.length;
    const pendingAmount = pendingOnly.reduce(
      (sum: number, item: any) => sum + parseFloat(String(item.amount || 0)),
      0,
    );

    if (MIGRATION_FLAGS.MIRROR_PENALTIES_TO_RTDB) {
      await admin
        .database()
        .ref(`driverPenalties/${driverId}/summary`)
        .update({
          pendingCount,
          pendingAmount: Number(pendingAmount.toFixed(2)),
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
    }
  } catch (summaryErr) {
    console.warn('⚠️ [rides] Error actualizando resumen de penalizaciones:', summaryErr);
  }
};

const ensureDriverPenalty = async (options: {
  driverId?: string | null;
  rideId: string;
  amount: number;
  penaltyType: string;
  reason: string;
}) => {
  const { driverId, rideId, amount, penaltyType, reason } = options;
  const normalizedAmount = Number(Number(amount || 0).toFixed(2));
  if (!driverId || !rideId || normalizedAmount <= 0) {
    return;
  }

  try {
    const existingPenalty = await penaltyRepo.findByRideId(rideId);
    if (existingPenalty) {
      await penaltyRepo.update(existingPenalty.id, {
        amount: normalizedAmount,
        penalty_type: penaltyType,
        reason,
        status: 'pending',
      } as any);
    } else {
      await penaltyRepo.create({
        driver_id: driverId,
        ride_id: rideId,
        penalty_type: penaltyType,
        amount: normalizedAmount,
        reason,
        status: 'pending',
      } as any);
    }

    await updateDriverPenaltySummary(driverId);
  } catch (penaltyErr) {
    console.error('⚠️ [rides] Error asegurando penalización:', penaltyErr);
  }
};

/**
 * Marcar conductor en camino (driver_on_route)
 */
export const markDriverOnRoute = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);

  try {
    const { rideId } = data;
    const driverId = context.auth.uid;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`🚕 [markDriverOnRoute] Driver ${driverId} marcando viaje ${rideId} como en camino`);

    const snapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = snapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }

    if (rideData.driverId && rideData.driverId !== driverId) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el conductor asignado a este viaje');
    }

    if (rideData.status === 'driver_on_route') {
      console.log(`🔁 [markDriverOnRoute] Viaje ${rideId} ya está en driver_on_route`);
      return {
        success: true,
        ride: { id: rideId, status: rideData.status, driverId },
        message: 'Viaje ya estaba marcado como en camino',
      };
    }

    if (!['accepted', 'driver_offered'].includes(rideData.status)) {
      throw new functions.https.HttpsError('failed-precondition', `Estado actual (${rideData.status}) no permite marcar en camino`);
    }

    const driverOnRouteAt = new Date();
    await rideService.markDriverOnRoute(rideId, driverId, {
      driver_on_route_at: driverOnRouteAt,
    });

    const firebaseUpdate: any = {
      status: 'driver_on_route',
      driverId,
      driverOnRouteAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      clientSuggestedPrice: rideData.clientSuggestedPrice || null,
      driverOfferedPrice: rideData.driverOfferedPrice || null,
      negotiationStatus: rideData.negotiationStatus || null,
    };

    if (rideData.driver) {
      firebaseUpdate.driver = rideData.driver;
    }
    if (rideData.vehicle) {
      firebaseUpdate.vehicle = rideData.vehicle;
    }

    await db.ref(`activeRides/${rideId}`).update(firebaseUpdate);
    console.log(`✅ [markDriverOnRoute] Viaje ${rideId} actualizado en Firebase`);

    // ✅ NUEVO: Marcar conductor como BUSY
    try {
      await db.ref(`driverLocations/${driverId}`).update({
        status: 'busy',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (busyErr) {
      console.warn('⚠️ [markDriverOnRoute] No se pudo marcar BUSY en driverLocations:', (busyErr as any)?.message || busyErr);
    }

    await notifyUserSafe(rideData.clientId, '🚗 Conductor en camino', 'Tu conductor se dirige al punto de recogida.', {
      rideId,
      type: 'ride_driver_on_route',
      driverId,
    });

    return {
      success: true,
      ride: { id: rideId, status: 'driver_on_route', driverId },
      message: 'Viaje marcado como conductor en camino',
    };
  } catch (error: any) {
    console.error('❌ [markDriverOnRoute] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Crear viaje - Versión mejorada que acepta datos del Frontend
 */
export const createRide = functions.https.onCall(async (data, context) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚗 [createRide] INICIANDO CREACIÓN DE VIAJE`);
  console.log(`🚗 [createRide] Timestamp: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);
  
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const clientId = context.auth.uid;
    console.log(`👤 [createRide] Cliente ID: ${clientId}`);
    console.log(`📦 [createRide] Data recibida:`, JSON.stringify(data, null, 2));
    
    // Extraer datos del Frontend
    const {
      origin,
      destination,
      estimatedDistance,
      estimatedDuration,
      estimatedPrice,
      rideType = 'normal',
      vehicleType = 'auto',
      passengers = 1,
    } = data;

    // Validar datos requeridos
    if (!origin || !destination || !estimatedPrice) {
      throw new functions.https.HttpsError('invalid-argument', 'origin, destination y estimatedPrice son requeridos');
    }

    console.log(`🚗 [createRide] Creando viaje para cliente: ${clientId}`);
    console.log(`📋 [createRide] Datos recibidos:`, {
      rideType: data.rideType,
      vehicleType: data.vehicleType,
      serviceId: data.serviceId,
      clientSuggestedPrice: data.clientSuggestedPrice,
    });

    // Preparar paradas extras (waypoints)
    const extraDestinations = data.extraDestinations || [];
    console.log(`📍 [createRide] Paradas extras recibidas: ${extraDestinations.length}`);

    if (IS_LOAD_TEST) {
      const rideRef = db.ref('activeRides').push();
      const rideId = rideRef.key as string;

      const firebaseRideData: any = {
        id: rideId,
        clientId,
        status: 'requested',
        origin: {
          lat: origin.lat,
          lng: origin.lng,
          address: origin.address || 'Ubicación de origen',
        },
        destination: {
          lat: destination.lat,
          lng: destination.lng,
          address: destination.address || 'Ubicación de destino',
        },
        estimatedPrice,
        estimatedDistance,
        estimatedDuration,
        rideType,
        vehicleType,
        passengers,
        paymentMethod: data.paymentMethod || 'cash',
        clientSuggestedPrice: data.clientSuggestedPrice || null,
        driverOfferedPrice: null,
        negotiationStatus: data.clientSuggestedPrice ? 'client_suggested' : null,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      if (extraDestinations.length > 0) {
        firebaseRideData.extraDestinations = extraDestinations;
        firebaseRideData.hasMultipleDestinations = true;
        firebaseRideData.waypointsCount = extraDestinations.length;
        console.log(`✅ [createRide][LOADTEST] ${extraDestinations.length} paradas agregadas a Firebase`);
      } else {
        firebaseRideData.hasMultipleDestinations = false;
        firebaseRideData.waypointsCount = 0;
      }

      await db.ref(`activeRides/${rideId}`).set(firebaseRideData);
      console.log(`✅ [createRide][LOADTEST] Viaje fake sincronizado a Firebase: activeRides/${rideId}`);

      try {
        await db.ref(`paymentStatus/${rideId}`).set({
          status: 'pending',
          amount: estimatedPrice,
          paymentMethod: data.paymentMethod || 'cash',
          createdAt: admin.database.ServerValue.TIMESTAMP,
        });
        console.log(`✅ [createRide][LOADTEST] paymentStatus creado para viaje fake`);
      } catch (firebaseError: any) {
        console.error(`⚠️ [createRide][LOADTEST] Error creando paymentStatus (no es crítico):`, firebaseError.message);
      }

      await notifyUserSafe(clientId, '🚗 Solicitud enviada', 'Estamos buscando un conductor para tu viaje', {
        rideId,
        type: 'ride_requested',
      });

      return {
        success: true,
        ride: {
          id: rideId,
          firebaseRideId: rideId,
          status: 'requested',
          createdAt: new Date(),
          clientId,
          origin,
          destination,
          estimatedPrice,
          rideType,
          vehicleType,
          passengers,
        },
      };
    }

    // ✅ NUEVO: Mapear vehicleType a service_id
    let serviceId = data.serviceId || null;
    if (!serviceId && vehicleType) {
      // Mapear vehicleType a código de servicio
      const serviceCodeMap: {[key: string]: string} = {
        'auto': 'normal',
        'moto': 'motorcycle',
        'designated_driver': 'designated_driver',
      };
      const serviceCode = serviceCodeMap[vehicleType];
      
      if (serviceCode) {
        try {
          const Service = require('../sequelize/models/Service').default;
          const service = await Service.findOne({ where: { code: serviceCode } });
          if (service) {
            serviceId = service.id;
            console.log(`✅ [createRide] Service encontrado: ${serviceCode} -> ${serviceId}`);
          }
        } catch (err: any) {
          console.warn(`⚠️ [createRide] Error buscando servicio: ${err.message}`);
        }
      }
    }

    // Guardar en Sequelize (PostgreSQL)
    // ✅ IMPORTANTE: Usar nombres de columnas exactos del schema
    const ride = await rideService.createRide({
      firebase_ride_id: '', // Se actualizará después con el ID real
      client_id: clientId,
      driver_id: null, // Sin conductor asignado aún
      estimated_distance: estimatedDistance,  // ✅ Correcto: estimated_distance
      estimated_duration: estimatedDuration,  // ✅ Correcto: estimated_duration
      estimated_price: estimatedPrice,
      passengers: passengers,
      notes: data.notes || null,
      ride_type: rideType,
      vehicle_type: vehicleType,
      payment_type: data.paymentMethod || 'cash',  // ✅ Correcto: payment_type
      status: 'requested',
      service_id: serviceId,  // ✅ NUEVO: service_id mapeado desde vehicleType
    });

    console.log(`✅ [createRide] Viaje creado en Sequelize: ${ride.id}`);

    // Crear ubicaciones en ride_locations
    console.log(`📍 [createRide] Creando ubicaciones para viaje: ${ride.id}`);
    let originLocationId: string | null = null;
    let destinationLocationId: string | null = null;
    
    try {
      let locationOrder = 1;
      
      // Crear ubicación de origen
      const originLocation = await locationRepo.create({
        ride_id: ride.id,
        location_type: 'origin',
        location_order: locationOrder++,
        latitude: origin.lat,
        longitude: origin.lng,
        address: origin.address || 'Ubicación de origen',
      });
      originLocationId = originLocation.id;
      console.log(`✅ [createRide] Ubicación de origen creada: ${originLocationId}`);

      // Crear ubicaciones para paradas intermedias (waypoints)
      if (extraDestinations.length > 0) {
        console.log(`📍 [createRide] Creando ${extraDestinations.length} paradas intermedias...`);
        for (const waypoint of extraDestinations) {
          try {
            const waypointLocation = await locationRepo.create({
              ride_id: ride.id,
              location_type: 'waypoint',
              location_order: locationOrder++,
              latitude: waypoint.lat,
              longitude: waypoint.lng,
              address: waypoint.address || `Parada ${locationOrder - 2}`,
            });
            console.log(`✅ [createRide] Parada intermedia creada: ${waypointLocation.id}`);
          } catch (waypointError: any) {
            console.error(`⚠️ [createRide] Error creando parada intermedia:`, waypointError.message);
          }
        }
      }

      // Crear ubicación de destino
      const destinationLocation = await locationRepo.create({
        ride_id: ride.id,
        location_type: 'destination',
        location_order: locationOrder++,
        latitude: destination.lat,
        longitude: destination.lng,
        address: destination.address || 'Ubicación de destino',
      });
      destinationLocationId = destinationLocation.id;
      console.log(`✅ [createRide] Ubicación de destino creada: ${destinationLocationId}`);
      
      // Actualizar ride con los IDs de ubicaciones y contador de paradas
      console.log(`🔗 [createRide] Actualizando ride con IDs de ubicaciones...`);
      await rideRepo.update(ride.id, {
        origin_location_id: originLocationId,
        destination_location_id: destinationLocationId,
        waypoints_count: extraDestinations.length,
        has_multiple_stops: extraDestinations.length > 0,
      });
      console.log(`✅ [createRide] Ride actualizado con IDs de ubicaciones y ${extraDestinations.length} paradas`);
    } catch (locationError: any) {
      console.error(`⚠️ [createRide] Error creando ubicaciones:`, locationError.message);
      // No lanzar error - el viaje ya está creado
    }

    // Sincronizar a Firebase Realtime DB - activeRides (COMPLETO)
    console.log(`🔥 [createRide] Sincronizando a Firebase Realtime DB...`);
    
    const firebaseRideData: any = {
      id: ride.id,
      clientId,
      status: 'requested',
      origin: {
        lat: origin.lat,
        lng: origin.lng,
        address: origin.address || 'Ubicación de origen',
      },
      destination: {
        lat: destination.lat,
        lng: destination.lng,
        address: destination.address || 'Ubicación de destino',
      },
      estimatedPrice,
      estimatedDistance,
      estimatedDuration,
      rideType,
      vehicleType,
      passengers,
      paymentMethod: data.paymentMethod || 'cash',
      // ✅ NUEVO: Campos para negociación de precios
      clientSuggestedPrice: data.clientSuggestedPrice || null,
      driverOfferedPrice: null,
      negotiationStatus: data.clientSuggestedPrice ? 'client_suggested' : null,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };
    
    // Agregar paradas extras si existen
    if (extraDestinations.length > 0) {
      firebaseRideData.extraDestinations = extraDestinations;
      firebaseRideData.hasMultipleDestinations = true;
      firebaseRideData.waypointsCount = extraDestinations.length;
      console.log(`✅ [createRide] ${extraDestinations.length} paradas agregadas a Firebase`);
    } else {
      firebaseRideData.hasMultipleDestinations = false;
      firebaseRideData.waypointsCount = 0;
    }

    try {
      await db.ref(`activeRides/${ride.id}`).set(firebaseRideData);
      console.log(`✅ [createRide] Viaje sincronizado a Firebase: activeRides/${ride.id}`);
      
      // ✅ NUEVO: Actualizar firebase_ride_id en PostgreSQL
      await rideRepo.update(ride.id, {
        firebase_ride_id: ride.id,
      });
      console.log(`✅ [createRide] firebase_ride_id guardado en PostgreSQL: ${ride.id}`);
      
      // Crear paymentStatus inicial
      console.log(`💳 [createRide] Creando paymentStatus...`);
      await db.ref(`paymentStatus/${ride.id}`).set({
        status: 'pending',
        amount: estimatedPrice,
        paymentMethod: data.paymentMethod || 'cash',
        createdAt: admin.database.ServerValue.TIMESTAMP,
      });
      console.log(`✅ [createRide] paymentStatus creado`);
    } catch (firebaseError: any) {
      console.error(`⚠️ [createRide] Error sincronizando a Firebase (no es crítico):`, firebaseError.message);
      // No lanzar error - el viaje ya está en Supabase
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [createRide] VIAJE CREADO EXITOSAMENTE`);
    console.log(`✅ [createRide] ID: ${ride.id}`);
    console.log(`✅ [createRide] Status: ${ride.status}`);
    console.log(`✅ [createRide] Client: ${clientId}`);
    console.log(`${'='.repeat(60)}\n`);

    await notifyUserSafe(clientId, '🚗 Solicitud enviada', 'Estamos buscando un conductor para tu viaje', {
      rideId: ride.id,
      type: 'ride_requested',
    });

    return {
      success: true,
      ride: {
        id: ride.id,
        firebaseRideId: ride.firebase_ride_id,
        status: ride.status,
        createdAt: ride.created_at,
        clientId,
        origin,
        destination,
        estimatedPrice,
        rideType,
        vehicleType,
        passengers,
      },
    };
  } catch (error: any) {
    console.error(`\n${'='.repeat(60)}`);
    console.error(`❌ [createRide] ERROR`);
    console.error(`❌ [createRide] Mensaje:`, error.message);
    console.error(`❌ [createRide] Stack:`, error.stack);
    console.error(`${'='.repeat(60)}\n`);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Aceptar viaje
 */
export const acceptRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, vehicleId } = data;
    const driverId = context.auth.uid;
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }
    console.log(`✅ [acceptRide] Aceptando viaje: ${rideId} por conductor: ${driverId}`);
    
    // ✅ NUEVO: Obtener datos del viaje desde Firebase ANTES de aceptar
    console.log(`🔍 [acceptRide] Obteniendo datos del viaje desde Firebase...`);
    let firebaseRideData: any = null;
    try {
      const firebaseRideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
      firebaseRideData = firebaseRideSnapshot.val();
      if (firebaseRideData) {
        console.log(`✅ [acceptRide] Datos de Firebase obtenidos:`, {
          serviceId: firebaseRideData.serviceId,
          vehicleType: firebaseRideData.vehicleType,
          status: firebaseRideData.status,
          driverId: firebaseRideData.driverId,
        });
      }
    } catch (err: any) {
      console.warn(`⚠️ [acceptRide] Error obteniendo datos de Firebase:`, err.message);
    }

    if (!firebaseRideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }

    if (firebaseRideData.driverId && firebaseRideData.driverId !== driverId && firebaseRideData.status !== 'requested') {
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya fue asignado a otro conductor');
    }

    if (IS_LOAD_TEST) {
      const currentData = firebaseRideData || {};
      let newStatus = 'accepted';

      if (!currentData.clientSuggestedPrice && !currentData.driverOfferedPrice) {
        newStatus = 'driver_offered';
      }

      const updateData: any = {
        status: newStatus,
        driverId,
        acceptedAt: currentData.acceptedAt || admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        clientSuggestedPrice: currentData.clientSuggestedPrice || null,
        driverOfferedPrice: currentData.driverOfferedPrice || null,
        negotiationStatus: currentData.negotiationStatus || null,
        extraDestinations: currentData.extraDestinations || null,
        hasMultipleDestinations: currentData.hasMultipleDestinations || false,
        waypointsCount: currentData.waypointsCount || 0,
      };

      await db.ref(`activeRides/${rideId}`).update(updateData);

      try {
        await db.ref(`paymentStatus/${rideId}`).update({
          status: 'pending',
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
      } catch (paymentErr: any) {
        console.warn('⚠️ [acceptRide][LOADTEST] Error actualizando paymentStatus:', paymentErr.message || paymentErr);
      }

      console.log(`✅ [acceptRide][LOADTEST] Viaje aceptado sin Supabase: ${rideId}`);

      return { success: true, ride: { id: rideId, status: newStatus, driverId } };
    }

    const stableStatuses = ['driver_offered', 'accepted', 'driver_on_route', 'in_progress', 'pending_payment', 'completed'];
    if (firebaseRideData.driverId === driverId && stableStatuses.includes(firebaseRideData.status)) {
      console.log(`🔁 [acceptRide] Viaje ${rideId} ya está gestionado por este conductor en estado ${firebaseRideData.status}`);
      return { success: true, ride: { id: rideId, status: firebaseRideData.status, driverId } };
    }

    // ✅ Actualizado: Bloqueo por cantidad de penalizaciones pendientes (server-side)
    try {
      const penalties = await penaltyRepo.findByDriverId(driverId);
      const pendingCount = (Array.isArray(penalties) ? penalties : []).filter((p: any) => String(p.status).toLowerCase() === 'pending').length;
      if (pendingCount >= 5) {
        console.warn(`⛔ [acceptRide] Conductor ${driverId} con ${pendingCount} penalizaciones pendientes (umbral=5)`);
        throw new functions.https.HttpsError('failed-precondition', 'No puedes aceptar viajes: tienes 5 o más comisiones/penalizaciones pendientes. Debes pagarlas para continuar.');
      }
    } catch (penErr: any) {
      if (penErr instanceof functions.https.HttpsError) throw penErr;
      console.warn('⚠️ [acceptRide] Error verificando penalizaciones:', penErr?.message || penErr);
    }

    // ✅ NUEVO: Verificar que el conductor no esté BUSY
    try {
      const driverLocSnap = await db.ref(`driverLocations/${driverId}`).once('value');
      const driverStatus = String(driverLocSnap.val()?.status || '').toLowerCase();
      if (driverStatus === 'busy') {
        throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
      }
    } catch (locErr: any) {
      if (locErr instanceof functions.https.HttpsError) throw locErr;
      console.warn('⚠️ [acceptRide] Error verificando driverLocations:', locErr?.message || locErr);
    }

    const ride = await rideService.acceptRide(rideId, driverId, firebaseRideData?.serviceId);
    
    // Obtener datos del conductor y vehículo
    console.log(`👤 [acceptRide] Obteniendo datos del conductor...`);
    let driverData: any = null;
    let vehicleData: any = null;
    
    try {
      const driver = await driverRepo.findByUserId(driverId);
      let driverName: string | null = null;

      if (driver) {
        const driverJson: any = driver.toJSON ? driver.toJSON() : (driver as any);
        const firstName = driverJson.first_name || driverJson.firstName || '';
        const lastName = driverJson.last_name || driverJson.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        if (fullName.length > 0) {
          driverName = fullName;
        }
      }

      if (driver) {
        const safeName = driverName || 'Conductor';
        driverData = {
          id: driver.id,
          userId: driver.user_id,
          name: safeName,
          rating: driver.average_rating || 0,
          profilePhoto: driver.profile_photo,
        };
        console.log(`✅ [acceptRide] Datos del conductor obtenidos`);
      }
      
      // Obtener vehículo
      if (vehicleId) {
        console.log(`🚗 [acceptRide] Obteniendo datos del vehículo: ${vehicleId}`);
        const vehicle = await db.ref(`vehicles/${vehicleId}`).once('value');
        if (vehicle.exists()) {
          vehicleData = vehicle.val();
          console.log(`✅ [acceptRide] Datos del vehículo obtenidos`);
        }
      }
    } catch (dataError: any) {
      console.warn(`⚠️ [acceptRide] Error obteniendo datos adicionales:`, dataError.message);
    }
    
    // Sincronizar a Firebase Realtime DB (COMPLETO)
    console.log(`🔥 [acceptRide] Sincronizando a Firebase...`);
    try {
      // Obtener datos actuales del viaje para preservar negociación
      const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
      const currentData = currentRide.val() || {};

      if (currentData.driverId && currentData.driverId !== driverId && currentData.status !== 'requested') {
        throw new functions.https.HttpsError('failed-precondition', 'El viaje ya es gestionado por otro conductor');
      }

      // ✅ ACTUALIZADO: Determinar estado basado en si hay negociación
      // Si hay negociación (clientSuggestedPrice o driverOfferedPrice), mantener estado de negociación
      // Si no hay negociación, cambiar a 'driver_offered' para que el cliente vea la card del conductor
      let newStatus = 'accepted';
      if (!currentData.clientSuggestedPrice && !currentData.driverOfferedPrice) {
        // Sin negociación - cambiar a 'driver_offered' para que el cliente confirme
        newStatus = 'driver_offered';
        console.log(`✅ [acceptRide] Sin negociación previa, estado: 'driver_offered'`);
      } else {
        // Con negociación - mantener estado actual
        newStatus = 'accepted';
        console.log(`✅ [acceptRide] Con negociación previa, estado: 'accepted'`);
      }
      
      const updateData: any = {
        status: newStatus,
        driverId,
        acceptedAt: currentData.acceptedAt || admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        // ✅ NUEVO: Preservar campos de negociación
        clientSuggestedPrice: currentData.clientSuggestedPrice || null,
        driverOfferedPrice: currentData.driverOfferedPrice || null,
        negotiationStatus: currentData.negotiationStatus || null,
        // ✅ NUEVO: Preservar paradas extras y múltiples destinos
        extraDestinations: currentData.extraDestinations || null,
        hasMultipleDestinations: currentData.hasMultipleDestinations || false,
        waypointsCount: currentData.waypointsCount || 0,
      };
      
      if (driverData) {
        updateData.driver = driverData;
      }
      
      if (vehicleData) {
        updateData.vehicle = vehicleData;
      }
      
      if (currentData.driverId === driverId && currentData.status === newStatus) {
        console.log(`🔁 [acceptRide] Viaje ${rideId} ya estaba en estado ${newStatus} para este conductor`);
      } else {
        await db.ref(`activeRides/${rideId}`).update(updateData);
        console.log(`✅ [acceptRide] Viaje sincronizado a Firebase con status: ${newStatus}`);
      }

      if (newStatus === 'driver_offered' && currentData.status !== 'driver_offered') {
        await notifyUserSafe(currentData.clientId, '🚗 Conductor disponible', 'Un conductor está listo para tu viaje. Revísalo ahora.', {
          rideId,
          type: 'ride_driver_offered',
          driverId,
        });
      }
      
      // ✅ NUEVO: Guardar oferta del conductor en offers/{driverId}
      console.log(`💰 [acceptRide] Guardando oferta del conductor en offers...`);
      try {
        const offerPrice = currentData.estimatedPrice || currentData.finalFare || 0;
        const existingOffer = currentData.offers?.[driverId] || null;

        // Obtener datos completos del conductor desde driversInfo
        let driverInfo: any = null;
        try {
          const driverInfoSnapshot = await db.ref(`driversInfo/${driverId}`).once('value');
          driverInfo = driverInfoSnapshot.val();
        } catch (err) {
          console.warn(`⚠️ [acceptRide] Error obteniendo driversInfo:`, err);
        }

        const offerDriverData = driverData || {
          id: driverId,
          name: driverInfo?.name || 'Conductor',
          rating: driverInfo?.rating || 0,
          photoURL: driverInfo?.photoURL || null,
        };

        const offerRef = db.ref(`activeRides/${rideId}/offers/${driverId}`);
        const offerUpdates: any = {
          offeredPrice: offerPrice,
          driver: offerDriverData,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        };

        if (!existingOffer) {
          offerUpdates.status = 'pending';
          offerUpdates.createdAt = admin.database.ServerValue.TIMESTAMP;
        } else {
          offerUpdates.status = existingOffer.status || 'pending';
        }

        await offerRef.update(offerUpdates);
        console.log(`✅ [acceptRide] Oferta del conductor guardada: C$${offerPrice}, Status: ${offerUpdates.status}`);
      } catch (offerError: any) {
        console.warn(`⚠️ [acceptRide] Error guardando oferta:`, offerError.message);
      }
      
      // Actualizar paymentStatus
      await db.ref(`paymentStatus/${rideId}`).update({
        status: 'pending',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      // ✅ NUEVO: Marcar conductor como BUSY solo si el estado ya implica asignación efectiva
      try {
        if (newStatus !== 'driver_offered') {
          await db.ref(`driverLocations/${driverId}`).update({
            status: 'busy',
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (busyErr) {
        console.warn('⚠️ [acceptRide] No se pudo marcar BUSY en driverLocations:', (busyErr as any)?.message || busyErr);
      }
    } catch (firebaseError: any) {
      console.error(`⚠️ [acceptRide] Error sincronizando a Firebase:`, firebaseError.message);
    }
    
    return { success: true, ride: { id: ride.id, status: ride.status, driverId } };
  } catch (error: any) {
    console.error('❌ [acceptRide] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * ✅ NUEVO: Cliente confirma un conductor específico
 * Usado cuando el cliente acepta la oferta de un conductor
 */
export const confirmDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);

  try {
    const { rideId, selectedDriverId } = data;
    const clientId = context.auth.uid;

    if (!rideId || !selectedDriverId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y selectedDriverId son requeridos');
    }

    console.log(`✅ [confirmDriver] Cliente ${clientId} confirmando conductor ${selectedDriverId} para viaje ${rideId}`);

    // Obtener datos del viaje
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    if (rideData.clientId !== clientId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para confirmar este viaje');
    }

    if (rideData.driverId === selectedDriverId) {
      const stableStatuses = ['accepted', 'driver_on_route', 'in_progress', 'pending_payment', 'completed'];
      if (stableStatuses.includes(rideData.status)) {
        console.log(`🔁 [confirmDriver] Viaje ${rideId} ya estaba asignado a ${selectedDriverId} con estado ${rideData.status}`);
        return {
          success: true,
          message: 'Viaje ya asignado a este conductor',
          ride: {
            id: rideId,
            status: rideData.status,
            driverId: selectedDriverId,
          },
        };
      }
    }

    if (rideData.driverId && rideData.driverId !== selectedDriverId && rideData.status !== 'driver_offered') {
      throw new functions.https.HttpsError('failed-precondition', 'El viaje ya está asignado a otro conductor');
    }

    // ✅ NUEVO: Bloquear si el conductor está BUSY
    try {
      const locSnap = await db.ref(`driverLocations/${selectedDriverId}`).once('value');
      const status = String(locSnap.val()?.status || '').toLowerCase();
      if (status === 'busy') {
        throw new functions.https.HttpsError('failed-precondition', 'DRIVER_BUSY');
      }
    } catch (locErr: any) {
      if (locErr instanceof functions.https.HttpsError) throw locErr;
      console.warn('⚠️ [confirmDriver] Error verificando driverLocations:', locErr?.message || locErr);
    }

    // Obtener datos del conductor
    console.log(`👤 [confirmDriver] Obteniendo datos del conductor ${selectedDriverId}...`);
    let driverData: any = null;

    try {
      // Intentar buscar por user_id (Firebase Auth UID)
      let driver = await driverRepo.findByUserId(selectedDriverId);
      
      // Si no encuentra, intentar buscar por ID de Supabase
      if (!driver) {
        console.log(`⚠️ [confirmDriver] No encontrado por user_id, intentando por ID de Supabase...`);
        driver = await driverRepo.findById(selectedDriverId);
      }
      
      if (driver) {
        const driverJson: any = driver.toJSON ? driver.toJSON() : (driver as any);
        const firstName = driverJson.first_name || driverJson.firstName || '';
        const lastName = driverJson.last_name || driverJson.lastName || '';
        const fullName = `${firstName} ${lastName}`.trim();
        let safeName = fullName;
        if (!safeName && rideData?.driver && typeof rideData.driver.name === 'string') {
          safeName = rideData.driver.name;
        }
        if (!safeName) {
          safeName = 'Conductor';
        }

        driverData = {
          id: driver.id,
          userId: driver.user_id,
          name: safeName,
          rating: driver.average_rating || 0,
          profilePhoto: driver.profile_photo,
        };
        console.log(`✅ [confirmDriver] Datos del conductor obtenidos`);
      } else {
        console.warn(`⚠️ [confirmDriver] Conductor no encontrado en Supabase (userId: ${selectedDriverId})`);
        // Continuar sin datos del conductor - no es crítico
      }
    } catch (dataError: any) {
      console.warn(`⚠️ [confirmDriver] Error obteniendo datos del conductor:`, dataError.message);
      // Continuar sin datos del conductor - no es crítico
    }

    // Actualizar viaje en Firebase
    console.log(`🔥 [confirmDriver] Actualizando viaje en Firebase...`);
    const calculatedFinalFare = (() => {
      const candidates = [
        rideData.finalFare,
        rideData.driverOfferedPrice,
        rideData.clientSuggestedPrice,
        rideData.estimatedPrice,
      ];
      for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          return Number(value.toFixed(2));
        }
      }
      return null;
    })();

    const updateData: any = {
      status: 'accepted',
      driverId: selectedDriverId,
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      clientConfirmationPending: false,
      // ✅ Preservar campos de negociación
      clientSuggestedPrice: rideData.clientSuggestedPrice || null,
      driverOfferedPrice: rideData.driverOfferedPrice || null,
      finalFare: calculatedFinalFare,
      // ✅ NUEVO: Preservar paradas extras y múltiples destinos
      extraDestinations: rideData.extraDestinations || null,
      hasMultipleDestinations: rideData.hasMultipleDestinations || false,
      waypointsCount: rideData.waypointsCount || 0,
    };

    if (driverData) {
      updateData.driver = driverData;
    }

    await db.ref(`activeRides/${rideId}`).update(updateData);
    console.log(`✅ [confirmDriver] Viaje actualizado en Firebase`);

    // ✅ NUEVO: Marcar conductor como BUSY
    try {
      await db.ref(`driverLocations/${selectedDriverId}`).update({
        status: 'busy',
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (busyErr) {
      console.warn('⚠️ [confirmDriver] No se pudo marcar BUSY en driverLocations:', (busyErr as any)?.message || busyErr);
    }

    await notifyUserSafe(selectedDriverId, '✅ Viaje asignado', 'El cliente confirmó el viaje. Dirígete al punto de encuentro.', {
      rideId,
      type: 'ride_assigned',
      clientId,
    });

    // ✅ NUEVO: Guardar oferta del conductor en offers/{driverId}
    console.log(`💰 [confirmDriver] Guardando oferta del conductor en offers...`);
    try {
      const offerPrice = calculatedFinalFare ?? rideData.driverOfferedPrice ?? rideData.estimatedPrice ?? 0;
      
      // Obtener datos completos del conductor desde driversInfo
      let driverInfo: any = null;
      try {
        const driverInfoSnapshot = await db.ref(`driversInfo/${selectedDriverId}`).once('value');
        driverInfo = driverInfoSnapshot.val();
      } catch (err) {
        console.warn(`⚠️ [confirmDriver] Error obteniendo driversInfo:`, err);
      }
      
      const offerDriverData = driverData || {
        id: selectedDriverId,
        name: driverInfo?.name || 'Conductor',
        rating: driverInfo?.rating || 0,
        photoURL: driverInfo?.photoURL || null,
      };
      
      const selectedOfferRef = db.ref(`activeRides/${rideId}/offers/${selectedDriverId}`);
      await selectedOfferRef.update({
        offeredPrice: offerPrice,
        status: 'accepted',
        driver: offerDriverData,
        acceptedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        awaitingClientConfirmation: false,
      });
      console.log(`✅ [confirmDriver] Oferta del conductor aceptado actualizada: C$${offerPrice}, Rating: ${offerDriverData.rating}`);

      // ✅ NUEVO: Cancelar otras ofertas pendientes
      try {
        const offersSnapshot = await db.ref(`activeRides/${rideId}/offers`).once('value');
        const offersData = offersSnapshot.val();

        if (offersData && typeof offersData === 'object') {
          const updates: Record<string, any> = {};
          Object.keys(offersData).forEach((driverIdKey) => {
            if (driverIdKey === selectedDriverId) {
              updates[`${driverIdKey}/status`] = 'accepted';
              updates[`${driverIdKey}/acceptedAt`] = admin.database.ServerValue.TIMESTAMP;
              updates[`${driverIdKey}/awaitingClientConfirmation`] = false;
            } else {
              updates[`${driverIdKey}/status`] = 'canceled';
              updates[`${driverIdKey}/canceledAt`] = admin.database.ServerValue.TIMESTAMP;
              updates[`${driverIdKey}/awaitingClientConfirmation`] = false;
            }
            updates[`${driverIdKey}/updatedAt`] = admin.database.ServerValue.TIMESTAMP;
          });

          if (Object.keys(updates).length > 0) {
            await db.ref(`activeRides/${rideId}/offers`).update(updates);
            console.log(`✅ [confirmDriver] Ofertas restantes marcadas como canceladas`);
          }
        }
      } catch (offersUpdateError: any) {
        console.warn(`⚠️ [confirmDriver] Error actualizando estados de offers:`, offersUpdateError.message);
      }
    } catch (offerError: any) {
      console.warn(`⚠️ [confirmDriver] Error guardando oferta:`, offerError.message);
    }

    // ✅ NUEVO: Actualizar en Supabase
    console.log(`🔥 [confirmDriver] Actualizando viaje en Supabase...`);
    try {
      const supabaseUpdateData: any = {
        driver_id: selectedDriverId,
        status: 'accepted',
        accepted_at: new Date(),
        client_confirmation_pending: false,
      };
      
      // ✅ NUEVO: Agregar service_id si existe en Firebase
      if (rideData.serviceId) {
        supabaseUpdateData.service_id = rideData.serviceId;
        console.log(`✅ [confirmDriver] Service ID: ${rideData.serviceId}`);
      }
      
      // Preservar campos de negociación
      if (rideData.clientSuggestedPrice) {
        supabaseUpdateData.client_suggested_price = rideData.clientSuggestedPrice;
      }
      if (rideData.driverOfferedPrice) {
        supabaseUpdateData.driver_offered_price = rideData.driverOfferedPrice;
      }
      
      await rideRepo.update(rideId, supabaseUpdateData);
      console.log(`✅ [confirmDriver] Viaje actualizado en Supabase`);
    } catch (supabaseError: any) {
      console.warn(`⚠️ [confirmDriver] Error actualizando en Supabase:`, supabaseError.message);
      // No lanzar error - Firebase ya fue actualizado
    }

    // Actualizar paymentStatus
    await db.ref(`paymentStatus/${rideId}`).update({
      status: 'pending',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return {
      success: true,
      message: `Conductor ${selectedDriverId} confirmado`,
      ride: {
        id: rideId,
        status: 'accepted',
        driverId: selectedDriverId,
        finalFare: calculatedFinalFare,
      },
    };
  } catch (error: any) {
    console.error('❌ [confirmDriver] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Iniciar viaje
 */
export const startRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId } = data;
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }
    console.log(`🚗 [startRide] Iniciando viaje: ${rideId}`);

    if (IS_LOAD_TEST) {
      try {
        const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
        const currentData = currentRide.val() || {};

        if (!currentData.status) {
          throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
        }

        if (currentData.status === 'in_progress') {
          console.log(`🔁 [startRide][LOADTEST] Viaje ${rideId} ya estaba en progreso en Firebase`);
        } else {
          await db.ref(`activeRides/${rideId}`).update({
            status: 'in_progress',
            startedAt: currentData.startedAt || admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            // Preservar campos de negociación
            clientSuggestedPrice: currentData.clientSuggestedPrice || null,
            driverOfferedPrice: currentData.driverOfferedPrice || null,
            negotiationStatus: currentData.negotiationStatus || null,
          });
          console.log(`✅ [startRide][LOADTEST] Viaje sincronizado a Firebase`);

          try {
            const driverId = currentData.driverId;
            if (driverId) {
              await db.ref(`driverLocations/${driverId}`).update({
                status: 'busy',
                updatedAt: admin.database.ServerValue.TIMESTAMP,
              });
            }
          } catch (busyErr: any) {
            console.warn('⚠️ [startRide][LOADTEST] No se pudo marcar BUSY en driverLocations:', busyErr.message || busyErr);
          }
        }
      } catch (firebaseError: any) {
        console.error(`⚠️ [startRide][LOADTEST] Error sincronizando a Firebase:`, firebaseError.message);
      }

      return { success: true, ride: { id: rideId, status: 'in_progress' } };
    }

    const ride = await rideService.startRide(rideId);
    
    // Sincronizar a Firebase Realtime DB
    console.log(`🔥 [startRide] Sincronizando a Firebase...`);
    try {
      // Obtener datos actuales para preservar negociación
      const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
      const currentData = currentRide.val() || {};
      
      if (currentData.status === 'in_progress') {
        console.log(`🔁 [startRide] Viaje ${rideId} ya estaba en progreso en Firebase`);
      } else {
        await db.ref(`activeRides/${rideId}`).update({
          status: 'in_progress',
          startedAt: currentData.startedAt || admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
          // ✅ NUEVO: Preservar campos de negociación
          clientSuggestedPrice: currentData.clientSuggestedPrice || null,
          driverOfferedPrice: currentData.driverOfferedPrice || null,
          negotiationStatus: currentData.negotiationStatus || null,
        });
        console.log(`✅ [startRide] Viaje sincronizado a Firebase`);

        // ✅ NUEVO: Marcar conductor como BUSY
        try {
          const driverId = currentData.driverId;
          if (driverId) {
            await db.ref(`driverLocations/${driverId}`).update({
              status: 'busy',
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          }
        } catch (busyErr) {
          console.warn('⚠️ [startRide] No se pudo marcar BUSY en driverLocations:', (busyErr as any)?.message || busyErr);
        }
      }
    } catch (firebaseError: any) {
      console.error(`⚠️ [startRide] Error sincronizando a Firebase:`, firebaseError.message);
    }
    
    return { success: true, ride: { id: ride.id, status: ride.status } };
  } catch (error: any) {
    console.error('❌ [startRide] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Completar viaje
 */
export const completeRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, finalFare, driverId } = data;
    if (!rideId || !finalFare) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y finalFare son requeridos');
    }
    console.log(`✅ [completeRide] Completando viaje: ${rideId}`);

    if (IS_LOAD_TEST) {
      try {
        const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
        const currentData = currentRide.val() || {};

        await db.ref(`activeRides/${rideId}`).update({
          status: 'pending_payment',
          completedAt: admin.database.ServerValue.TIMESTAMP,
          finalFare,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
          // Preservar campos de negociación
          clientSuggestedPrice: currentData.clientSuggestedPrice || null,
          driverOfferedPrice: currentData.driverOfferedPrice || null,
          negotiationStatus: currentData.negotiationStatus || null,
        });
        console.log(`✅ [completeRide][LOADTEST] Viaje sincronizado a Firebase`);

        try {
          const resolvedDriverId = driverId || currentData.driverId || null;
          if (resolvedDriverId) {
            await db.ref(`driverLocations/${resolvedDriverId}`).update({
              status: 'available',
              updatedAt: admin.database.ServerValue.TIMESTAMP,
            });
          }
        } catch (availErr: any) {
          console.warn('⚠️ [completeRide][LOADTEST] No se pudo marcar AVAILABLE en driverLocations:', availErr.message || availErr);
        }

        try {
          await db.ref(`paymentStatus/${rideId}`).update({
            status: 'pending',
            amount: finalFare,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        } catch (paymentErr: any) {
          console.warn('⚠️ [completeRide][LOADTEST] Error actualizando paymentStatus:', paymentErr.message || paymentErr);
        }

        await notifyUserSafe(currentData.clientId, '✅ Viaje finalizado', 'Por favor confirma y realiza el pago.', {
          rideId,
          type: 'ride_completed',
          finalFare,
        });
      } catch (firebaseError: any) {
        console.error(`⚠️ [completeRide][LOADTEST] Error sincronizando a Firebase:`, firebaseError.message);
      }

      return {
        success: true,
        ride: {
          id: rideId,
          status: 'pending_payment',
          finalFare,
          completedAt: new Date(),
        },
      };
    }

    const ride = await rideService.completeRide(rideId, finalFare);
    if (driverId) {
      const earnings = finalFare * 0.90;
      await driverRepo.incrementTotalRides(driverId);
      await driverRepo.incrementEarnings(driverId, earnings);
    }
    
    // Sincronizar a Firebase Realtime DB - mover a completedRides
    console.log(`🔥 [completeRide] Sincronizando a Firebase...`);
    try {
      // Obtener datos actuales para preservar negociación
      const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
      const currentData = currentRide.val() || {};
      
      // ✅ IMPORTANTE: Cambiar a 'pending_payment' (no directamente a 'completed')
      // El viaje solo pasa a 'completed' después de que se confirme el pago
      await db.ref(`activeRides/${rideId}`).update({
        status: 'pending_payment',
        completedAt: admin.database.ServerValue.TIMESTAMP,
        finalFare,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        // ✅ NUEVO: Preservar campos de negociación
        clientSuggestedPrice: currentData.clientSuggestedPrice || null,
        driverOfferedPrice: currentData.driverOfferedPrice || null,
        negotiationStatus: currentData.negotiationStatus || null,
      });
      console.log(`✅ [completeRide] Viaje sincronizado a Firebase`);

      // ✅ NUEVO: Marcar conductor como AVAILABLE
      try {
        const resolvedDriverId = driverId || currentData.driverId || null;
        if (resolvedDriverId) {
          await db.ref(`driverLocations/${resolvedDriverId}`).update({
            status: 'available',
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (availErr) {
        console.warn('⚠️ [completeRide] No se pudo marcar AVAILABLE en driverLocations:', (availErr as any)?.message || availErr);
      }

      await notifyUserSafe(currentData.clientId, '✅ Viaje finalizado', 'Por favor confirma y realiza el pago.', {
        rideId,
        type: 'ride_completed',
        finalFare,
      });
    } catch (firebaseError: any) {
      console.error(`⚠️ [completeRide] Error sincronizando a Firebase:`, firebaseError.message);
    }
    
    try {
      const freshRide = await rideRepo.findById(rideId);
      const paymentRecord = await paymentRepo.findByRideId(rideId);
      const paymentMethod = paymentRecord?.payment_method || freshRide?.payment_type || 'cash';
      const commissionRate = await getCommissionRateForRide(freshRide);
      const commissionDue = Number((finalFare * commissionRate).toFixed(2));

      if (paymentMethod === 'cash' && freshRide?.driver_id) {
        await ensureDriverPenalty({
          driverId: freshRide.driver_id,
          rideId,
          amount: commissionDue,
          penaltyType: 'cash_commission_due',
          reason: 'Comisión por viaje pagado en efectivo',
        });
      }

      if (paymentRecord) {
        await paymentRepo.update(paymentRecord.id, {
          commission: commissionDue,
          commission_rate_applied: commissionRate,
          payment_method: paymentMethod,
        } as any);
      }
    } catch (commissionErr) {
      console.error('⚠️ [completeRide] Error calculando comisiones en efectivo:', commissionErr);
    }

    return { success: true, ride: { id: ride.id, status: ride.status, finalFare: ride.final_fare, completedAt: ride.completed_at } };
  } catch (error: any) {
    console.error('❌ [completeRide] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cancelar viaje
 */
export const cancelRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId, reason, canceledBy } = data;
    
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }
    
    console.log(`❌ [cancelRide] Cancelando viaje: ${rideId} por: ${canceledBy || 'desconocido'}`);
    
    // Obtener datos del viaje ANTES de cancelar
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const firebaseRide = rideSnapshot.val();
    
    if (!firebaseRide) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase');
    }
    
    const rideStatus = firebaseRide.status; // 'requested', 'accepted', 'started', etc.
    console.log(`📊 [cancelRide] Estado actual del viaje: ${rideStatus}`);
    
    // Cancelar en Supabase
    const ride = await rideService.cancelRide(rideId, reason);
    
    // ✅ NUEVO: Actualizar cancel_reason y canceled_by en PostgreSQL
    await rideRepo.update(rideId, {
      cancel_reason: reason || null,
      canceled_by: canceledBy || null,
    });
    console.log(`✅ [cancelRide] Información de cancelación guardada en PostgreSQL`);
    
    // ✅ Obtener tarifa negociada/definitiva
    const rideRecord = await rideRepo.findById(rideId);
    const negotiatedFare = getNegotiatedFare(firebaseRide, rideRecord);
    const commissionRate = await getCommissionRateForRide(rideRecord);
    console.log(`💰 [cancelRide] negotiatedFare=${negotiatedFare} commissionRate=${commissionRate}`);

    // ✅ Calcular progreso del viaje si ya había iniciado
    let progressPercentage = 0;
    if (firebaseRide?.estimatedDistance && rideStatus && ['started', 'in_progress'].includes(rideStatus)) {
      try {
        progressPercentage = await calculateRideProgress(rideId, Number(firebaseRide.estimatedDistance));
      } catch (progressErr) {
        console.warn('⚠️ [cancelRide] Error calculando progreso:', progressErr);
        progressPercentage = 0;
      }
    }

    console.log(`📏 [cancelRide] progress=${progressPercentage}%`);

    const progressFactor = Math.min(Math.max(progressPercentage, 0), 100) / 100;

    // ✅ LÓGICA DE PAGO SEGÚN ESTADO Y QUIÉN CANCELA
    console.log(`💳 [cancelRide] Procesando paymentStatus...`);
    let paymentStatusUpdate: any = {
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      requiresClientPayment: false,
      chargeTarget: null,
    };
    let chargeTarget: 'driver' | 'client' | null = null;
    let chargeAmount = 0;
    let commissionDue = 0;
    let driverPayout = 0;
    const cancelerDriverId = canceledBy === 'driver' ? (firebaseRide?.driverId || rideRecord?.driver_id || null) : null;
    
    // Si el viaje NO ha iniciado (requested o accepted)
    if (rideStatus === 'requested' || rideStatus === 'pending_confirm' || rideStatus === 'accepted' || rideStatus === 'driver_on_route') {
      console.log(`✅ [cancelRide] Viaje sin iniciar (estado ${rideStatus})`);
      paymentStatusUpdate.canceledAt = admin.database.ServerValue.TIMESTAMP;
      paymentStatusUpdate.canceledBy = canceledBy || 'unknown';
      paymentStatusUpdate.cancelReason = reason || 'Sin especificar';

      if (canceledBy === 'client' && rideStatus !== 'requested') {
        console.log(`💸 [cancelRide] Cliente canceló después de asignar conductor - generando cargo`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'client_cancellation_before_start';
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = true;
        paymentStatusUpdate.chargeTarget = 'client';
        chargeTarget = 'client';
        const fallbackAmountSources = [
          negotiatedFare,
          firebaseRide?.finalFare,
          firebaseRide?.estimatedPrice,
          rideRecord?.final_fare,
          rideRecord?.estimated_price,
          rideRecord?.client_suggested_price,
          rideRecord?.driver_offered_price,
        ];

        for (const candidate of fallbackAmountSources) {
          const numeric = Number(candidate || 0);
          if (Number.isFinite(numeric) && numeric > 0) {
            chargeAmount = Number(numeric.toFixed(2));
            break;
          }
        }

        if (!chargeAmount || chargeAmount <= 0) {
          chargeAmount = 0;
        }

        commissionDue = Number((chargeAmount * commissionRate).toFixed(2));
        driverPayout = Number((chargeAmount - commissionDue).toFixed(2));
      } else {
        paymentStatusUpdate.status = 'canceled';
        paymentStatusUpdate.shouldCharge = false;
        paymentStatusUpdate.chargeType = 'pre_start_cancellation';
      }

      await notifyUserSafe(firebaseRide.clientId, '❌ Viaje cancelado', 'Tu solicitud de viaje fue cancelada.', {
        rideId,
        type: 'ride_canceled',
        canceledBy: canceledBy || 'unknown',
      });

      if (firebaseRide.driverId) {
        await notifyUserSafe(firebaseRide.driverId, 'ℹ️ Viaje cancelado', 'El cliente canceló la solicitud antes de iniciar el viaje.', {
          rideId,
          type: 'ride_canceled',
          canceledBy: canceledBy || 'unknown',
        });
      }
    }
    // Si el viaje está en progreso (in_progress)
    else if (rideStatus === 'in_progress') {
      console.log(`⚠️ [cancelRide] Viaje en progreso - Procesando pago pendiente`);
      
      // Si lo cancela el CONDUCTOR
      if (canceledBy === 'driver') {
        console.log(`🚗 [cancelRide] Cancelado por conductor en progreso - Se cobrará según programación`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'driver_cancellation';
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = false;
        paymentStatusUpdate.chargeTarget = 'driver';
        chargeTarget = 'driver';
        chargeAmount = negotiatedFare;
        commissionDue = Number((negotiatedFare * commissionRate).toFixed(2));
        driverPayout = Number((negotiatedFare - commissionDue).toFixed(2));
      }
      // Si lo cancela el CLIENTE
      else if (canceledBy === 'client') {
        console.log(`👤 [cancelRide] Cancelado por cliente en progreso - Cliente debe pagar pendientes`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'client_cancellation';
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = true;
        paymentStatusUpdate.chargeTarget = 'client';
        chargeTarget = 'client';

        const progressFactor = Math.min(Math.max(progressPercentage, 0), 100) / 100;
        chargeAmount = Number((negotiatedFare * progressFactor).toFixed(2));
        commissionDue = Number((chargeAmount * commissionRate).toFixed(2));
        driverPayout = Number((chargeAmount - commissionDue).toFixed(2));
      }
      
      paymentStatusUpdate.canceledAt = admin.database.ServerValue.TIMESTAMP;
      paymentStatusUpdate.canceledBy = canceledBy || 'unknown';
      paymentStatusUpdate.cancelReason = reason || 'Sin especificar';
    }
    // Si el viaje YA ha iniciado (started, completed, etc.)
    else if (rideStatus === 'started') {
      console.log(`⚠️ [cancelRide] Viaje iniciado - Procesando pago pendiente`);
      
      // Si lo cancela el CONDUCTOR
      if (canceledBy === 'driver') {
        console.log(`🚗 [cancelRide] Cancelado por conductor - Se cobrará según programación`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'driver_cancellation'; // Cargo por cancelación de conductor
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = false;
        paymentStatusUpdate.chargeTarget = 'driver';
        chargeTarget = 'driver';
        commissionDue = Number((negotiatedFare * commissionRate).toFixed(2));
        chargeAmount = commissionDue;
        driverPayout = 0;
      }
      // Si lo cancela el CLIENTE
      else if (canceledBy === 'client') {
        console.log(`👤 [cancelRide] Cancelado por cliente - Cliente debe pagar pendientes`);
        paymentStatusUpdate.status = 'pending';
        paymentStatusUpdate.chargeType = 'client_cancellation'; // Cargo por cancelación de cliente
        paymentStatusUpdate.shouldCharge = true;
        paymentStatusUpdate.requiresClientPayment = true;
        paymentStatusUpdate.chargeTarget = 'client';
        chargeTarget = 'client';
        chargeAmount = Number((negotiatedFare * progressFactor).toFixed(2));
        commissionDue = Number((chargeAmount * commissionRate).toFixed(2));
        driverPayout = Number((chargeAmount - commissionDue).toFixed(2));
      }
      
      paymentStatusUpdate.canceledAt = admin.database.ServerValue.TIMESTAMP;
      paymentStatusUpdate.canceledBy = canceledBy || 'unknown';
      paymentStatusUpdate.cancelReason = reason || 'Sin especificar';
    }
    
    // Sincronizar a Firebase Realtime DB
    console.log(`🔥 [cancelRide] Sincronizando a Firebase...`);
    try {
      const updateData: any = {
        status: 'canceled',
        cancelReason: reason || 'Sin especificar',
        canceledBy: canceledBy || 'unknown',
        canceledAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };
      
      await db.ref(`activeRides/${rideId}`).update(updateData);
      console.log(`✅ [cancelRide] Viaje sincronizado a Firebase`);
      
      // Actualizar paymentStatus
      const effectiveChargeAmount = chargeAmount > 0 ? chargeAmount : 0;
      const effectiveAmountField = chargeAmount > 0 ? chargeAmount : negotiatedFare;

      paymentStatusUpdate.chargeAmount = Number(effectiveChargeAmount.toFixed(2));
      paymentStatusUpdate.amount = Number(effectiveAmountField.toFixed(2));
      paymentStatusUpdate.finalAmount = paymentStatusUpdate.amount;
      paymentStatusUpdate.negotiatedFare = negotiatedFare;
      paymentStatusUpdate.progress = Number(progressPercentage.toFixed(2));
      paymentStatusUpdate.commissionDue = Number(commissionDue.toFixed(2));
      paymentStatusUpdate.driverPayout = Number(driverPayout.toFixed(2));

      if (chargeTarget === 'client') {
        if (paymentStatusUpdate.chargeAmount <= 0 && negotiatedFare > 0) {
          const fallbackCharge = Number(negotiatedFare.toFixed(2));
          paymentStatusUpdate.chargeAmount = fallbackCharge;
          paymentStatusUpdate.amount = fallbackCharge;
          paymentStatusUpdate.finalAmount = fallbackCharge;
          commissionDue = Number((fallbackCharge * commissionRate).toFixed(2));
          driverPayout = Number((fallbackCharge - commissionDue).toFixed(2));
          paymentStatusUpdate.commissionDue = commissionDue;
          paymentStatusUpdate.driverPayout = driverPayout;
        }

        paymentStatusUpdate.shouldCharge = paymentStatusUpdate.chargeAmount > 0;
        paymentStatusUpdate.requiresClientPayment = paymentStatusUpdate.chargeAmount > 0;
      } else if (chargeTarget === 'driver' && paymentStatusUpdate.chargeAmount <= 0) {
        paymentStatusUpdate.shouldCharge = false;
      }

      console.log(`💳 [cancelRide] Actualizando paymentStatus con: ${JSON.stringify(paymentStatusUpdate)}`);
      if (cancelerDriverId) {
        paymentStatusUpdate.canceledById = cancelerDriverId;
      }

      await db.ref(`paymentStatus/${rideId}`).update(paymentStatusUpdate);
      console.log(`✅ [cancelRide] paymentStatus actualizado`);

      // ✅ NUEVO: Marcar conductor como AVAILABLE si estaba asignado
      try {
        const assignedDriverId = firebaseRide?.driverId || rideRecord?.driver_id || null;
        if (assignedDriverId) {
          await db.ref(`driverLocations/${assignedDriverId}`).update({
            status: 'available',
            updatedAt: admin.database.ServerValue.TIMESTAMP,
          });
        }
      } catch (availErr) {
        console.warn('⚠️ [cancelRide] No se pudo marcar AVAILABLE en driverLocations:', (availErr as any)?.message || availErr);
      }
    } catch (firebaseError: any) {
      console.error(`⚠️ [cancelRide] Error sincronizando a Firebase:`, firebaseError.message);
    }

    // ✅ Penalizaciones y registros de cobro
    try {
      if (chargeTarget === 'driver' && commissionDue > 0 && cancelerDriverId) {
        await ensureDriverPenalty({
          driverId: cancelerDriverId,
          rideId,
          amount: commissionDue,
          penaltyType: 'driver_cancellation_after_start',
          reason: reason || 'Cancelación del conductor con viaje iniciado',
        });
      }

      if (chargeTarget === 'client' && chargeAmount > 0 && firebaseRide?.clientId) {
        await admin
          .database()
          .ref(`clientCharges/${firebaseRide.clientId}/${rideId}`)
          .set({
            amount: Number(chargeAmount.toFixed(2)),
            commission: Number(commissionDue.toFixed(2)),
            driverPayout: Number(driverPayout.toFixed(2)),
            progressPercentage: Number(progressPercentage.toFixed(2)),
            chargeType: paymentStatusUpdate.chargeType,
            createdAt: admin.database.ServerValue.TIMESTAMP,
          });
      }

      const existingPayment = await paymentRepo.findByRideId(rideId);
      if (existingPayment) {
        await paymentRepo.update(existingPayment.id, {
          amount: Number((chargeAmount > 0 ? chargeAmount : negotiatedFare).toFixed(2)),
          commission: Number(commissionDue.toFixed(2)),
          commission_rate_applied: commissionRate,
          status: paymentStatusUpdate.status,
          cancel_reason: reason || null,
          updated_at: new Date(),
        } as any);
      }
    } catch (penaltyErr) {
      console.error('⚠️ [cancelRide] Error procesando penalizaciones/cargos:', penaltyErr);
    }
    
    return { 
      success: true, 
      ride: { 
        id: ride.id, 
        status: ride.status, 
        canceledAt: ride.canceled_at,
        paymentStatus: paymentStatusUpdate.status,
      } 
    };
  } catch (error: any) {
    console.error('❌ [cancelRide] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener viajes del cliente
 */
export const getClientRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const clientId = context.auth.uid;
    console.log(`📋 [getClientRides] Obteniendo viajes del cliente: ${clientId}`);
    const rides = await rideService.getRidesByClient(clientId);
    return {
      success: true,
      rides: rides.map((r: any) => ({
        id: r.id,
        firebaseRideId: r.firebase_ride_id,
        status: r.status,
        estimatedPrice: r.estimated_price,
        finalFare: r.final_fare,
        distance: r.distance,
        duration: r.duration,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getClientRides] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener viajes del conductor
 */
export const getDriverRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const driverId = context.auth.uid;
    console.log(`📋 [getDriverRides] Obteniendo viajes del conductor: ${driverId}`);
    const rides = await rideService.getRidesByDriver(driverId);
    return {
      success: true,
      rides: rides.map((r: any) => ({
        id: r.id,
        firebaseRideId: r.firebase_ride_id,
        status: r.status,
        estimatedPrice: r.estimated_price,
        finalFare: r.final_fare,
        distance: r.distance,
        duration: r.duration,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getDriverRides] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener detalles del viaje
 * Intenta primero en Supabase, luego en Realtime DB
 */
export const getRideDetails = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    const { rideId } = data;
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`📍 [getRideDetails] Buscando viaje: ${rideId}`);

    // Intentar obtener de Supabase REST (datos enriquecidos)
    try {
      const supabaseResult = await supabaseGetRidesWithLocationsAndPayments(
        context.auth?.uid || rideId,
        'client',
        {
          rideId,
          includeTotals: false,
        },
      );

      const ridesList: any[] = Array.isArray(supabaseResult)
        ? supabaseResult
        : (supabaseResult?.rides || []);

      if (ridesList.length > 0) {
        const mapped = await mapRides(ridesList);
        if (mapped.length > 0) {
          console.log(`✅ [getRideDetails] Viaje encontrado y enriquecido desde Supabase`);
          return {
            success: true,
            ride: mapped[0],
          };
        }
      }
    } catch (supabaseError) {
      console.warn(`⚠️ [getRideDetails] Error obteniendo datos enriquecidos de Supabase:`, supabaseError);
    }

    // Fallback: utilizar repositorio Sequelize directo
    try {
      const ride = await rideRepo.findById(rideId);
      if (ride) {
        console.log(`✅ [getRideDetails] Viaje encontrado en Sequelize (fallback)`);
        return {
          success: true,
          ride: {
            id: ride.id,
            firebaseRideId: ride.firebase_ride_id,
            clientId: ride.client_id,
            driverId: ride.driver_id,
            status: ride.status,
            estimatedPrice: ride.estimated_price,
            finalFare: ride.final_fare,
            createdAt: ride.created_at,
          },
        };
      }
    } catch (repoError) {
      console.warn(`⚠️ [getRideDetails] Error en repositorio Sequelize, intentando Realtime DB:`, repoError);
    }

    // Fallback: Obtener de Realtime DB
    const db = require('firebase-admin').database();
    const snapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = snapshot.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    console.log(`✅ [getRideDetails] Viaje encontrado en Realtime DB`);

    return {
      success: true,
      ride: {
        id: rideId,
        clientId: rideData.clientId,
        driverId: rideData.driverId,
        status: rideData.status,
        originAddress: rideData.origin?.address || rideData.origin || null,
        destinationAddress: rideData.destination?.address || rideData.destination || null,
        estimatedPrice: rideData.estimatedPrice ?? 0,
        finalFare: rideData.finalFare ?? null,
        estimatedDistance: rideData.estimatedDistance ?? rideData.distance ?? 0,
        distance: rideData.distance ?? 0,
        estimatedDuration: rideData.estimatedDuration ?? rideData.duration ?? 0,
        duration: rideData.duration ?? 0,
        createdAt: rideData.createdAt ?? null,
        requestedAt: rideData.requestedAt ?? null,
        acceptedAt: rideData.acceptedAt ?? null,
        startedAt: rideData.startedAt ?? null,
        completedAt: rideData.completedAt ?? null,
        canceledAt: rideData.canceledAt ?? null,
        paymentType: rideData.paymentType ?? null,
        payments: [],
        locations: [],
        primaryPayment: null,
        allAddresses: [
          rideData.origin?.address || rideData.origin || 'Origen desconocido',
          rideData.destination?.address || rideData.destination || 'Destino desconocido',
        ].filter(Boolean),
        hasMultipleStops: false,
        waypointsCount: 0,
        passengers: rideData.passengers ?? 1,
      },
    };
  } catch (error: any) {
    console.error('❌ [getRideDetails] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener viajes activos
 */
export const getActiveRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);
  try {
    console.log(`🚗 [getActiveRides] Obteniendo viajes activos`);
    const rides = await rideRepo.findByStatus('in_progress');
    return {
      success: true,
      count: rides.length,
      rides: rides.map((r: any) => ({
        id: r.id,
        firebaseRideId: r.firebase_ride_id,
        clientId: r.client_id,
        driverId: r.driver_id,
        status: r.status,
        estimatedPrice: r.estimated_price,
        createdAt: r.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getActiveRides] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener estadísticas de viajes
 */
export const getRideStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    console.log(`📊 [getRideStats] Obteniendo estadísticas de viajes`);
    const allRides = await rideRepo.findAll();
    const completedRides = allRides.filter((r: any) => r.status === 'completed');
    const canceledRides = allRides.filter((r: any) => r.status === 'canceled');
    const totalRevenue = completedRides.reduce((sum: number, r: any) => sum + (r.final_fare || 0), 0);
    return {
      success: true,
      stats: {
        totalRides: allRides.length,
        completedRides: completedRides.length,
        canceledRides: canceledRides.length,
        totalRevenue,
        averageRideValue: completedRides.length > 0 ? totalRevenue / completedRides.length : 0,
      },
    };
  } catch (error: any) {
    console.error('❌ [getRideStats] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Aceptar precio sugerido por cliente (conductor)
 * ✅ NUEVO: Conductor acepta directamente el precio del cliente
 * ⚠️ Cuando acepta, el viaje pasa a 'accepted' con este conductor
 */
export const acceptClientPrice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const { rideId } = data;
    const driverId = context.auth.uid;
    
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }
    
    console.log(`💰 [acceptClientPrice] ✅ Conductor ${driverId} acepta precio del cliente para viaje ${rideId}`);
    
    // Obtener viaje actual
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // Validar que hay un precio sugerido por el cliente
    if (!ride.clientSuggestedPrice) {
      throw new functions.https.HttpsError('failed-precondition', 'No hay precio sugerido por el cliente');
    }
    
    // ✅ NUEVO: Permitir aceptar en estado 'requested' (antes de aceptar el viaje)
    // o si ya es el conductor asignado
    const isAssignedDriver = ride.driverId === driverId;
    const isRequestedState = ride.status === 'requested';
    
    if (!isAssignedDriver && !isRequestedState) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes negociar este viaje');
    }
    
    // ✅ IMPORTANTE: Cuando el conductor acepta el precio, el viaje pasa a 'accepted'
    // Esto notifica al cliente que este conductor aceptó su precio sugerido
    await db.ref(`activeRides/${rideId}`).update({
      driverId: driverId,  // Asignar este conductor
      status: 'accepted',  // Cambiar estado a accepted
      finalFare: ride.clientSuggestedPrice,
      negotiationStatus: 'driver_accepted',
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    // Actualizar en PostgreSQL
    await rideRepo.update(rideId, {
      driver_id: driverId,
      status: 'accepted',
      final_fare: ride.clientSuggestedPrice,
    });
    
    console.log(`✅ [acceptClientPrice] Conductor ${driverId} aceptó precio: ${ride.clientSuggestedPrice}, viaje ahora en estado 'accepted'`);
    
    return {
      success: true,
      message: 'Precio aceptado, esperando confirmación del cliente',
      finalFare: ride.clientSuggestedPrice,
      driverId: driverId,
    };
  } catch (error: any) {
    console.error('❌ [acceptClientPrice] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Hacer contraoferta de precio (conductor)
 * ✅ NUEVO: Permite al conductor hacer una contraoferta
 * ⚠️ Puede hacerlo en estado 'requested' (antes de aceptar) o después
 */
export const makeCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const { rideId, offeredPrice } = data;
    const driverId = context.auth.uid;
    
    if (!rideId || offeredPrice === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y offeredPrice son requeridos');
    }
    
    console.log(`💰 [makeCounterOffer] Conductor ${driverId} hace contraoferta: ${offeredPrice} para viaje ${rideId}`);
    
    // Obtener viaje actual
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // ✅ NUEVO: Permitir contraoferta en estado 'requested' o si ya es el conductor asignado
    const isAssignedDriver = ride.driverId === driverId;
    const isRequestedState = ride.status === 'requested';
    
    if (!isAssignedDriver && !isRequestedState) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes negociar este viaje');
    }
    
    // Actualizar en Firebase
    await db.ref(`activeRides/${rideId}`).update({
      driverOfferedPrice: offeredPrice,
      negotiationStatus: 'driver_offered',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    // Actualizar en PostgreSQL
    await rideRepo.update(rideId, {
      driver_offered_price: offeredPrice,
    });
    
    console.log(`✅ [makeCounterOffer] Contraoferta guardada: ${offeredPrice}`);
    
    return {
      success: true,
      message: 'Contraoferta enviada',
      offeredPrice,
    };
  } catch (error: any) {
    console.error('❌ [makeCounterOffer] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Aceptar contraoferta (cliente)
 * ✅ NUEVO: Permite al cliente aceptar la contraoferta del conductor
 * ⚠️ El viaje pasa a 'accepted' con el conductor que hizo la contraoferta
 */
export const acceptCounterOffer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  try {
    const { rideId, driverId, acceptedPrice } = data;
    const clientId = context.auth.uid;
    
    if (!rideId || !driverId || acceptedPrice === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId, driverId y acceptedPrice son requeridos');
    }
    
    console.log(`💰 [acceptCounterOffer] Cliente ${clientId} acepta contraoferta de ${driverId}: ${acceptedPrice} para viaje ${rideId}`);
    
    // Obtener viaje actual
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // Validar que el cliente es quien solicitó el viaje
    if (ride.clientId !== clientId) {
      throw new functions.https.HttpsError('permission-denied', 'No eres el cliente de este viaje');
    }
    
    // ✅ IMPORTANTE: Cuando el cliente acepta la contraoferta, el viaje pasa a 'accepted'
    // con el conductor que hizo la contraoferta
    await db.ref(`activeRides/${rideId}`).update({
      driverId: driverId,  // Asignar el conductor que hizo la contraoferta
      status: 'accepted',  // Cambiar estado a accepted
      finalFare: acceptedPrice,
      negotiationStatus: 'client_accepted',
      acceptedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
    
    // Actualizar en PostgreSQL
    await rideRepo.update(rideId, {
      driver_id: driverId,
      status: 'accepted',
      final_fare: acceptedPrice,
    });
    
    console.log(`✅ [acceptCounterOffer] Cliente aceptó contraoferta de ${driverId}: ${acceptedPrice}, viaje ahora en estado 'accepted'`);
    
    return {
      success: true,
      message: 'Contraoferta aceptada, esperando confirmación del conductor',
      finalFare: acceptedPrice,
      driverId: driverId,
    };
  } catch (error: any) {
    console.error('❌ [acceptCounterOffer] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calcular ETA inteligente basado en ubicación actual
 * ✅ NUEVO: Calcula ETA dinámico para el cliente
 */
export const getIntelligentETA = functions.https.onCall(async (data, context) => {
  try {
    const { rideId, currentLat, currentLng } = data;
    
    if (!rideId || currentLat === undefined || currentLng === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId, currentLat y currentLng son requeridos');
    }
    
    console.log(`⏱️ [getIntelligentETA] Calculando ETA para viaje: ${rideId}`);
    
    // Obtener datos del viaje desde Firebase
    const firebaseRide = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = firebaseRide.val();
    
    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }
    
    // Calcular distancia aproximada usando fórmula de Haversine
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371; // Radio de la Tierra en km
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };
    
    // Calcular distancia al destino
    const destination = ride.destination || ride.extraDestinations?.[0];
    if (!destination) {
      throw new functions.https.HttpsError('invalid-argument', 'No hay destino en el viaje');
    }
    
    const distanceKm = haversine(currentLat, currentLng, destination.lat, destination.lng);
    const distanceMeters = Math.round(distanceKm * 1000);
    
    // Estimar velocidad promedio: 40 km/h en ciudad
    const avgSpeed = 40; // km/h
    const etaMinutes = Math.ceil((distanceKm / avgSpeed) * 60);
    
    // Calcular timestamp de llegada
    const etaTimestamp = new Date(Date.now() + etaMinutes * 60 * 1000).toISOString();
    
    console.log(`✅ [getIntelligentETA] ETA calculado: ${etaMinutes} minutos, ${distanceMeters}m`);
    
    return {
      success: true,
      data: {
        etaMinutes,
        etaTimestamp,
        distanceRemaining: distanceMeters,
      },
    };
  } catch (error: any) {
    console.error('❌ [getIntelligentETA] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar estado del viaje y ubicación del conductor (para tracking)
 * ✅ NUEVO: Cloud Function para actualizar tracking desde el Frontend
 * ⚠️ Permite llamadas sin autenticación usando token especial
 */
export const updateRideStatus = functions.https.onCall(async (data, context) => {
  try {
    const { rideId, status, driverLocation } = data;
    
    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }
    
    console.log(`🚗 [updateRideStatus] Actualizando viaje: ${rideId}, status: ${status}`);
    
    // Actualizar en Firebase Realtime DB
    const updateData: any = {
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };
    
    if (status) {
      updateData.status = status;
    }
    
    if (driverLocation) {
      updateData.driverLocation = {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        speed: driverLocation.speed || null,
        heading: driverLocation.heading || null,
        accuracy: driverLocation.accuracy || null,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      };
    }
    
    await db.ref(`activeRides/${rideId}`).update(updateData);
    console.log(`✅ [updateRideStatus] Viaje actualizado: ${rideId}`);
    
    return { success: true, message: 'Viaje actualizado correctamente' };
  } catch (error: any) {
    console.error('❌ [updateRideStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * ✅ NUEVO: Cambiar método de pago
 * Permite al cliente o conductor cambiar el método de pago durante el viaje
 */
export const changePaymentMethod = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  // Enforce single-session
  await ensureActiveSession(context, data);

  try {
    const { rideId, newPaymentMethod, reason } = data;
    const userId = context.auth.uid;

    if (!rideId || !newPaymentMethod) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y newPaymentMethod son requeridos');
    }

    // Validar que el método de pago sea válido
    if (!['cash', 'card'].includes(newPaymentMethod)) {
      throw new functions.https.HttpsError('invalid-argument', 'Método de pago inválido. Debe ser "cash" o "card"');
    }

    console.log(`💳 [changePaymentMethod] Cambiando método de pago para viaje: ${rideId}`);
    console.log(`   De: ?, A: ${newPaymentMethod}, Por: ${userId}, Razón: ${reason || 'No especificada'}`);

    // Obtener datos del viaje (intentar primero con el ID como Firebase ID)
    let rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    let rideData = rideSnapshot.val();
    let firebaseRideId = rideId; // Guardar el Firebase ID para actualizar después

    // Si no encuentra en Firebase, intentar buscar en Supabase y luego en Firebase por firebase_ride_id
    if (!rideData) {
      console.log(`⚠️ [changePaymentMethod] Viaje no encontrado en activeRides/${rideId}, buscando en Supabase...`);
      try {
        const { RideRepository } = await import('../sequelize/repositories/RideRepository');
        const rideRepo = new RideRepository();
        const supabaseRide = await rideRepo.findById(rideId);
        
        if (supabaseRide && supabaseRide.firebase_ride_id) {
          console.log(`✅ [changePaymentMethod] Viaje encontrado en Supabase, buscando en Firebase con firebase_ride_id: ${supabaseRide.firebase_ride_id}`);
          firebaseRideId = supabaseRide.firebase_ride_id;
          rideSnapshot = await db.ref(`activeRides/${firebaseRideId}`).once('value');
          rideData = rideSnapshot.val();
        }
      } catch (err: any) {
        console.warn(`⚠️ [changePaymentMethod] Error buscando en Supabase:`, err.message);
      }
    }

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado en Firebase ni en Supabase');
    }

    // Validar que el usuario sea cliente o conductor del viaje
    const isClient = rideData.clientId === userId;
    const isDriver = rideData.driverId === userId;

    if (!isClient && !isDriver) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para cambiar el método de pago de este viaje');
    }

    const oldPaymentMethod = rideData.paymentMethod || 'cash';

    // No permitir cambiar si es el mismo método
    if (oldPaymentMethod === newPaymentMethod) {
      throw new functions.https.HttpsError('invalid-argument', `El método de pago ya es ${newPaymentMethod}`);
    }

    // ✅ ACTUALIZADO: Usar firebaseRideId para actualizar en Firebase
    console.log(`🔥 [changePaymentMethod] Actualizando en Firebase con ID: ${firebaseRideId}`);
    await db.ref(`activeRides/${firebaseRideId}`).update({
      paymentMethod: newPaymentMethod,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // ✅ También sincronizar paymentStatus/{rideId}
    try {
      const paymentStatusRef = db.ref(`paymentStatus/${firebaseRideId}`);
      const paymentStatusSnapshot = await paymentStatusRef.once('value');
      const paymentStatusData = paymentStatusSnapshot.val() || {};

      const paymentStatusUpdate: Record<string, any> = {
        method: newPaymentMethod,
        paymentMethod: newPaymentMethod,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      // Preservar status existente o establecer 'pending' si no existe
      if (!paymentStatusData.status) {
        paymentStatusUpdate.status = 'pending';
      }

      // Conservar amount si existe, de lo contrario reutilizar existente
      if (!paymentStatusData.amount && rideData.finalFare) {
        paymentStatusUpdate.amount = rideData.finalFare;
      }

      await paymentStatusRef.update(paymentStatusUpdate);
      console.log(`✅ [changePaymentMethod] paymentStatus sincronizado con método ${newPaymentMethod}`);
    } catch (paymentStatusError: any) {
      console.warn(`⚠️ [changePaymentMethod] No se pudo sincronizar paymentStatus:`, paymentStatusError.message);
    }

    console.log(`✅ [changePaymentMethod] Método de pago actualizado en Firebase: ${oldPaymentMethod} → ${newPaymentMethod}`);

    // ✅ NUEVO: Actualizar en Supabase también
    try {
      const { RideRepository } = await import('../sequelize/repositories/RideRepository');
      const rideRepo = new RideRepository();
      await rideRepo.update(rideId, {
        payment_method: newPaymentMethod,
      });
      console.log(`✅ [changePaymentMethod] Método de pago actualizado en Supabase: ${newPaymentMethod}`);
    } catch (supabaseError: any) {
      console.warn(`⚠️ [changePaymentMethod] Error actualizando en Supabase:`, supabaseError.message);
      // No lanzar error - Firebase ya fue actualizado
    }

    // Registrar el cambio en paymentMethodChanges
    const changeId = db.ref().push().key;
    await db.ref(`paymentMethodChanges/${firebaseRideId}/${changeId}`).set({
      changedAt: admin.database.ServerValue.TIMESTAMP,
      changedBy: userId,
      from: oldPaymentMethod,
      to: newPaymentMethod,
      reason: reason || 'No especificada',
    });

    console.log(`📝 [changePaymentMethod] Cambio registrado en paymentMethodChanges/${firebaseRideId}/${changeId}`);

    return {
      success: true,
      message: `Método de pago cambiado de ${oldPaymentMethod} a ${newPaymentMethod}`,
      ride: {
        id: rideId,
        paymentMethod: newPaymentMethod,
      },
    };
  } catch (error: any) {
    console.error('❌ [changePaymentMethod] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Rechazar una solicitud de viaje para un conductor específico
 * Oculta el viaje para ese conductor hasta que el precio cambie
 */
export const rejectRide = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId, reason } = data || {};
    const driverId = context.auth.uid;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    // Obtener datos actuales del viaje desde Firebase
    const rideSnap = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnap.val();

    if (!rideData) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // Permitir rechazo principalmente en solicitudes abiertas, pero registrar en cualquier estado
    const allowedStatuses = ['requested', 'driver_offered', 'pending_confirm'];
    if (!allowedStatuses.includes(String(rideData.status))) {
      console.log(`ℹ️ [rejectRide] Registrando rechazo en estado ${rideData.status}`);
    }

    // Determinar precio de referencia actual (cliente > estimado)
    const currentEstimatedPrice = Number(rideData.estimatedPrice || 0) || null;
    const currentClientSuggestedPrice = (
      rideData.clientSuggestedPrice !== undefined && rideData.clientSuggestedPrice !== null
    ) ? Number(rideData.clientSuggestedPrice) : null;
    const priceAtRejection = (currentClientSuggestedPrice && currentClientSuggestedPrice > 0)
      ? currentClientSuggestedPrice
      : (currentEstimatedPrice || null);

    const nowTs = admin.database.ServerValue.TIMESTAMP;

    // Guardar registro de rechazo por conductor
    const rejectionRef = db.ref(`activeRides/${rideId}/rejections/${driverId}`);
    await rejectionRef.update({
      reason: reason || 'not_interested',
      priceAtRejection: priceAtRejection,
      clientSuggestedPriceAtRejection: currentClientSuggestedPrice,
      estimatedPriceAtRejection: currentEstimatedPrice,
      rejectedAt: nowTs,
      updatedAt: nowTs,
    });

    // Marcar oferta del conductor como rechazada (si existe)
    try {
      await db.ref(`activeRides/${rideId}/offers/${driverId}`).update({
        status: 'rejected',
        updatedAt: nowTs,
      });
    } catch (offerErr) {
      console.warn('⚠️ [rejectRide] No se pudo actualizar offers:', offerErr);
    }

    console.log(`✅ [rejectRide] Conductor ${driverId} rechazó viaje ${rideId} (precio: ${priceAtRejection ?? 'N/A'})`);

    return {
      success: true,
      message: 'Viaje rechazado para este conductor hasta que el precio cambie',
      ride: { id: rideId },
    };
  } catch (error: any) {
    console.error('❌ [rejectRide] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
