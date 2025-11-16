/**
 * Update Status API
 * Actualizar estado de disponibilidad del conductor
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DriverPenaltyRepository } from '../sequelize/repositories/DriverPenaltyRepository';
import { PaymentService } from '../sequelize/services/PaymentService';

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

    // ✅ Actualizado: Bloqueo si tiene 10 o más comisiones/penalizaciones pendientes en total
    try {
      const requested = String(status || '').toLowerCase();
      if (requested === 'available') {
        const penaltyRepo = new DriverPenaltyRepository();
        const paymentService = new PaymentService();

        const { total: totalPendingPenalties, commission: commissionPenalties } = await penaltyRepo.getPendingSummary(driverId);

        const excludeRideIds = new Set(
          commissionPenalties
            .map((penalty: any) => (penalty.ride_id ? String(penalty.ride_id) : null))
            .filter((rideId: string | null): rideId is string => Boolean(rideId))
        );

        const paymentSummary = await paymentService.getDriverPendingCommissionSummary(driverId, excludeRideIds);
        const paymentPendingCount = paymentSummary?.count || 0;

        const totalPending = totalPendingPenalties + paymentPendingCount;

        if (totalPending >= 10) {
          console.warn(`⛔ [updateStatus] Conductor ${driverId} con ${totalPending} comisiones/penalizaciones pendientes (umbral=10)`);
          throw new functions.https.HttpsError(
            'failed-precondition',
            'No puedes activar disponibilidad: tienes 10 o más comisiones o penalizaciones pendientes. Liquida las comisiones para continuar.'
          );
        }
      }
    } catch (checkErr) {
      if (checkErr instanceof functions.https.HttpsError) throw checkErr;
      console.warn('⚠️ [updateStatus] Error verificando penalizaciones:', (checkErr as any)?.message || checkErr);
    }

    // Determinar status final considerando rides activos
    let requestedStatus = String(status || 'offline').toLowerCase();
    let finalStatus = requestedStatus;
    try {
      const activeStatuses = new Set(['accepted', 'driver_on_route', 'in_progress']);
      const assignedSnap = await db.ref('activeRides').orderByChild('driverId').equalTo(driverId).once('value');
      const assigned = assignedSnap.val() || {};
      let hasActiveRide = false;
      for (const key of Object.keys(assigned)) {
        const s = String(assigned[key]?.status || '').toLowerCase();
        if (activeStatuses.has(s)) {
          hasActiveRide = true;
          break;
        }
      }
      if (hasActiveRide) {
        finalStatus = 'busy';
      }
    } catch (rideCheckErr) {
      console.warn('⚠️ [updateStatus] No se pudo verificar rides activos:', (rideCheckErr as any)?.message || rideCheckErr);
    }

    const locationUpdate: Record<string, any> = {
      status: finalStatus,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    };

    const infoUpdate: Record<string, any> = {
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

    // Actualizar en Realtime DB - driversInfo (solo metadata/timestamps)
    await db.ref(`driversInfo/${driverId}`).update(infoUpdate);

    // Actualizar en Realtime DB - driverLocations (estado de disponibilidad y ubicación)
    await db.ref(`driverLocations/${driverId}`).update(locationUpdate);

    return {
      success: true,
      message: 'Estado actualizado correctamente',
      status: finalStatus,
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

    // Obtener del Realtime DB - driverLocations (fuente de verdad para disponibilidad)
    const snapshot = await db.ref(`driverLocations/${driverId}`).once('value');
    const location = snapshot.val();

    if (!location) {
      return {
        success: true,
        status: 'offline',
        message: 'Conductor no encontrado',
      };
    }

    return {
      success: true,
      status: location?.status || 'offline',
      lastUpdate: location?.updatedAt || null,
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
      const snapshot = await db.ref(`driverLocations/${driverId}`).once('value');
      const location = snapshot.val();
      statuses[driverId] = {
        status: location?.status || 'offline',
        lastUpdate: location?.updatedAt || null,
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
