/**
 * Rides Compatibility API
 * Funciones para compatibilidad con el Frontend
 * Lee de Realtime DB en lugar de Supabase
 */

import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';

const db = admin.database();

/**
 * Obtener detalles del viaje desde Realtime DB
 */
export const getRideDetailsFromRealtime = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { rideId } = data;

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    console.log(`📍 [getRideDetails] Obteniendo detalles del viaje: ${rideId}`);

    // Obtener viaje de Realtime DB - activeRides
    const snapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = snapshot.val();

    if (!rideData) {
      console.warn(`⚠️ [getRideDetails] Viaje no encontrado en activeRides: ${rideId}`);
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    console.log(`✅ [getRideDetails] Viaje encontrado: ${rideId}`);

    return {
      success: true,
      ride: {
        id: rideId,
        clientId: rideData.clientId,
        driverId: rideData.driverId,
        status: rideData.status,
        origin: rideData.origin,
        destination: rideData.destination,
        estimatedPrice: rideData.estimatedPrice,
        finalFare: rideData.finalFare,
        distance: rideData.distance,
        duration: rideData.duration,
        createdAt: rideData.createdAt,
        startedAt: rideData.startedAt,
        completedAt: rideData.completedAt,
        paymentMethod: rideData.paymentMethod,
        rating: rideData.rating,
      },
    };
  } catch (error: any) {
    console.error('❌ [getRideDetails] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener viajes del usuario desde Realtime DB
 */
export const getMyRidesFromRealtime = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const userId = context.auth.uid;
    const { limit = 50, offset = 0 } = data;

    console.log(`📍 [getMyRides] Obteniendo viajes del usuario: ${userId}`);

    // Obtener todos los viajes activos
    const snapshot = await db.ref('activeRides').once('value');
    const allRides = snapshot.val() || {};

    // Filtrar viajes del usuario (como cliente o conductor)
    const userRides = Object.entries(allRides)
      .filter(([_, ride]: any) => ride.clientId === userId || ride.driverId === userId)
      .map(([rideId, ride]: any) => ({
        id: rideId,
        ...ride,
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(offset, offset + limit);

    console.log(`✅ [getMyRides] Se encontraron ${userRides.length} viajes`);

    return {
      success: true,
      rides: userRides,
    };
  } catch (error: any) {
    console.error('❌ [getMyRides] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
