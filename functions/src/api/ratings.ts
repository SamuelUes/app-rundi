/**
 * Ratings API - Sistema de calificaciones bidireccionales
 * Cliente puede calificar a conductor y viceversa
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import pool from '../config/database';

/**
 * Enviar calificación después de un viaje
 * Sistema mejorado con categorías detalladas y validaciones
 */
export const submitRating = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Intentar obtener información del viaje desde Firebase primero
    const firebaseRideRef = admin.database().ref(`activeRides/${rideId}`);
    const firebaseRideSnapshot = await firebaseRideRef.once('value');
    const firebaseRide = firebaseRideSnapshot.val();

    let pgRideId: string | null = null;
    let ride: any = null;

    // 2. Buscar el viaje en PostgreSQL
    if (firebaseRide) {
      // Si está en Firebase, buscar en PostgreSQL por client_id y driver_id
      const rideResult = await client.query(
        `SELECT id, client_id, driver_id, status 
         FROM rides 
         WHERE client_id = $1 
           AND driver_id = $2 
           AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 1`,
        [firebaseRide.clientId, firebaseRide.driverId]
      );

      if (rideResult.rows.length > 0) {
        ride = rideResult.rows[0];
        pgRideId = ride.id;
      } else {
        // Si no existe en PostgreSQL, usar datos de Firebase
        console.log(`⚠️ Viaje ${rideId} no encontrado en PostgreSQL, usando datos de Firebase`);
        ride = {
          client_id: firebaseRide.clientId,
          driver_id: firebaseRide.driverId,
          status: firebaseRide.status,
        };
      }

      // Validar que el viaje esté completado o en pending_rating
      if (firebaseRide.status !== 'completed' && firebaseRide.status !== 'pending_rating') {
        throw new functions.https.HttpsError('failed-precondition', 'Solo se pueden calificar viajes completados');
      }
    } else {
      // Si no está en Firebase, buscar directamente en PostgreSQL por rideId
      // Esto puede pasar si el viaje ya fue archivado
      console.log(`⚠️ Viaje ${rideId} no encontrado en Firebase, buscando en PostgreSQL...`);
      
      // Intentar buscar por el rideId del usuario actual
      const rideResult = await client.query(
        `SELECT id, client_id, driver_id, status 
         FROM rides 
         WHERE (client_id = $1 OR driver_id = $1)
           AND completed_at IS NOT NULL
         ORDER BY completed_at DESC
         LIMIT 1`,
        [fromUserId]
      );

      if (rideResult.rows.length === 0) {
        throw new functions.https.HttpsError('not-found', 'Viaje no encontrado. Es posible que ya haya sido calificado.');
      }

      ride = rideResult.rows[0];
      pgRideId = ride.id;
      console.log(`✅ Viaje encontrado en PostgreSQL: ${pgRideId}`);
    }

    // 2. Determinar quién califica a quién
    let toUserId: string;
    let raterRole: 'client' | 'driver';

    if (fromUserId === ride.client_id) {
      // Cliente califica a conductor
      toUserId = ride.driver_id;
      raterRole = 'client';
    } else if (fromUserId === ride.driver_id) {
      // Conductor califica a cliente
      toUserId = ride.client_id;
      raterRole = 'driver';
    } else {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para calificar este viaje');
    }

    // 3. Verificar que no haya calificado ya (solo si existe en PostgreSQL)
    if (pgRideId) {
      const existingRating = await client.query(
        `SELECT id FROM ratings 
         WHERE ride_id = $1 AND from_user_id = $2`,
        [pgRideId, fromUserId]
      );

      if (existingRating.rows.length > 0) {
        throw new functions.https.HttpsError('already-exists', 'Ya has calificado este viaje');
      }
    }

    // 4. Insertar calificación con categorías detalladas (solo si existe en PostgreSQL)
    let newRating: any = null;
    
    if (pgRideId) {
      const ratingResult = await client.query(
        `INSERT INTO ratings (
          ride_id, from_user_id, to_user_id, rating, comment, 
          punctuality, cleanliness, communication, driving, safety, friendliness,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id, created_at`,
        [
          pgRideId,  // ✅ Usar UUID de PostgreSQL
          fromUserId,
          toUserId,
          rating,
          comment || null,
          punctuality || null,
          cleanliness || null,
          communication || null,
          driving || null,
          safety || null,
          friendliness || null,
        ]
      );
      newRating = ratingResult.rows[0];
      console.log(`✅ Rating guardado en PostgreSQL con ID: ${newRating.id}`);
    } else {
      console.log(`⚠️ Rating NO guardado en PostgreSQL (viaje aún no archivado)`);
      console.log(`   Se guardará cuando el viaje se archive en PostgreSQL`);
      newRating = { id: null, created_at: new Date() };
    }

    // 5. Actualizar promedio de rating del usuario calificado
    await updateUserAverageRating(client, toUserId);

    // 6. Actualizar Firebase Realtime Database
    const rideRef = admin.database().ref(`activeRides/${rideId}`);
    const rideSnapshot = await rideRef.once('value');
    const currentFirebaseRide = rideSnapshot.val();

    let bothRated = false;

    if (currentFirebaseRide) {
      // Marcar quién calificó
      const updateData: any = {};
      if (raterRole === 'client') {
        updateData.clientRated = true;
        updateData.clientRating = rating;
      } else {
        updateData.driverRated = true;
        updateData.driverRating = rating;
      }
      updateData.lastUpdate = admin.database.ServerValue.TIMESTAMP;

      await rideRef.update(updateData);

      // 7. Si ambos calificaron, archivar el viaje
      bothRated = (raterRole === 'client' && currentFirebaseRide.driverRated) || 
                  (raterRole === 'driver' && currentFirebaseRide.clientRated);

      if (bothRated) {
        console.log(`📦 Ambos calificaron - Archivando viaje ${rideId}`);
        
        // Cambiar status a completed (ahora sí está listo para archivar)
        await rideRef.update({
          status: 'completed',
          bothRated: true,
          lastUpdate: admin.database.ServerValue.TIMESTAMP,
        });

        // El sistema de limpieza automática lo archivará
        console.log(`✅ Viaje ${rideId} marcado para archivado`);
      }
    }

    await client.query('COMMIT');

    console.log(`✅ Rating creado: ${raterRole} calificó con ${rating} estrellas`);

    return {
      success: true,
      ratingId: newRating.id,
      message: 'Calificación enviada exitosamente',
      bothRated,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando rating:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener promedio de rating de un usuario con categorías detalladas
 */
export const getUserRating = functions.https.onCall(async (data, context) => {
  const { userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId es requerido');
  }

  const client = await pool.connect();
  try {
    // Obtener promedio y total de ratings recibidos con categorías
    const result = await client.query(
      `SELECT 
        COUNT(*) as total_ratings,
        ROUND(AVG(rating)::numeric, 2) as average_rating,
        ROUND(AVG(punctuality)::numeric, 2) as avg_punctuality,
        ROUND(AVG(cleanliness)::numeric, 2) as avg_cleanliness,
        ROUND(AVG(communication)::numeric, 2) as avg_communication,
        ROUND(AVG(driving)::numeric, 2) as avg_driving,
        ROUND(AVG(safety)::numeric, 2) as avg_safety,
        ROUND(AVG(friendliness)::numeric, 2) as avg_friendliness,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_stars,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_stars,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_stars,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_stars,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
       FROM ratings
       WHERE to_user_id = $1`,
      [userId]
    );

    const stats = result.rows[0];

    // Obtener últimos comentarios
    const commentsResult = await client.query(
      `SELECT rating, comment, created_at
       FROM ratings
       WHERE to_user_id = $1 AND comment IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    return {
      userId,
      totalRatings: parseInt(stats.total_ratings),
      averageRating: parseFloat(stats.average_rating) || 0,
      categories: {
        punctuality: parseFloat(stats.avg_punctuality) || 0,
        cleanliness: parseFloat(stats.avg_cleanliness) || 0,
        communication: parseFloat(stats.avg_communication) || 0,
        driving: parseFloat(stats.avg_driving) || 0,
        safety: parseFloat(stats.avg_safety) || 0,
        friendliness: parseFloat(stats.avg_friendliness) || 0,
      },
      distribution: {
        fiveStars: parseInt(stats.five_stars),
        fourStars: parseInt(stats.four_stars),
        threeStars: parseInt(stats.three_stars),
        twoStars: parseInt(stats.two_stars),
        oneStar: parseInt(stats.one_star),
      },
      recentComments: commentsResult.rows,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo rating:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Obtener ratings de un viaje específico
 */
export const getRideRatings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const client = await pool.connect();
  try {
    // Obtener ambos ratings del viaje (cliente → conductor y conductor → cliente)
    const result = await client.query(
      `SELECT 
        r.id,
        r.from_user_id,
        r.to_user_id,
        r.rating,
        r.comment,
        r.punctuality,
        r.cleanliness,
        r.communication,
        r.created_at
       FROM ratings r
       WHERE r.ride_id = $1
       ORDER BY r.created_at ASC`,
      [rideId]
    );

    return {
      rideId,
      ratings: result.rows,
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo ratings del viaje:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

/**
 * Función auxiliar para actualizar el promedio de rating de un usuario
 */
async function updateUserAverageRating(client: any, userId: string): Promise<void> {
  // Calcular nuevo promedio
  const result = await client.query(
    `SELECT ROUND(AVG(rating)::numeric, 2) as average_rating
     FROM ratings
     WHERE to_user_id = $1`,
    [userId]
  );

  const averageRating = parseFloat(result.rows[0]?.average_rating || '0');

  // Actualizar en tabla drivers si es conductor
  await client.query(
    `UPDATE drivers 
     SET average_rating = $1, updated_at = NOW()
     WHERE user_id = $2`,
    [averageRating, userId]
  );

  console.log(`📊 Rating promedio actualizado para ${userId}: ${averageRating}`);
}

/**
 * Omitir calificación (marcar que el usuario decidió no calificar)
 */
export const skipRating = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;
  const userId = context.auth.uid;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  try {
    // Obtener viaje de Firebase
    const rideRef = admin.database().ref(`activeRides/${rideId}`);
    const rideSnapshot = await rideRef.once('value');
    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // Determinar si es cliente o conductor
    let raterRole: 'client' | 'driver';
    if (userId === ride.clientId) {
      raterRole = 'client';
    } else if (userId === ride.driverId) {
      raterRole = 'driver';
    } else {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para omitir este viaje');
    }

    // Marcar que omitió la calificación
    const updateData: any = {};
    if (raterRole === 'client') {
      updateData.clientRated = true;  // Marcamos como "rated" aunque omitió
      updateData.clientSkipped = true;  // Flag de que omitió
    } else {
      updateData.driverRated = true;
      updateData.driverSkipped = true;
    }
    updateData.lastUpdate = admin.database.ServerValue.TIMESTAMP;

    await rideRef.update(updateData);

    // Verificar si ambos ya "calificaron" (o omitieron)
    const bothRated = (raterRole === 'client' && ride.driverRated) || 
                      (raterRole === 'driver' && ride.clientRated);

    if (bothRated) {
      console.log(`📦 Ambos completaron rating (calificaron u omitieron) - Archivando viaje ${rideId}`);
      
      // Cambiar status a completed
      await rideRef.update({
        status: 'completed',
        bothRated: true,
        lastUpdate: admin.database.ServerValue.TIMESTAMP,
      });

      console.log(`✅ Viaje ${rideId} marcado para archivado`);
    }

    return {
      success: true,
      message: 'Calificación omitida',
      bothRated: bothRated || false,
    };
  } catch (error: any) {
    console.error('❌ Error omitiendo rating:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Alias para compatibilidad con frontend
 */
export const rateRide = submitRating;
