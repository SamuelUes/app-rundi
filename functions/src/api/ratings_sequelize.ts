/**
 * Ratings API - Versión Sequelize
 * Sistema de calificaciones bidireccionales
 * Cliente puede calificar a conductor y viceversa
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { RatingService } from '../sequelize/services/RatingService';
import { RideRepository } from '../sequelize/repositories/RideRepository';
import { DriverRepository } from '../sequelize/repositories/DriverRepository';

const ratingService = new RatingService();
const rideRepo = new RideRepository();
const driverRepo = new DriverRepository();

const CATEGORY_KEYS = [
  'punctuality',
  'cleanliness',
  'communication',
  'driving',
  'safety',
  'friendliness',
] as const;

type CategoryKey = typeof CATEGORY_KEYS[number];

const toNumberOrNull = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const roundTwo = (value: number): number => Math.round(value * 100) / 100;

/**
 * Enviar calificación después de un viaje
 * Sistema mejorado con categorías detalladas y validaciones
 */
export const submitRating = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const {
      rideId,
      rating,
      comment,
      // Categorías detalladas (1-5 cada una)
      punctuality,      // Puntualidad
      cleanliness,      // Limpieza del vehículo
      communication,    // Comunicación
      driving,          // Conducción (solo para conductores)
      safety,           // Seguridad
      friendliness,     // Amabilidad
    } = data;
    const fromUserId = context.auth.uid;

    // Validaciones
    if (!rideId || !rating) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId y rating son requeridos');
    }

    if (rating < 1 || rating > 5) {
      throw new functions.https.HttpsError('invalid-argument', 'Rating debe estar entre 1 y 5');
    }

    // Validar categorías opcionales
    const categories = [punctuality, cleanliness, communication, driving, safety, friendliness];
    for (const cat of categories) {
      if (cat !== undefined && cat !== null && (cat < 1 || cat > 5)) {
        throw new functions.https.HttpsError('invalid-argument', 'Todas las categorías deben estar entre 1 y 5');
      }
    }

    console.log(`⭐ [submitRating] Procesando calificación para viaje ${rideId}`);
    // 1. Intentar obtener información del viaje desde Firebase primero
    const firebaseRideRef = admin.database().ref(`activeRides/${rideId}`);
    const firebaseRideSnapshot = await firebaseRideRef.once('value');
    const firebaseRide = firebaseRideSnapshot.val();

    let ride: any = null;
    let toUserId: string | null = null;

    // 2. Buscar el viaje en Sequelize
    if (firebaseRide) {
      console.log(`   clientId: ${firebaseRide.clientId}, driverId: ${firebaseRide.driverId}`);

      // Buscar por firebase_ride_id PRIMERO (más específico)
      ride = await rideRepo.findByFirebaseId(rideId);

      if (ride) {
        console.log(`✅ Viaje encontrado en Sequelize: ${ride.id}`);
        // Determinar a quién se califica (si es cliente califica a conductor, y viceversa)
        toUserId = fromUserId === firebaseRide.clientId ? firebaseRide.driverId : firebaseRide.clientId;
      } else {
        console.log(`⚠️ Viaje ${rideId} no encontrado en Sequelize, usando datos de Firebase`);
        toUserId = fromUserId === firebaseRide.clientId ? firebaseRide.driverId : firebaseRide.clientId;
      }
    } else {
      // ✅ NUEVO: Si no está en Firebase, intentar buscar en Sequelize por UUID
      console.log(`⚠️ Viaje ${rideId} no encontrado en Firebase, buscando en Sequelize...`);
      try {
        ride = await rideRepo.findById(rideId);
        if (ride) {
          console.log(`✅ Viaje encontrado en Sequelize: ${ride.id}`);
          // Determinar a quién se califica
          toUserId = fromUserId === ride.client_id ? ride.driver_id : ride.client_id;
        }
      } catch (err) {
        console.log(`⚠️ Error buscando viaje en Sequelize:`, err);
      }
    }

    if (!toUserId) {
      throw new functions.https.HttpsError('not-found', 'No se encontró el usuario a calificar. Asegúrate de que el viaje existe y tiene un conductor asignado.');
    }

    // 3. Crear calificación usando Sequelize
    const ratingData = {
      ride_id: ride?.id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      rating,
      comment,
      punctuality,
      cleanliness,
      communication,
      driving,
      safety,
      friendliness,
    };

    const createdRating = await ratingService.submitRating(ratingData);

    console.log(`✅ [submitRating] Calificación creada: ${createdRating.id}`);
    
    // ✅ NUEVO: Actualizar estado del viaje a 'rating_completed' en Firebase
    try {
      const firebaseRideId = firebaseRide?.id || rideId;
      console.log(`📝 [submitRating] Actualizando estado del viaje a 'rating_completed': ${firebaseRideId}`);
      
      await admin.database().ref(`activeRides/${firebaseRideId}`).update({
        status: 'rating_completed',
        ratingCompletedAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });
      
      console.log(`✅ [submitRating] Viaje actualizado a 'rating_completed'`);
    } catch (firebaseError: any) {
      console.warn(`⚠️ [submitRating] Error actualizando viaje en Firebase:`, firebaseError.message);
      // No lanzar error - el rating ya fue guardado
    }
    
    return {
      success: true,
      rating: {
        id: createdRating.id,
        rating: createdRating.rating,
        toUserId,
        createdAt: createdRating.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [submitRating] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener información unificada pública del conductor
 * Fuente principal de reseñas/rating: Supabase ratings (to_user_id)
 * Además sincroniza stats de conductor hacia RTDB para mantener driversInfo al día.
 */
export const getDriverPublicInsights = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = String(data?.driverId || '').trim();
    const limit = Math.min(Math.max(Number(data?.limit || 10), 1), 30);

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    const [avgRatingRaw, ratingsRaw, driverByUserIdRaw] = await Promise.all([
      ratingService.getAverageRating(driverId),
      ratingService.getDriverRatings(driverId),
      driverRepo.findByUserId(driverId),
    ]);

    const driverRaw = driverByUserIdRaw || (await driverRepo.findById(driverId));

    const allRatings = Array.isArray(ratingsRaw) ? ratingsRaw : [];

    const recentCommentedRatings = allRatings
      .filter((item: any) => typeof item?.comment === 'string' && item.comment.trim().length > 0)
      .slice()
      .sort((a: any, b: any) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    const driverJson = (driverRaw as any)?.toJSON ? (driverRaw as any).toJSON() : (driverRaw as any) || {};

    const averageRating = roundTwo(
      toNumberOrNull((avgRatingRaw as any)?.averageRating) ??
      toNumberOrNull(driverJson?.average_rating) ??
      0,
    );
    const totalRatings =
      Math.max(0, Math.round(toNumberOrNull((avgRatingRaw as any)?.totalRatings) ?? 0));

    const totalRides = Math.max(0, Math.round(toNumberOrNull(driverJson?.total_rides) ?? 0));
    const totalEarnings = roundTwo(toNumberOrNull(driverJson?.total_earnings) ?? 0);

    const reviews = recentCommentedRatings
      .map((item: any) => {
        const createdAt = item?.created_at ? new Date(item.created_at) : null;
        const createdAtMs = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : null;
        return {
          id: String(item?.id || ''),
          author: 'Pasajero',
          comment: String(item.comment).trim(),
          rating: toNumberOrNull(item?.rating) ?? 5,
          createdAt: createdAtMs,
        };
      });

    const categoryTotals: Record<CategoryKey, number> = {
      punctuality: 0,
      cleanliness: 0,
      communication: 0,
      driving: 0,
      safety: 0,
      friendliness: 0,
    };

    for (const item of allRatings) {
      for (const category of CATEGORY_KEYS) {
        const value = Math.round(toNumberOrNull((item as any)?.[category]) ?? 0);
        if (value > 0) {
          categoryTotals[category] += 1;
        }
      }
    }

    const compliments = CATEGORY_KEYS.map((category) => ({
      id: category,
      count: categoryTotals[category] || 0,
    }));

    const yearsOnPlatform = (() => {
      const createdAt = driverJson?.created_at ? new Date(driverJson.created_at) : null;
      if (!createdAt || !Number.isFinite(createdAt.getTime())) return 0;
      const years = (Date.now() - createdAt.getTime()) / (365 * 24 * 60 * 60 * 1000);
      return Math.max(0, Math.floor(years));
    })();

    const now = Date.now();
    const statsPatch = {
      rating: averageRating,
      averageRating,
      totalRatings,
      totalRides,
      earnings: totalEarnings,
      updatedAt: now,
      stats: {
        rating: averageRating,
        averageRating,
        totalRatings,
        completedRides: totalRides,
        totalRides,
        earnings: totalEarnings,
      },
    };

    await Promise.allSettled([
      admin.database().ref(`driversInfo/${driverId}`).update(statsPatch),
      admin.database().ref(`drivers/${driverId}`).update(statsPatch),
    ]);

    return {
      success: true,
      driverId,
      stats: {
        averageRating,
        totalRatings,
        totalRides,
        totalEarnings,
        yearsOnPlatform,
      },
      compliments,
      reviews,
    };
  } catch (error: any) {
    console.error('❌ [getDriverPublicInsights] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener calificaciones de un conductor
 */
export const getDriverRatings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    const ratings = await ratingService.getDriverRatings(driverId);
    const avgRating = await ratingService.getAverageRating(driverId);
    const categoryAverages = await ratingService.getCategoryAverages(driverId);

    return {
      success: true,
      ratings: ratings.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        fromUserId: r.from_user_id,
        createdAt: r.created_at,
      })),
      averageRating: (avgRating as any)?.averageRating || 0,
      totalRatings: (avgRating as any)?.totalRatings || 0,
      categoryAverages: categoryAverages || {},
    };
  } catch (error: any) {
    console.error('❌ [getDriverRatings] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener últimas calificaciones de un conductor
 */
export const getRecentRatings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, limit = 10 } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`📊 [getRecentRatings] Obteniendo últimas ${limit} calificaciones para ${driverId}`);

    const ratings = await ratingService.getRecentRatings(driverId, limit);

    return {
      success: true,
      ratings: ratings.map((r: any) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        fromUserId: r.from_user_id,
        categories: {
          punctuality: r.punctuality,
          cleanliness: r.cleanliness,
          communication: r.communication,
          driving: r.driving,
          safety: r.safety,
          friendliness: r.friendliness,
        },
        createdAt: r.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getRecentRatings] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
