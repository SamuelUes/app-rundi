/**
 * Ride History Functions
 * Funciones para obtener historial de viajes desde PostgreSQL
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
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
    // Obtener viajes con información de usuarios
    const result = await client.query(
      `SELECT 
        r.id,
        r.client_id as "clientId",
        r.driver_id as "driverId",
        r.status,
        r.estimated_distance as "estimatedDistance",
        r.estimated_duration as "estimatedDuration",
        r.estimated_price as "estimatedFare",
        r.final_fare as "finalFare",
        r.ride_type as "rideType",
        r.passengers,
        r.created_at as "createdAt",
        r.updated_at as "updatedAt",
        r.requested_at as "requestedAt",
        r.accepted_at as "acceptedAt",
        r.started_at as "startedAt",
        r.completed_at as "completedAt",
        r.canceled_at as "canceledAt",
        -- ✅ NUEVO: Obtener ubicaciones desde ride_locations
        (SELECT latitude FROM ride_locations WHERE ride_id = r.id AND location_type = 'origin' LIMIT 1) as "originLat",
        (SELECT longitude FROM ride_locations WHERE ride_id = r.id AND location_type = 'origin' LIMIT 1) as "originLng",
        (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'origin' LIMIT 1) as "originAddress",
        (SELECT latitude FROM ride_locations WHERE ride_id = r.id AND location_type = 'destination' LIMIT 1) as "destinationLat",
        (SELECT longitude FROM ride_locations WHERE ride_id = r.id AND location_type = 'destination' LIMIT 1) as "destinationLng",
        (SELECT address FROM ride_locations WHERE ride_id = r.id AND location_type = 'destination' LIMIT 1) as "destinationAddress"
       FROM rides r
       WHERE r.client_id = $1 OR r.driver_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Función helper para convertir fechas a ISO string o null
    const toISOStringOrNull = (date: any) => {
      if (!date) return null;
      try {
        return new Date(date).toISOString();
      } catch {
        return null;
      }
    };

    // Obtener información de clientes y conductores
    const ridesWithUserData = await Promise.all(
      result.rows.map(async (ride) => {
        const rideData = { 
          ...ride,
          // Convertir coordenadas a números
          originLat: parseFloat(ride.originLat) || 0,
          originLng: parseFloat(ride.originLng) || 0,
          destinationLat: parseFloat(ride.destinationLat) || 0,
          destinationLng: parseFloat(ride.destinationLng) || 0,
          // Convertir distancia y duración a números
          estimatedDistance: parseInt(ride.estimatedDistance) || 0,
          estimatedDuration: parseInt(ride.estimatedDuration) || 0,
          // Convertir precios a números
          estimatedFare: parseFloat(ride.estimatedFare) || 0,
          finalFare: ride.finalFare ? parseFloat(ride.finalFare) : null,
          // Convertir pasajeros a número
          passengers: parseInt(ride.passengers) || 1,
          // Convertir fechas a ISO strings
          createdAt: toISOStringOrNull(ride.createdAt),
          updatedAt: toISOStringOrNull(ride.updatedAt),
          requestedAt: toISOStringOrNull(ride.requestedAt),
          acceptedAt: toISOStringOrNull(ride.acceptedAt),
          startedAt: toISOStringOrNull(ride.startedAt),
          completedAt: toISOStringOrNull(ride.completedAt),
          canceledAt: toISOStringOrNull(ride.canceledAt),
        };
        
        // Obtener datos del cliente si existe
        if (ride.clientId) {
          try {
            const clientRecord = await admin.auth().getUser(ride.clientId);
            rideData.client = {
              id: clientRecord.uid,
              name: clientRecord.displayName || "Usuario",
              email: clientRecord.email || "",
              phone: clientRecord.phoneNumber || "",
            };
          } catch (error) {
            console.error(`Error obteniendo cliente ${ride.clientId}:`, error);
            rideData.client = {
              id: ride.clientId,
              name: "Usuario",
              email: "",
              phone: "",
            };
          }
        }

        // Obtener datos del conductor si existe
        if (ride.driverId) {
          try {
            const driverRecord = await admin.auth().getUser(ride.driverId);
            
            // Obtener rating del conductor desde PostgreSQL
            const driverStats = await client.query(
              `SELECT AVG(rating) as avg_rating FROM ratings WHERE driver_id = $1`,
              [ride.driverId]
            );
            
            rideData.driver = {
              id: driverRecord.uid,
              name: driverRecord.displayName || "Conductor",
              email: driverRecord.email || "",
              phone: driverRecord.phoneNumber || "",
              rating: driverStats.rows[0]?.avg_rating ? parseFloat(driverStats.rows[0].avg_rating) : 0,
            };
          } catch (error) {
            console.error(`Error obteniendo conductor ${ride.driverId}:`, error);
            rideData.driver = {
              id: ride.driverId,
              name: "Conductor",
              email: "",
              phone: "",
              rating: 0,
            };
          }
        }

        return rideData;
      })
    );

    console.log(`✅ Historial obtenido: ${ridesWithUserData.length} viajes para usuario ${userId}`);

    return {
      success: true,
      rides: ridesWithUserData,
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
        SUM(final_fare) as "totalEarnings",
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
