/**
 * Service Commission History API - Versión Sequelize
 * Gestión del historial de comisiones
 */

import * as functions from 'firebase-functions';
import { ServiceCommissionHistoryRepository } from '../sequelize/repositories/ServiceCommissionHistoryRepository';

const historyRepo = new ServiceCommissionHistoryRepository();

/**
 * Registrar cambio de comisión
 */
export const recordCommissionChange = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { serviceId, oldRate, newRate } = data;

    if (!serviceId || oldRate === undefined || newRate === undefined) {
      throw new functions.https.HttpsError('invalid-argument', 'serviceId, oldRate y newRate son requeridos');
    }

    console.log(`📊 [recordCommissionChange] Registrando cambio de comisión para servicio: ${serviceId}`);

    const history = await historyRepo.create({
      service_id: serviceId,
      old_commission_rate: oldRate,
      new_commission_rate: newRate,
    });

    return {
      success: true,
      history: {
        id: history.id,
        serviceId: history.service_id,
        oldRate: parseFloat(history.old_commission_rate.toString()),
        newRate: parseFloat(history.new_commission_rate.toString()),
        changedAt: history.changed_at,
      },
    };
  } catch (error: any) {
    console.error('❌ [recordCommissionChange] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener historial de comisiones de un servicio
 */
export const getServiceCommissionHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { serviceId } = data;

    if (!serviceId) {
      throw new functions.https.HttpsError('invalid-argument', 'serviceId es requerido');
    }

    console.log(`📊 [getServiceCommissionHistory] Obteniendo historial del servicio: ${serviceId}`);

    const history = await historyRepo.findByServiceId(serviceId);

    return {
      success: true,
      count: history.length,
      history: history.map((h: any) => ({
        id: h.id,
        oldRate: parseFloat(h.old_commission_rate.toString()),
        newRate: parseFloat(h.new_commission_rate.toString()),
        changedAt: h.changed_at,
      })),
    };
  } catch (error: any) {
    console.error('❌ [getServiceCommissionHistory] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Obtener última tasa de comisión de un servicio
 */
export const getLatestCommissionRate = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const { serviceId } = data;

    if (!serviceId) {
      throw new functions.https.HttpsError('invalid-argument', 'serviceId es requerido');
    }

    console.log(`📊 [getLatestCommissionRate] Obteniendo última tasa del servicio: ${serviceId}`);

    const rate = await historyRepo.getLatestRate(serviceId);

    if (rate === null) {
      throw new functions.https.HttpsError('not-found', 'No hay historial para este servicio');
    }

    return {
      success: true,
      rate: rate,
    };
  } catch (error: any) {
    console.error('❌ [getLatestCommissionRate] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
