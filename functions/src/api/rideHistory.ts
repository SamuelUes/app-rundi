/**
 * Ride History Functions
 * Funciones para obtener historial de viajes desde PostgreSQL
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Obtener historial de viajes del usuario actual
 */
export const getMyRides = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { limit = 50, offset = 0 } = data;
  const userId = context.auth.uid;

  const client = await pool.connect();
  try {
    // Obtener viajes donde el usuario es cliente o conductor
    const result = await client.query(
      `SELECT 
        r.id,
        r.client_id as "clientId",
        r.driver_id as "driverId",
        r.status,
        r.origin_lat as "originLat",
        r.origin_lng as "originLng",
        r.origin_address as "originAddress",
        r.destination_lat as "destinationLat",
        r.destination_lng as "destinationLng",
        r.destination_address as "destinationAddress",
        r.estimated_distance as "estimatedDistance",
        r.estimated_duration as "estimatedDuration",
        r.estimated_fare as "estimatedFare",
        r.final_fare as "finalFare",
        r.ride_type as "rideType",
        r.created_at as "createdAt",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.canceled_at as "canceledAt"
       FROM rides r
       WHERE r.client_id = $1 OR r.driver_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    console.log(`✅ Historial obtenido: ${result.rows.length} viajes para usuario ${userId}`);

    return {
      success: true,
      rides: result.rows,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo historial:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener estadísticas del conductor
 */
export const getDriverStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const userId = context.auth.uid;

  const client = await pool.connect();
  try {
    // Obtener estadísticas del conductor
    const result = await client.query(
      `SELECT 
        COUNT(*) as "totalRides",
        SUM(final_price) as "totalEarnings",
        AVG(CASE WHEN rating > 0 THEN rating ELSE NULL END) as "averageRating"
       FROM rides
       WHERE driver_id = $1 AND status = 'completed'`,
      [userId]
    );

    const stats = result.rows[0];

    return {
      success: true,
      stats: {
        totalRides: parseInt(stats.totalRides) || 0,
        totalEarnings: parseFloat(stats.totalEarnings) || 0,
        averageRating: parseFloat(stats.averageRating) || 0,
      },
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo estadísticas:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});
