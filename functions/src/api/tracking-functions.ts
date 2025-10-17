/**
 * Firebase Callable Functions para Tracking
 * Migrado de tracking.ts (Express) a Firebase Functions
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Calcular ETA (Estimated Time of Arrival)
 * Firebase Callable Function
 */
export const getETA = functions.https.onCall(async (data, context) => {
  const { rideId, lat, lng } = data;

  // Validaciones
  if (!rideId || lat === undefined || lng === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'rideId, lat y lng son requeridos'
    );
  }

  const currentLat = parseFloat(lat);
  const currentLng = parseFloat(lng);

  if (isNaN(currentLat) || isNaN(currentLng)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Coordenadas inválidas'
    );
  }

  const client = await pool.connect();
  try {
    // Obtener el viaje
    const rideResult = await client.query(
      `SELECT id, destination_lat, destination_lng 
       FROM rides 
       WHERE id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideResult.rows[0];

    // Calcular distancia restante (Haversine)
    const distanceRemaining = calculateDistance(
      currentLat,
      currentLng,
      ride.destination_lat,
      ride.destination_lng
    );

    // Obtener velocidad promedio de las últimas 5 ubicaciones
    const locationsResult = await client.query(
      `SELECT speed 
       FROM ride_locations 
       WHERE ride_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 5`,
      [rideId]
    );

    let avgSpeed = 30; // Default 30 km/h
    if (locationsResult.rows.length > 0) {
      const speeds = locationsResult.rows
        .filter((loc: any) => loc.speed && loc.speed > 5) // Filtrar velocidades muy bajas
        .map((loc: any) => loc.speed);

      if (speeds.length > 0) {
        avgSpeed = speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length;
      }
    }

    // Calcular ETA en minutos
    const etaMinutes = Math.round((distanceRemaining / avgSpeed) * 60);

    // Calcular hora de llegada (enviar timestamp ISO para que el frontend lo formatee)
    const arrivalTime = new Date();
    arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);

    return {
      success: true,
      data: {
        etaMinutes,
        etaTimestamp: arrivalTime.toISOString(), // Enviar timestamp ISO
        distanceRemaining: Math.round(distanceRemaining * 1000) / 1000, // Redondear a 3 decimales
        avgSpeed: Math.round(avgSpeed * 10) / 10, // Velocidad promedio
      },
    };
  } catch (error: any) {
    console.error('❌ Error calculando ETA:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Guardar ubicación del conductor durante el viaje
 * Firebase Callable Function
 */
export const saveLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId, latitude, longitude, speed, heading, accuracy } = data;

  // Validaciones
  if (!rideId || latitude === undefined || longitude === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'rideId, latitude y longitude son requeridos'
    );
  }

  const client = await pool.connect();
  try {
    // Verificar que el viaje existe y está en progreso
    const rideResult = await client.query(
      `SELECT id, status, driver_id 
       FROM rides 
       WHERE id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideResult.rows[0];

    // Verificar que el usuario es el conductor del viaje
    if (ride.driver_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'No tienes permiso para actualizar este viaje'
      );
    }

    // Solo guardar si el viaje está en progreso
    if (ride.status !== 'in_progress') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `No se puede guardar ubicación. El viaje está en estado: ${ride.status}`
      );
    }

    // Guardar ubicación
    const locationResult = await client.query(
      `INSERT INTO ride_locations 
       (id, ride_id, lat, lng, speed, heading, accuracy, timestamp)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [rideId, latitude, longitude, speed || null, heading || null, accuracy || null]
    );

    console.log(`📍 Ubicación guardada para viaje ${rideId}`);

    return {
      success: true,
      message: 'Ubicación guardada correctamente',
      data: locationResult.rows[0],
    };
  } catch (error: any) {
    console.error('❌ Error guardando ubicación:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener historial completo de ruta de un viaje
 * Firebase Callable Function
 */
export const getRouteHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const client = await pool.connect();
  try {
    // Verificar que el viaje existe y el usuario tiene acceso
    const rideResult = await client.query(
      `SELECT id, client_id, driver_id 
       FROM rides 
       WHERE id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideResult.rows[0];

    // Verificar que el usuario es el cliente o el conductor
    if (ride.client_id !== context.auth.uid && ride.driver_id !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'No tienes permiso para ver este viaje'
      );
    }

    // Obtener todas las ubicaciones ordenadas por timestamp
    const locationsResult = await client.query(
      `SELECT * 
       FROM ride_locations 
       WHERE ride_id = $1 
       ORDER BY timestamp ASC`,
      [rideId]
    );

    return {
      success: true,
      data: {
        rideId,
        totalPoints: locationsResult.rows.length,
        route: locationsResult.rows,
      },
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo historial:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 * Retorna distancia en kilómetros
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
