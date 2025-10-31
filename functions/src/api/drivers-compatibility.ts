/**
 * Drivers Compatibility API
 * Funciones para compatibilidad con el Frontend
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

/**
 * Actualizar ubicación del conductor
 */
export const updateDriverLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;
    const { latitude, longitude, heading, speed, accuracy } = data;

    console.log(`📍 [updateDriverLocation] Actualizando ubicación del conductor: ${driverId}`);

    // Actualizar en Realtime DB - driverLocations
    await db.ref(`driverLocations/${driverId}`).update({
      status: 'online',
      lastSeen: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Actualizar en Realtime DB - driversInfo
    await db.ref(`driversInfo/${driverId}`).update({
      lat: latitude,
      lng: longitude,
      heading: heading || 0,
      speed: speed || 0,
      accuracy: accuracy || 0,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ [updateDriverLocation] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener conductores disponibles en un área
 */
export const getAvailableDrivers = functions.https.onCall(async (data, context) => {
  try {
    const { latitude, longitude, radius = 15, vehicleType } = data;

    console.log(`🚗 [getAvailableDrivers] Buscando conductores disponibles en: ${latitude}, ${longitude}, vehicleType: ${vehicleType}`);

    // Obtener conductores disponibles de Realtime DB - driversInfo
    const driversSnapshot = await db.ref('driversInfo').once('value');
    const driversInfo = driversSnapshot.val() || {};

    console.log(`📊 [getAvailableDrivers] Total de conductores en driversInfo: ${Object.keys(driversInfo).length}`);

    const availableDrivers = [];

    for (const [driverId, driverData] of Object.entries(driversInfo)) {
      const driver = driverData as any;

      console.log(`🔍 [getAvailableDrivers] Verificando conductor ${driverId}: status=${driver.status}, type=${driver.vehicle?.type}`);

      // Verificar si está disponible (status debe ser 'available')
      if (driver.status !== 'available') {
        console.log(`  ⏭️ Saltando: status no es 'available' (es: ${driver.status})`);
        continue;
      }

      // Verificar si tiene ubicación
      if (!driver.lat || !driver.lng) {
        console.log(`  ⏭️ Saltando: sin ubicación`);
        continue;
      }

      // Calcular distancia
      const distance = calculateDistance(
        latitude,
        longitude,
        driver.lat,
        driver.lng
      );

      console.log(`  📍 Distancia: ${distance.toFixed(2)}km (radio: ${radius}km)`);

      // Filtrar por radio
      if (distance > radius) {
        console.log(`  ⏭️ Saltando: fuera del radio`);
        continue;
      }

      // Filtrar por tipo de vehículo si se especifica
      // "auto" es un tipo genérico que incluye sedan, suv, etc.
      if (vehicleType && vehicleType !== 'auto') {
        if (driver.vehicle?.type !== vehicleType) {
          console.log(`  ⏭️ Saltando: tipo de vehículo no coincide (buscando: ${vehicleType}, tiene: ${driver.vehicle?.type})`);
          continue;
        }
      }

      console.log(`  ✅ Conductor disponible agregado`);

      availableDrivers.push({
        id: driverId,
        name: driver.fullName || 'Conductor',
        rating: parseFloat(driver.averageRating) || 0,
        latitude: driver.lat,
        longitude: driver.lng,
        distance,
        vehicle: driver.vehicle || {},
        isAvailable: true,
        lastUpdate: driver.lastUpdate,
      });
    }

    // Ordenar por distancia
    availableDrivers.sort((a, b) => a.distance - b.distance);

    console.log(`✅ [getAvailableDrivers] Encontrados ${availableDrivers.length} conductores`);

    return {
      success: true,
      available: availableDrivers.length > 0,
      count: availableDrivers.length,
      drivers: availableDrivers,
    };
  } catch (error: any) {
    console.error('❌ [getAvailableDrivers] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener perfil del conductor
 */
export const getDriverProfile = functions.https.onCall(async (data, context) => {
  try {
    const { driverId } = data;

    console.log(`👤 [getDriverProfile] Obteniendo perfil del conductor: ${driverId}`);

    // Obtener datos de Realtime DB - driversInfo
    const snapshot = await db.ref(`driversInfo/${driverId}`).once('value');
    const driverInfo = snapshot.val();

    if (!driverInfo) {
      console.warn(`⚠️ [getDriverProfile] Conductor no encontrado en driversInfo: ${driverId}`);
      throw new functions.https.HttpsError('not-found', 'Conductor no encontrado');
    }

    // Obtener stats de Realtime DB - drivers
    const statsSnapshot = await db.ref(`drivers/${driverId}/stats`).once('value');
    const stats = statsSnapshot.val() || {};

    return {
      success: true,
      driver: {
        id: driverId,
        fullName: driverInfo.fullName,
        phone: driverInfo.phone,
        status: driverInfo.status,
        averageRating: parseFloat(driverInfo.averageRating) || 0,
        vehicle: driverInfo.vehicle || {},
        lat: driverInfo.lat,
        lng: driverInfo.lng,
        lastUpdate: driverInfo.lastUpdate,
        // Stats
        total_rides: stats.totalRides || 0,
        total_earnings: stats.totalEarnings || 0,
        average_rating: parseFloat(driverInfo.averageRating) || 0,
      },
    };
  } catch (error: any) {
    console.error('❌ [getDriverProfile] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar modo conductor designado
 */
export const updateDesignatedDriverMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, isActive } = data;
    const currentUserId = context.auth.uid;

    // Verificar que sea el mismo conductor o admin
    if (driverId !== currentUserId) {
      throw new functions.https.HttpsError('permission-denied', 'No tienes permiso para actualizar este conductor');
    }

    console.log(`🚗 [updateDesignatedDriverMode] Actualizando modo conductor designado: ${driverId} -> ${isActive}`);

    // Actualizar en Realtime DB - driversInfo
    await db.ref(`driversInfo/${driverId}`).update({
      isDesignatedDriverMode: isActive,
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ [updateDesignatedDriverMode] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Actualizar información del conductor
 */
export const updateDriver = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;
    const {
      license_photo_front,
      license_photo_back,
      license_number,
      license_expiry,
      profile_photo,
    } = data;

    console.log(`👤 [updateDriver] Actualizando información del conductor: ${driverId}`);

    // Actualizar en Realtime DB - driversInfo
    const updateData: any = {};
    
    if (license_photo_front) updateData.license_photo_front = license_photo_front;
    if (license_photo_back) updateData.license_photo_back = license_photo_back;
    if (license_number) updateData.license_number = license_number;
    if (license_expiry) updateData.license_expiry = license_expiry;
    if (profile_photo) updateData.profile_photo = profile_photo;

    updateData.lastUpdate = admin.database.ServerValue.TIMESTAMP;

    await db.ref(`driversInfo/${driverId}`).update(updateData);

    return {
      success: true,
      driver: {
        id: driverId,
        ...updateData,
      },
    };
  } catch (error: any) {
    console.error('❌ [updateDriver] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Solicitar acceso a Conductor Designado
 */
export const requestDesignatedDriverAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;

    console.log(`🚙 [requestDesignatedDriverAccess] Solicitando acceso para conductor: ${driverId}`);

    // Guardar solicitud en Realtime DB
    await db.ref(`designatedDriverRequests/${driverId}`).set({
      driverId,
      status: 'pending',
      requestedAt: admin.database.ServerValue.TIMESTAMP,
      approvedAt: null,
      rejectedAt: null,
    });

    return {
      success: true,
      message: 'Solicitud enviada exitosamente',
      status: 'pending',
    };
  } catch (error: any) {
    console.error('❌ [requestDesignatedDriverAccess] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener estado de solicitud de Conductor Designado
 */
export const getDesignatedDriverRequestStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;

    console.log(`📋 [getDesignatedDriverRequestStatus] Obteniendo estado para conductor: ${driverId}`);

    const snapshot = await db.ref(`designatedDriverRequests/${driverId}`).once('value');
    const requestData = snapshot.val();

    if (!requestData) {
      return {
        success: true,
        status: 'not_requested',
        message: 'No hay solicitud previa',
      };
    }

    return {
      success: true,
      status: requestData.status || 'unknown',
      requestedAt: requestData.requestedAt,
      approvedAt: requestData.approvedAt,
      rejectedAt: requestData.rejectedAt,
      message: requestData.rejectionReason || null,
    };
  } catch (error: any) {
    console.error('❌ [getDesignatedDriverRequestStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Calcular distancia entre dos puntos (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
