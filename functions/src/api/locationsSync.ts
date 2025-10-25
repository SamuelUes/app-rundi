/**
 * Locations Sync API - Sincronizar ubicaciones a Supabase
 */

import * as functions from 'firebase-functions';
import pool from '../config/database';

/**
 * Guardar ubicación de viaje con reintentos
 */
export const saveRideLocationWithRetry = functions.https.onCall(
  async (data, context) => {
    const { rideId, latitude, longitude, speed, heading, accuracy } = data;

    if (!rideId || latitude === undefined || longitude === undefined) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'rideId, latitude y longitude son requeridos'
      );
    }

    // Detectar si es Firebase ID o UUID
    const isFirebaseId = rideId.includes('-') && rideId.length > 20 && !rideId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    
    if (isFirebaseId) {
      console.log('ℹ️ Firebase ID detectado:', rideId);
      console.log('⏭️ Saltando guardado en PostgreSQL (viaje en Firebase Realtime DB)');
      return {
        success: true,
        message: 'Ubicación no guardada (viaje en Firebase)',
        skipped: true,
        reason: 'Firebase ID - no se guarda en PostgreSQL',
      };
    }

    const client = await pool.connect();
    const maxRetries = 3;
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(
          `📍 Intento ${attempt + 1}/${maxRetries} guardando ubicación`
        );

        // Verificar que el viaje existe y está en progreso
        // Nota: El viaje puede estar en Firebase o PostgreSQL
        let rideExists = false;
        try {
          const rideResult = await client.query(
            'SELECT id, status FROM rides WHERE id = $1',
            [rideId]
          );

          if (rideResult.rows.length > 0) {
            const ride = rideResult.rows[0];
            
            // 🆕 IMPORTANTE: Si el viaje está completado o cancelado, NO guardar ubicación
            if (ride.status === 'completed' || ride.status === 'canceled') {
              console.log(`⏹️ Viaje ${rideId} está ${ride.status}. NO se guardará ubicación.`);
              return {
                success: true,
                message: `Ubicación no guardada (viaje ${ride.status})`,
                skipped: true,
                reason: `Viaje ${ride.status} - no se guarda en PostgreSQL`,
              };
            }
            
            if (ride.status !== 'in_progress') {
              console.log(`⚠️ Viaje está en estado: ${ride.status}. Continuando...`);
            }
            rideExists = true;
          }
        } catch (pgError: any) {
          // Si falla la búsqueda en PostgreSQL, continuamos
          // El viaje podría estar solo en Firebase
          console.log('⚠️ No se pudo verificar viaje en PostgreSQL:', pgError.message);
        }

        // Si no existe en PostgreSQL, asumimos que está en Firebase
        if (!rideExists) {
          console.log('ℹ️ Viaje no encontrado en PostgreSQL, asumiendo que está en Firebase');
        }

        // Deduplicación: verificar si la ubicación es muy similar a la anterior
        try {
          const lastLocResult = await client.query(
            `SELECT lat, lng, timestamp FROM ride_locations 
             WHERE ride_id = $1 
             ORDER BY timestamp DESC 
             LIMIT 1`,
            [rideId]
          );

          if (lastLocResult.rows.length > 0) {
            const last = lastLocResult.rows[0];
            const timeDiff =
              Date.now() - new Date(last.timestamp).getTime();
            const latDiff = Math.abs(parseFloat(last.lat) - latitude);
            const lngDiff = Math.abs(parseFloat(last.lng) - longitude);

            // Ignorar si es muy similar (< 5 segundos y < 0.0001 grados)
            if (timeDiff < 5000 && latDiff < 0.0001 && lngDiff < 0.0001) {
              console.log('⏭️ Ubicación duplicada, ignorando');
              return {
                success: true,
                message: 'Ubicación duplicada ignorada',
                isDuplicate: true,
              };
            }
          }
        } catch (dedupeError: any) {
          console.log('⚠️ Error en deduplicación:', dedupeError.message);
          // Continuamos aunque falle la deduplicación
        }

        // Insertar ubicación
        const insertResult = await client.query(
          `INSERT INTO ride_locations (
            ride_id, lat, lng, speed, heading, accuracy, timestamp, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          RETURNING *`,
          [
            rideId,
            latitude,
            longitude,
            speed || null,
            heading || null,
            accuracy || null,
          ]
        );

        const location = insertResult.rows[0];
        console.log('✅ Ubicación guardada:', location.id);

        return {
          success: true,
          location,
          attempt: attempt + 1,
        };
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Intento ${attempt + 1} falló:`, error.message);

        // Si es el último intento, lanzar error
        if (attempt === maxRetries - 1) {
          throw new functions.https.HttpsError(
            'internal',
            `Error guardando ubicación después de ${maxRetries} intentos: ${error.message}`
          );
        }

        // Esperar antes de reintentar (backoff exponencial)
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    client.release();
    throw new functions.https.HttpsError(
      'internal',
      lastError?.message || 'Error desconocido'
    );
  }
);

/**
 * Guardar múltiples ubicaciones en lote
 */
export const saveRideLocationsBatch = functions.https.onCall(
  async (data, context) => {
    const { rideId, locations } = data;

    if (!rideId || !Array.isArray(locations) || locations.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'rideId y locations (array) son requeridos'
      );
    }

    // Detectar si es Firebase ID o UUID
    const isFirebaseId = rideId.includes('-') && rideId.length > 20 && !rideId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    
    if (isFirebaseId) {
      console.log('ℹ️ Firebase ID detectado en batch:', rideId);
      console.log('⏭️ Saltando guardado en PostgreSQL (viaje en Firebase Realtime DB)');
      return {
        success: true,
        message: 'Ubicaciones no guardadas (viaje en Firebase)',
        skipped: true,
        count: locations.length,
        reason: 'Firebase ID - no se guarda en PostgreSQL',
      };
    }

    const client = await pool.connect();
    try {
      console.log(
        `📍 Guardando lote de ${locations.length} ubicaciones para viaje ${rideId}`
      );

      // Verificar que el viaje existe (no crítico)
      let rideExists = false;
      try {
        const rideResult = await client.query(
          'SELECT id, status FROM rides WHERE id = $1',
          [rideId]
        );

        if (rideResult.rows.length > 0) {
          const ride = rideResult.rows[0];
          
          // 🆕 IMPORTANTE: Si el viaje está completado o cancelado, NO guardar ubicaciones
          if (ride.status === 'completed' || ride.status === 'canceled') {
            console.log(`⏹️ Viaje ${rideId} está ${ride.status}. NO se guardarán ubicaciones.`);
            return {
              success: true,
              message: `Ubicaciones no guardadas (viaje ${ride.status})`,
              skipped: true,
              count: locations.length,
              reason: `Viaje ${ride.status} - no se guarda en PostgreSQL`,
            };
          }
          
          rideExists = true;
        }
      } catch (pgError: any) {
        console.log('⚠️ No se pudo verificar viaje en PostgreSQL:', pgError.message);
      }

      if (!rideExists) {
        console.log('ℹ️ Viaje no encontrado en PostgreSQL, asumiendo que está en Firebase');
      }

      await client.query('BEGIN');

      const insertedLocations = [];

      for (const loc of locations) {
        try {
          const result = await client.query(
            `INSERT INTO ride_locations (
              ride_id, lat, lng, speed, heading, accuracy, timestamp, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING *`,
            [
              rideId,
              loc.latitude,
              loc.longitude,
              loc.speed || null,
              loc.heading || null,
              loc.accuracy || null,
              loc.timestamp || new Date().toISOString(),
            ]
          );

          insertedLocations.push(result.rows[0]);
        } catch (locError: any) {
          console.warn(`⚠️ Error guardando ubicación individual:`, locError.message);
          // Continuamos con la siguiente ubicación
        }
      }

      await client.query('COMMIT');

      console.log(`✅ ${insertedLocations.length} ubicaciones guardadas`);

      return {
        success: true,
        count: insertedLocations.length,
        locations: insertedLocations,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('❌ Error guardando lote:', error);
      throw new functions.https.HttpsError('internal', error.message);
    } finally {
      client.release();
    }
  }
);
