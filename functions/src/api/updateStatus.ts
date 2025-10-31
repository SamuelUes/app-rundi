/**
 * Update Status API
 * Actualizar estado de disponibilidad del conductor
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.database();

/**
 * Actualizar estado de disponibilidad del conductor
 */
export const updateStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const {
      status,
      latitude,
      longitude,
      heading,
      speed,
      accuracy,
    } = data || {};
    const driverId = context.auth.uid;

    console.log(`📍 [updateStatus] Actualizando estado del conductor: ${driverId} -> ${status}`);

    const locationUpdate: Record<string, any> = {
      status: status || 'offline',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    const infoUpdate: Record<string, any> = {
      status: status || 'offline',
      lastUpdate: admin.database.ServerValue.TIMESTAMP,
    };

    if (typeof latitude === 'number' && typeof longitude === 'number') {
      locationUpdate.lat = latitude;
      locationUpdate.lng = longitude;
      infoUpdate.lat = latitude;
      infoUpdate.lng = longitude;
    }

    if (typeof heading === 'number') {
      locationUpdate.heading = heading;
    }

    if (typeof speed === 'number') {
      locationUpdate.speed = speed;
    }

    if (typeof accuracy === 'number') {
      locationUpdate.accuracy = accuracy;
    }

    // Actualizar en Realtime DB - driversInfo (estado del conductor)
    await db.ref(`driversInfo/${driverId}`).update(infoUpdate);

    // Actualizar en Realtime DB - driverLocations (ubicación en tiempo real)
    await db.ref(`driverLocations/${driverId}`).update(locationUpdate);

    return {
      success: true,
      message: 'Estado actualizado correctamente',
      status: status || 'offline',
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('❌ [updateStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener estado actual del conductor
 */
export const getDriverStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId = context.auth.uid;

    console.log(`📍 [getDriverStatus] Obteniendo estado del conductor: ${driverId}`);

    // Obtener del Realtime DB - driversInfo
    const snapshot = await db.ref(`driversInfo/${driverId}`).once('value');
    const driverInfo = snapshot.val();

    if (!driverInfo) {
      return {
        success: true,
        status: 'offline',
        message: 'Conductor no encontrado',
      };
    }

    return {
      success: true,
      status: driverInfo.status || 'offline',
      lastUpdate: driverInfo.lastUpdate,
    };
  } catch (error: any) {
    console.error('❌ [getDriverStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener estado de múltiples conductores
 */
export const getDriversStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverIds } = data;

    if (!driverIds || !Array.isArray(driverIds)) {
      throw new functions.https.HttpsError('invalid-argument', 'driverIds debe ser un array');
    }

    console.log(`📍 [getDriversStatus] Obteniendo estado de ${driverIds.length} conductores`);

    const statuses: any = {};

    for (const driverId of driverIds) {
      const snapshot = await db.ref(`driversInfo/${driverId}`).once('value');
      const driverInfo = snapshot.val();
      statuses[driverId] = {
        status: driverInfo?.status || 'offline',
        lastUpdate: driverInfo?.lastUpdate || null,
      };
    }

    return {
      success: true,
      statuses,
    };
  } catch (error: any) {
    console.error('❌ [getDriversStatus] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
