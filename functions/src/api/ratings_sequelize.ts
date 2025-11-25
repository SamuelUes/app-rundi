/**
 * Ratings API - Versión Sequelize
 * Sistema de calificaciones bidireccionales
 * Cliente puede calificar a conductor y viceversa
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { RatingService } from '../sequelize/services/RatingService';
import { RideRepository } from '../sequelize/repositories/RideRepository';

const ratingService = new RatingService();
const rideRepo = new RideRepository();

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
