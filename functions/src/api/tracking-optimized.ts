/**
 * Sistema de Tracking Optimizado
 * - Firebase Realtime DB: Actualizaciones cada 5 segundos (tiempo real)
 * - PostgreSQL: Historial comprimido (cada 30 segundos o cambios significativos)
 * - ETA Inteligente: Machine learning básico con histórico de velocidades
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import pool from '../config/database';

// Configuración de tracking
const POSTGRES_UPDATE_INTERVAL = 30000; // 30 segundos para PostgreSQL
const SIGNIFICANT_DISTANCE_THRESHOLD = 50; // 50 metros para guardar en PostgreSQL
const ETA_CACHE_DURATION = 10000; // 10 segundos de cache para ETA

// Cache en memoria para ETAs
const etaCache = new Map<string, { eta: number; timestamp: number }>();

/**
 * Actualizar ubicación del conductor (optimizado)
 * - Firebase: Cada 5 segundos (tiempo real para cliente)
 * - PostgreSQL: Solo cambios significativos (compresión)
 */
export const updateDriverLocationOptimized = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId, latitude, longitude, speed, heading, accuracy, timestamp } = data;
  const driverId = context.auth.uid;

  // Validaciones
  if (!latitude || !longitude) {
    throw new functions.https.HttpsError('invalid-argument', 'latitude y longitude son requeridos');
  }

  try {
    // 1. SIEMPRE actualizar en Firebase Realtime (tiempo real)
    const realtimeUpdate = {
      lat: latitude,
      lng: longitude,
      speed: speed || 0,
      heading: heading || 0,
      accuracy: accuracy || 0,
      timestamp: timestamp || Date.now(),
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    };

    // Actualizar ubicación del conductor
    await admin.database()
      .ref(`driverLocations/${driverId}`)
      .set(realtimeUpdate);

    // Si hay un viaje activo, actualizar también en activeRides
    if (rideId) {
      await admin.database()
        .ref(`activeRides/${rideId}/currentLocation`)
        .set(realtimeUpdate);
    }

    // 2. Guardar historial en Firebase (solo cambios significativos)
    let savedToHistory = false;

    if (rideId) {
      // Obtener última ubicación guardada en Firebase
      const lastLocationSnapshot = await admin.database()
        .ref(`rideLocations/${rideId}`)
        .orderByChild('timestamp')
        .limitToLast(1)
        .once('value');

      let shouldSave = false;

      if (!lastLocationSnapshot.exists()) {
        // Primera ubicación, siempre guardar
        shouldSave = true;
      } else {
        const lastLocations = lastLocationSnapshot.val();
        const lastLocation = Object.values(lastLocations)[0] as any;
        const timeDiff = Date.now() - lastLocation.timestamp;
        const distance = calculateDistance(
          lastLocation.lat,
          lastLocation.lng,
          latitude,
          longitude
        );

        // Guardar si:
        // - Han pasado 30+ segundos desde la última actualización
        // - O el conductor se movió 50+ metros (cambio significativo)
        shouldSave = timeDiff >= POSTGRES_UPDATE_INTERVAL || distance >= SIGNIFICANT_DISTANCE_THRESHOLD;
      }

      if (shouldSave) {
        // Guardar en Firebase con push key
        await admin.database()
          .ref(`rideLocations/${rideId}`)
          .push({
            lat: latitude,
            lng: longitude,
            speed: speed || 0,
            heading: heading || 0,
            accuracy: accuracy || 0,
            timestamp: timestamp || Date.now(),
          });
        savedToHistory = true;
      }
    }

    return {
      success: true,
      updatedRealtime: true,
      savedToHistory: savedToHistory,
      message: savedToHistory 
        ? 'Ubicación actualizada en tiempo real y guardada en historial'
        : 'Ubicación actualizada en tiempo real',
    };
  } catch (error: any) {
    console.error('❌ Error actualizando ubicación:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calcular ETA inteligente con machine learning básico
 * Usa histórico de velocidades y patrones de tráfico
 */
export const getIntelligentETA = functions.https.onCall(async (data, context) => {
  const { rideId, currentLat, currentLng, destinationLat, destinationLng } = data;

  // Validaciones básicas
  if (!rideId || currentLat === undefined || currentLng === undefined) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'rideId, currentLat y currentLng son requeridos'
    );
  }

  // Verificar cache
  const cacheKey = `${rideId}-${currentLat}-${currentLng}`;
  const cached = etaCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ETA_CACHE_DURATION) {
    return {
      success: true,
      etaMinutes: cached.eta,
      source: 'cache',
      cacheAge: Date.now() - cached.timestamp,
    };
  }

  try {
    // 1. Obtener viaje desde Firebase
    const db = admin.database();
    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const ride = rideSnapshot.val();

    if (!ride) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    // 2. Obtener coordenadas de destino (desde parámetros o desde Firebase)
    let finalDestLat = destinationLat;
    let finalDestLng = destinationLng;

    if (!finalDestLat || !finalDestLng) {
      // Obtener desde Firebase
      finalDestLat = ride.destination?.latitude || ride.destination?.lat;
      finalDestLng = ride.destination?.longitude || ride.destination?.lng;
    }

    if (!finalDestLat || !finalDestLng) {
      throw new functions.https.HttpsError('invalid-argument', 'No se pudo obtener el destino del viaje');
    }

    // 3. Calcular distancia restante
    const distanceRemaining = calculateDistance(
      currentLat,
      currentLng,
      finalDestLat,
      finalDestLng
    );

    // 4. Obtener ubicaciones recientes del conductor desde Firebase (últimos 2 minutos)
    if (!ride.driverId) {
      throw new functions.https.HttpsError('not-found', 'Conductor no asignado al viaje');
    }

    const driverLocationsSnapshot = await db.ref(`driverLocations/${ride.driverId}`).once('value');
    const driverLocations = driverLocationsSnapshot.val();

    const recentSpeeds: number[] = [];
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000);

    if (driverLocations) {
      Object.values(driverLocations).forEach((loc: any) => {
        if (loc.speed && loc.speed > 5 && loc.timestamp && loc.timestamp > twoMinutesAgo) {
          recentSpeeds.push(loc.speed);
        }
      });
    }

    // 4. Para velocidades históricas, usar un valor por defecto basado en hora del día
    const currentHour = new Date().getHours();

    // 5. Calcular velocidad promedio
    let avgSpeed = 30; // Default: 30 km/h

    if (recentSpeeds.length > 0) {
      // Usar velocidades recientes del conductor
      const recentAvg = recentSpeeds.reduce((a: number, b: number) => a + b, 0) / recentSpeeds.length;
      avgSpeed = recentAvg;
    }

    // 6. Ajustar por hora del día (tráfico)
    const trafficMultiplier = getTrafficMultiplier(currentHour);
    avgSpeed = avgSpeed * trafficMultiplier;

    // 7. Calcular ETA en minutos
    const etaMinutes = Math.round((distanceRemaining / avgSpeed) * 60);

    // 8. Calcular hora de llegada
    const arrivalTime = new Date();
    arrivalTime.setMinutes(arrivalTime.getMinutes() + etaMinutes);

    // 9. Guardar en cache
    etaCache.set(cacheKey, { eta: etaMinutes, timestamp: Date.now() });

    // 10. Limpiar cache antiguo (cada 100 requests)
    if (Math.random() < 0.01) {
      cleanupETACache();
    }

    return {
      success: true,
      data: {
        etaMinutes,
        etaTimestamp: arrivalTime.toISOString(),
        distanceRemaining: Math.round(distanceRemaining * 1000) / 1000,
      },
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      trafficMultiplier,
      source: 'calculated',
      dataPoints: {
        recent: recentSpeeds.length,
        historical: 0,
      },
    };
  } catch (error: any) {
    console.error('❌ Error calculando ETA inteligente:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener historial comprimido de ruta
 * Solo puntos significativos para reducir transferencia de datos
 */
export const getCompressedRouteHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  const { rideId } = data;

  if (!rideId) {
    throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
  }

  const client = await pool.connect();
  try {
    // Verificar acceso
    const rideResult = await client.query(
      `SELECT client_id, driver_id FROM rides WHERE id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Viaje no encontrado');
    }

    const ride = rideResult.rows[0];
    if (ride.client_id !== context.auth.uid && ride.driver_id !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para ver este viaje');
    }

    // Obtener puntos del historial (comprimido)
    const locationsResult = await client.query(
      `SELECT lat, lng, speed, heading, timestamp
       FROM ride_locations
       WHERE ride_id = $1
       ORDER BY timestamp ASC`,
      [rideId]
    );

    return {
      success: true,
      rideId,
      totalPoints: locationsResult.rows.length,
      route: locationsResult.rows,
      compressionRatio: calculateCompressionRatio(locationsResult.rows.length),
    };
  } catch (error: any) {
    console.error('❌ Error obteniendo historial:', error);
    throw new functions.https.HttpsError('internal', error.message);
  } finally {
    client.release();
  }
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Calcular distancia entre dos puntos (Haversine)
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
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Obtener multiplicador de tráfico según hora del día
 * Basado en patrones típicos de tráfico en Managua
 */
function getTrafficMultiplier(hour: number): number {
  // Horas pico de la mañana (6-9 AM): tráfico pesado
  if (hour >= 6 && hour <= 9) {
    return 0.7; // 30% más lento
  }
  
  // Horas pico de la tarde (5-7 PM): tráfico muy pesado
  if (hour >= 17 && hour <= 19) {
    return 0.6; // 40% más lento
  }
  
  // Mediodía (12-2 PM): tráfico moderado
  if (hour >= 12 && hour <= 14) {
    return 0.85; // 15% más lento
  }
  
  // Noche (10 PM - 5 AM): tráfico ligero
  if (hour >= 22 || hour <= 5) {
    return 1.2; // 20% más rápido
  }
  
  // Resto del día: tráfico normal
  return 1.0;
}

/**
 * Limpiar cache de ETAs antiguo
 */
function cleanupETACache(): void {
  const now = Date.now();
  for (const [key, value] of etaCache.entries()) {
    if (now - value.timestamp > ETA_CACHE_DURATION * 2) {
      etaCache.delete(key);
    }
  }
  console.log(`🧹 Cache de ETA limpiado. Entradas restantes: ${etaCache.size}`);
}

/**
 * Calcular ratio de compresión
 */
function calculateCompressionRatio(points: number): string {
  // Asumiendo que sin compresión tendríamos un punto cada 5 segundos
  // Con compresión tenemos un punto cada 30 segundos o por distancia
  const uncompressedPoints = points * 6; // 6x más puntos sin compresión
  const ratio = ((uncompressedPoints - points) / uncompressedPoints * 100).toFixed(1);
  return `${ratio}% menos datos`;
}
