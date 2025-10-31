/**
 * Driver Penalties API - Versión Sequelize
 * Gestión de penalizaciones de conductores
 */

import * as functions from 'firebase-functions';
import { DriverPenaltyRepository } from '../sequelize/repositories/DriverPenaltyRepository';

const penaltyRepo = new DriverPenaltyRepository();

/**
 * Crear penalización
 */
export const createPenalty = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId, rideId, penaltyType, amount, reason } = data;

    if (!driverId || !penaltyType || !amount) {
      throw new functions.https.HttpsError('invalid-argument', 'Parámetros requeridos faltantes');
    }

    console.log(`⚠️ [createPenalty] Creando penalización para conductor: ${driverId}`);

    const penalty = await penaltyRepo.create({
      driver_id: driverId,
      ride_id: rideId || null,
      penalty_type: penaltyType,
      amount,
      reason: reason || null,
      status: 'pending',
    });

    return {
      success: true,
      penalty: {
        id: penalty.id,
        driverId: penalty.driver_id,
        rideId: penalty.ride_id,
        penaltyType: penalty.penalty_type,
        amount: penalty.amount,
        reason: penalty.reason,
        status: penalty.status,
        createdAt: penalty.created_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [createPenalty] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener penalizaciones de un conductor
 */
export const getDriverPenalties = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`⚠️ [getDriverPenalties] Obteniendo penalizaciones del conductor: ${driverId}`);

    const penalties = await penaltyRepo.findByDriverId(driverId);

    return {
      success: true,
      count: penalties.length,
      penalties: penalties.map((p: any) => ({
        id: p.id,
        driverId: p.driver_id,
        rideId: p.ride_id,
        penaltyType: p.penalty_type,
        amount: p.amount,
        reason: p.reason,
        status: p.status,
        createdAt: p.created_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getDriverPenalties] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener total de penalizaciones pendientes
 */
export const getTotalPenalties = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { driverId } = data;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    console.log(`💰 [getTotalPenalties] Calculando total de penalizaciones: ${driverId}`);

    const total = await penaltyRepo.getTotalPenalties(driverId);

    return {
      success: true,
      driverId,
      totalPenalties: total,
    };
  } catch (error: any) {
    console.error('❌ [getTotalPenalties] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Marcar penalización como pagada
 */
export const markPenaltyAsPaid = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { penaltyId } = data;

    if (!penaltyId) {
      throw new functions.https.HttpsError('invalid-argument', 'penaltyId es requerido');
    }

    console.log(`✅ [markPenaltyAsPaid] Marcando penalización como pagada: ${penaltyId}`);

    const penalty = await penaltyRepo.update(penaltyId, { status: 'paid' });

    return {
      success: true,
      penalty: {
        id: penalty.id,
        status: penalty.status,
      },
    };
  } catch (error: any) {
    console.error('❌ [markPenaltyAsPaid] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Eliminar penalización
 */
export const deletePenalty = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { penaltyId } = data;

    if (!penaltyId) {
      throw new functions.https.HttpsError('invalid-argument', 'penaltyId es requerido');
    }

    console.log(`🗑️ [deletePenalty] Eliminando penalización: ${penaltyId}`);

    const deleted = await penaltyRepo.delete(penaltyId);

    if (!deleted) {
      throw new functions.https.HttpsError('not-found', 'Penalización no encontrada');
    }

    return {
      success: true,
      message: 'Penalización eliminada correctamente',
    };
  } catch (error: any) {
    console.error('❌ [deletePenalty] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
