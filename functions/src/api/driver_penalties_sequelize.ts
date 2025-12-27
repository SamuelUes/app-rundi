/**
 * Driver Penalties API - Versión Sequelize
 * Gestión de penalizaciones de conductores
 */

import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import { DriverPenaltyRepository } from '../sequelize/repositories/DriverPenaltyRepository';
import { PaymentService } from '../sequelize/services/PaymentService';
import { MIGRATION_FLAGS } from '../config/migration-flags';
import { cleanupRideFromRealtime } from '../helpers/cleanupHelpers-new';

const penaltyRepo = new DriverPenaltyRepository();
const paymentService = new PaymentService();

type PenaltyCategory = 'commission' | 'cancellation' | 'other';

const normalizePenaltyType = (penaltyType: any): string => String(penaltyType || '').toLowerCase();

const COMMISSION_PENALTY_TYPES = new Set(['cash_commission_due']);
const CANCELLATION_KEYWORDS = ['cancellation', 'no_show', 'no-show'];

const classifyPenaltyType = (penaltyType: any): PenaltyCategory => {
  const normalized = normalizePenaltyType(penaltyType);
  if (!normalized) {
    return 'other';
  }
  if (COMMISSION_PENALTY_TYPES.has(normalized)) {
    return 'commission';
  }
  if (CANCELLATION_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'cancellation';
  }
  return 'other';
};

const sumPenaltyAmount = (items: any[]): number => {
  const total = items.reduce(
    (sum: number, penalty: any) => sum + parseFloat(String(penalty?.amount || 0)),
    0,
  );
  return Number(total.toFixed(2));
};

const mapPenaltyToCommissionDetail = (penalty: any) => {
  const rawAmount = parseFloat(String(penalty?.amount || 0)) || 0;
  const amount = Number(rawAmount.toFixed(2));
  return {
    id: penalty?.id,
    rideId: penalty?.ride_id || null,
    driverId: penalty?.driver_id || null,
    commission: amount,
    amount,
    tip: 0,
    total: amount,
    paymentMethod: 'cash',
    commissionRate: null,
    paidAt: penalty?.created_at || null,
    commissionPaidAt: null,
    commissionStatus: 'pending',
    status: 'pending',
    createdAt: penalty?.created_at || null,
    updatedAt: penalty?.updated_at || null,
  };
};
const updateRealtimeSummary = async (driverId: string) => {
  try {
    const pending = await penaltyRepo.findByDriverId(driverId);
    const list = Array.isArray(pending) ? pending : [];
    const pendingOnly = list.filter((p: any) => String(p.status).toLowerCase() === 'pending');

    const commissionPenalties = pendingOnly.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'commission',
    );
    const cancellationPenalties = pendingOnly.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'cancellation',
    );
    const otherPenalties = pendingOnly.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'other',
    );

    const penaltyRideIds = new Set(
      pendingOnly
        .map((p: any) => (p.ride_id ? String(p.ride_id) : null))
        .filter((rideId: string | null): rideId is string => Boolean(rideId))
    );

    let paymentsSummary: { count: number; amount: number; payments?: any[] } = { count: 0, amount: 0, payments: [] };
    try {
      const result = await paymentService.getDriverPendingCommissionSummary(driverId, penaltyRideIds);
      paymentsSummary = {
        count: result.count,
        amount: result.amount,
        payments: result.payments,
      };
    } catch (paymentsErr) {
      console.warn('⚠️ [driver_penalties] Error obteniendo comisiones de pagos pendientes:', paymentsErr);
    }

    const penaltyCommissionCount = commissionPenalties.length;
    const penaltyCommissionAmount = sumPenaltyAmount(commissionPenalties);

    const cancellationCount = cancellationPenalties.length + otherPenalties.length;
    const cancellationAmount = sumPenaltyAmount([...cancellationPenalties, ...otherPenalties]);

    const combinedPaymentCount = paymentsSummary.count + penaltyCommissionCount;
    const combinedPaymentAmount = Number((paymentsSummary.amount + penaltyCommissionAmount).toFixed(2));

    const totalCount = combinedPaymentCount + cancellationCount;
    const totalAmount = Number((combinedPaymentAmount + cancellationAmount).toFixed(2));

    // Skip RTDB mirror if migration flag is disabled
    if (!MIGRATION_FLAGS.MIRROR_PENALTIES_TO_RTDB) {
      return;
    }

    await admin.database().ref(`driverPenalties/${driverId}/summary`).update({
      pendingCount: totalCount,
      pendingAmount: Number(totalAmount.toFixed(2)),
      penaltyPendingCount: cancellationCount,
      penaltyPendingAmount: Number(cancellationAmount.toFixed(2)),
      paymentPendingCount: combinedPaymentCount,
      paymentPendingAmount: Number(combinedPaymentAmount.toFixed(2)),
      paymentCommissionPendingCount: penaltyCommissionCount,
      paymentCommissionPendingAmount: Number(penaltyCommissionAmount.toFixed(2)),
    });
  } catch (err) {
    console.warn('⚠️ [driver_penalties] Error actualizando summary en Realtime DB:', err);
  }
};

/**
 * Pagar TODAS las penalizaciones/comisiones pendientes del conductor
 * Método de pago: transferencia bancaria (registro simple en Realtime DB)
 */
export const payAllPenalties = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId: string = data?.driverId || context.auth.uid;
    const reference: string | undefined = data?.reference;
    const method: string = data?.method || 'bank_transfer';
    const cardId: string | undefined = data?.cardId;

    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    const penalties = await penaltyRepo.findByDriverId(driverId);
    const pendingPenalties = (penalties || []).filter((p: any) => String(p.status).toLowerCase() === 'pending');

    const commissionPenalties = pendingPenalties.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'commission',
    );
    const cancellationPenalties = pendingPenalties.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'cancellation',
    );
    const otherPenalties = pendingPenalties.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'other',
    );

    const penaltyRideIds = new Set(
      [...cancellationPenalties, ...otherPenalties]
        .map((p: any) => (p.ride_id ? String(p.ride_id) : null))
        .filter((rideId: string | null): rideId is string => Boolean(rideId))
    );

    let paymentSummary;
    try {
      paymentSummary = await paymentService.getDriverPendingCommissionSummary(driverId, penaltyRideIds);
    } catch (err) {
      console.warn('⚠️ [payAllPenalties] No se pudo obtener comisiones pendientes de pagos:', err);
      paymentSummary = { count: 0, amount: 0, payments: [] } as any;
    }

    const penaltyCommissionFallback = commissionPenalties.filter((penalty: any) => {
      const rideId = penalty?.ride_id ? String(penalty.ride_id) : null;
      if (!rideId) return true;
      return !paymentSummary?.payments?.some((payment: any) => String(payment.rideId || payment.ride_id || '') === rideId);
    });

    const penaltyCommissionFallbackAmount = sumPenaltyAmount(penaltyCommissionFallback);
    const penaltyCommissionCount = penaltyCommissionFallback.length;

    const penaltyCancellationsAmount = sumPenaltyAmount([...cancellationPenalties, ...otherPenalties]);
    const penaltyCancellationsCount = cancellationPenalties.length + otherPenalties.length;

    const paymentsTotal = Number(((paymentSummary?.amount || 0) + penaltyCommissionFallbackAmount).toFixed(2));
    const paymentsCount = (paymentSummary?.count || 0) + penaltyCommissionCount;

    if (pendingPenalties.length === 0 && (!paymentSummary || paymentsCount === 0)) {
      await updateRealtimeSummary(driverId);
      return { success: true, message: 'No hay comisiones pendientes', changed: 0, totalPaid: 0 };
    }

    const penaltiesTotal = Number((penaltyCancellationsAmount).toFixed(2));
    const total = penaltiesTotal + paymentsTotal;

    // Marcar todas como pagadas
    for (const p of pendingPenalties) {
      await penaltyRepo.update(p.id, { status: 'paid' } as any);
    }

    const paymentsPending = Array.isArray(paymentSummary?.payments) ? paymentSummary.payments : [];
    if (paymentsPending.length > 0) {
      const paymentIds = paymentsPending
        .map((payment: any) => String(payment.id || ''))
        .filter((id: string) => Boolean(id));

      if (paymentIds.length > 0) {
        try {
          await paymentService.markDriverCommissionPaymentsAsPaid(paymentIds);
        } catch (markErr) {
          console.warn('⚠️ [payAllPenalties] No se pudieron marcar comisiones de pagos como liquidadas:', markErr);
        }
      }
    }

    // Registrar pago en Realtime DB (histórico) - controlado por flag
    if (MIGRATION_FLAGS.LOG_DRIVER_COMMISSION_PAYMENTS_TO_RTDB) {
      try {
        const ref = admin.database().ref(`driverCommissionPayments/${driverId}`).push();
        await ref.set({
          amount: Number(total.toFixed(2)),
          method,
          reference: reference || null,
          cardId: cardId || null,
          penaltiesCount: pendingPenalties.length,
          paymentsCount: paymentsPending.length,
          createdAt: admin.database.ServerValue.TIMESTAMP,
          status: 'confirmed',
        });
      } catch (logErr) {
        console.warn('⚠️ [payAllPenalties] No se pudo registrar el pago en Realtime DB:', logErr);
      }
    }

    // Actualizar resumen
    await updateRealtimeSummary(driverId);

    // ✅ Nuevo: actualizar estados de paymentStatus en Realtime DB
    const rideIdsToUpdate = new Set<string>();

    pendingPenalties.forEach((penalty: any) => {
      const rideId = penalty?.ride_id ?? penalty?.rideId;
      if (rideId) {
        rideIdsToUpdate.add(String(rideId));
      }
    });

    paymentsPending.forEach((payment: any) => {
      const rideId = payment?.rideId ?? payment?.ride_id;
      if (rideId) {
        rideIdsToUpdate.add(String(rideId));
      }
    });

    if (rideIdsToUpdate.size > 0) {
      const db = admin.database();
      const timestamp = admin.database.ServerValue.TIMESTAMP;

      await Promise.all(
        Array.from(rideIdsToUpdate).map(async (rideId) => {
          try {
            const paymentRef = db.ref(`paymentStatus/${rideId}`);
            const snapshot = await paymentRef.once('value');
            const paymentData = snapshot.val();

            if (!paymentData) {
              return;
            }

            const status = String(paymentData.status || '').toLowerCase();
            if (['completed', 'canceled', 'refunded'].includes(status)) {
              return;
            }

            const driverMatches =
              !paymentData.driverId ||
              paymentData.driverId === driverId ||
              paymentData.driver_id === driverId;

            if (!driverMatches) {
              return;
            }

            const chargeTarget = paymentData.chargeTarget || paymentData.charge_target || '';
            const requiresDriverPayment = paymentData.requiresDriverPayment === true;
            const shouldCharge = paymentData.shouldCharge === true;
            const commissionDue = Number(paymentData.commissionDue || 0);

            const isDriverCharge =
              chargeTarget === 'driver' ||
              chargeTarget === 'driver_penalty' ||
              requiresDriverPayment ||
              shouldCharge;

            if (!isDriverCharge) {
              return;
            }

            await paymentRef.update({
              status: 'completed',
              commissionDue: commissionDue > 0 ? 0 : commissionDue,
              pendingAmount: 0,
              pendingBalance: 0,
              requiresClientPayment: false,
              requiresDriverPayment: false,
              shouldCharge: false,
              lastUpdatedAt: timestamp,
              updatedAt: timestamp,
              resolvedAt: timestamp,
              resolvedBy: 'system',
            });
          } catch (rtdbErr) {
            console.warn(`⚠️ [payAllPenalties] No se pudo actualizar paymentStatus/${rideId}:`, rtdbErr);
          }
        }),
      );

      await Promise.all(
        Array.from(rideIdsToUpdate).map(async (rideId) => {
          try {
            await cleanupRideFromRealtime(rideId, driverId, null, { skipPresenceCleanup: true });
          } catch (cleanupErr) {
            console.warn(`⚠️ [payAllPenalties] No se pudo limpiar nodos de viaje ${rideId}:`, cleanupErr);
          }
        }),
      );
    }

    return {
      success: true,
      driverId,
      changed: pendingPenalties.length + (paymentsPending.length || 0),
      totalPaid: Number(total.toFixed(2)),
      breakdown: {
        penaltiesPaid: penaltyCancellationsCount,
        penaltiesAmount: Number(penaltiesTotal.toFixed(2)),
        paymentCommissionsPaid: paymentsCount,
        paymentCommissionsAmount: Number(paymentsTotal.toFixed(2)),
      },
    };
  } catch (error: any) {
    console.error('❌ [payAllPenalties] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

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

    // ✅ Actualizar summary en Realtime DB
    await updateRealtimeSummary(driverId);

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

    // ✅ Actualizar summary en Realtime DB
    if (penalty?.driver_id) {
      await updateRealtimeSummary(penalty.driver_id);
    }

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

    // Obtener antes de borrar para conocer driverId
    const existing = await penaltyRepo.findById(penaltyId);
    const deleted = await penaltyRepo.delete(penaltyId);

    if (!deleted) {
      throw new functions.https.HttpsError('not-found', 'Penalización no encontrada');
    }

    // ✅ Actualizar summary en Realtime DB
    if (existing?.driver_id) {
      await updateRealtimeSummary(existing.driver_id);
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

/**
 * Obtener resumen de penalizaciones pendientes del conductor
 */
export const getDriverPenaltySummary = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  try {
    const driverId: string = data?.driverId || context.auth.uid;
    if (!driverId) {
      throw new functions.https.HttpsError('invalid-argument', 'driverId es requerido');
    }

    const penalties = await penaltyRepo.findByDriverId(driverId);
    const list = Array.isArray(penalties) ? penalties : [];
    const pendingOnly = list.filter((p: any) => String(p.status).toLowerCase() === 'pending');

    const commissionPenalties = pendingOnly.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'commission',
    );
    const cancellationPenalties = pendingOnly.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'cancellation',
    );
    const otherPenalties = pendingOnly.filter(
      (penalty: any) => classifyPenaltyType(penalty?.penalty_type) === 'other',
    );

    const penaltyRideIds = new Set(
      [...cancellationPenalties, ...otherPenalties]
        .map((p: any) => (p.ride_id ? String(p.ride_id) : null))
        .filter((rideId: string | null): rideId is string => Boolean(rideId))
    );

    let paymentSummary;
    try {
      paymentSummary = await paymentService.getDriverPendingCommissionSummary(driverId, penaltyRideIds);
    } catch (err) {
      console.warn('⚠️ [getDriverPenaltySummary] No se pudo obtener comisiones de pagos pendientes:', err);
      paymentSummary = { count: 0, amount: 0, payments: [] } as any;
    }

    const penaltyCommissionFallback = commissionPenalties.filter((penalty: any) => {
      const rideId = penalty?.ride_id ? String(penalty.ride_id) : null;
      if (!rideId) return true;
      return !paymentSummary?.payments?.some((payment: any) => String(payment.rideId || payment.ride_id || '') === rideId);
    });

    const penaltyCommissionFallbackAmount = sumPenaltyAmount(penaltyCommissionFallback);
    const penaltyCommissionCount = penaltyCommissionFallback.length;

    const penaltyCancellationsAmount = sumPenaltyAmount([...cancellationPenalties, ...otherPenalties]);
    const penaltyCancellationsCount = cancellationPenalties.length + otherPenalties.length;

    const paymentAmount = Number(((paymentSummary?.amount || 0) + penaltyCommissionFallbackAmount).toFixed(2));
    const paymentCount = (paymentSummary?.count || 0) + penaltyCommissionCount;

    const paymentDetailsFromPayments = Array.isArray(paymentSummary?.payments) ? paymentSummary.payments : [];
    const fallbackDetails = penaltyCommissionFallback.map(mapPenaltyToCommissionDetail);
    const paymentDetails = [...paymentDetailsFromPayments, ...fallbackDetails];

    const combinedPendingCount = paymentCount + penaltyCancellationsCount;
    const combinedPendingAmount = Number((paymentAmount + penaltyCancellationsAmount).toFixed(2));

    if (MIGRATION_FLAGS.MIRROR_PENALTIES_TO_RTDB) {
      try {
        await updateRealtimeSummary(driverId);
      } catch (err) {
        console.warn('⚠️ [getDriverPenaltySummary] No se pudo actualizar resumen en Realtime DB:', err);
      }
    }

    return {
      success: true,
      driverId,
      pendingCount: combinedPendingCount,
      pendingAmount: combinedPendingAmount,
      penalties: {
        count: penaltyCancellationsCount,
        amount: Number(penaltyCancellationsAmount.toFixed(2)),
      },
      payments: {
        count: paymentCount,
        amount: Number(paymentAmount.toFixed(2)),
      },
      paymentDetails,
    };
  } catch (error: any) {
    console.error('❌ [getDriverPenaltySummary] Error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
