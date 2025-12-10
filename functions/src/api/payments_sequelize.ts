/**
 * Payments API - Versión Sequelize
 * Solo pagos en efectivo y con bancos locales
 * 
 * Funciones:
 * - registerCashPayment: Registrar pago en efectivo
 * - completeCashPayment: Completar pago en efectivo
 * - cancelCashPayment: Cancelar pago en efectivo
 */
import * as functions from 'firebase-functions';
import { PaymentService } from '../sequelize/services/PaymentService';
import { DriverPenaltyRepository } from '../sequelize/repositories/DriverPenaltyRepository';
import admin from 'firebase-admin';
import { MIGRATION_FLAGS } from '../config/migration-flags';

const paymentService = new PaymentService();

// ============================================
// Single-session enforcement (DENY policy)
// ============================================
const SESSION_ACTIVE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

const isRecent = (lastSeen: any): boolean => {
  if (typeof lastSeen === 'number') {
    const diff = Date.now() - lastSeen;
    return diff >= 0 && diff <= SESSION_ACTIVE_THRESHOLD_MS;
  }
  return true;
};

const ensureActiveSession = async (
  context: functions.https.CallableContext,
  data: any,
) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }
  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId.trim() : '';
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'deviceId requerido');
  }
  const sessionSnap = await admin.database().ref(`sessions/${uid}`).once('value');
  const session = sessionSnap.val();
  if (session && session.deviceId && session.deviceId !== deviceId && isRecent(session.lastSeen)) {
    throw new functions.https.HttpsError('failed-precondition', 'SESSION_ACTIVE_ELSEWHERE');
  }
};

/**
 * Registrar pago en efectivo
 */
export const registerCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  // Enforce single-session (deny)
  await ensureActiveSession(context, data);
  try {
    const { rideId, tip = 0 } = data;

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }
    const payment = await paymentService.registerCashPayment(rideId, tip);

    const admin = require('firebase-admin');
    const db = admin.database();

    const rideSnapshot = await db.ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val() || {};

    const rawDriverId =
      rideData.driverId ||
      rideData.driver_id ||
      (rideData.driver && (rideData.driver.id || rideData.driver.uid)) ||
      null;
    const rawClientId =
      rideData.clientId ||
      rideData.client_id ||
      rideData.userId ||
      rideData.user_id ||
      (rideData.client && (rideData.client.id || rideData.client.uid)) ||
      null;

    const driverId = rawDriverId != null ? String(rawDriverId).trim() : null;
    const clientId = rawClientId != null ? String(rawClientId).trim() : null;

    await db.ref(`paymentStatus/${rideId}`).update({
      rideId,
      status: 'pending_confirmation',
      method: 'cash',
      provider: 'cash',
      amount: Number(payment.amount || 0),
      tip: tip,
      total: Number(payment.amount || 0) + Number(tip || 0),
      driverId,
      clientId,
      requiresClientPayment: true,
      chargeTarget: 'client',
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    return {
      success: true,
      payment: {
        id: payment.id,
        amount: payment.amount,
        tip: payment.tip,
        total: payment.amount + payment.tip,
        method: 'cash',
      },
    };
  } catch (error: any) {
    console.error("❌ Error registrando pago en efectivo:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Confirmar pago en efectivo (cliente confirma que pagó)
 * ✅ NUEVO: Permite al cliente confirmar su parte del pago
 */
export const confirmCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  // Enforce single-session (deny)
  await ensureActiveSession(context, data);

  try {
    const { rideId, confirmedBy, authenticationMethod, biometricType } = data;

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }

    const admin = require('firebase-admin');
    const db = admin.database();

    const authMethod = typeof authenticationMethod === 'string' ? String(authenticationMethod) : undefined;
    const bioType = typeof biometricType === 'string' ? String(biometricType) : undefined;
    
    // Obtener estado actual del pago
    const paymentSnapshot = await db.ref(`paymentStatus/${rideId}`).once('value');
    const paymentData = paymentSnapshot.val();

    if (!paymentData) {
      throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
    }

    // ✅ NUEVO: Detectar quién confirma (cliente o conductor)
    if (confirmedBy === 'driver') {
      console.log(`💳 [confirmCashPayment] Conductor confirmando pago para rideId: ${rideId}`);
      
      // Marcar que el conductor confirmó
      const driverUpdatePayload: any = {
        confirmedByDriver: true,
        driverConfirmedAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      if (authMethod === 'biometric') {
        driverUpdatePayload.authentication_method = 'biometric';
        driverUpdatePayload.biometric_authenticated = true;
        if (bioType) {
          driverUpdatePayload.biometric_type = bioType;
        }
      }

      await db.ref(`paymentStatus/${rideId}`).update(driverUpdatePayload);

      console.log(`✅ [confirmCashPayment] Pago confirmado por conductor`);
      
      // ✅ NUEVO: Si el cliente ya confirmó, completar el pago automáticamente
      const clientAlreadyConfirmed = paymentData.confirmedByClient === true;
      if (clientAlreadyConfirmed) {
        console.log(`✅ [confirmCashPayment] Cliente ya había confirmado, completando pago automáticamente...`);
        
        // Completar pago en Supabase
        try {
          const { PaymentService } = await import('../sequelize/services/PaymentService');
          const paymentService = new PaymentService();
          await paymentService.completeCashPayment(rideId);
        } catch (err: any) {
          console.warn(`⚠️ [confirmCashPayment] Error completando pago en Supabase:`, err.message);
        }
        
        // Actualizar paymentStatus a 'completed'
        await db.ref(`paymentStatus/${rideId}`).update({
          status: 'completed',
          confirmedAt: admin.database.ServerValue.TIMESTAMP,
          lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        
        console.log(`✅ [confirmCashPayment] Pago completado automáticamente`);
      }
      
      return {
        success: true,
        message: "Pago confirmado por conductor",
        bothConfirmed: clientAlreadyConfirmed,
        paymentCompleted: clientAlreadyConfirmed,
      };
    } else {
      console.log(`💳 [confirmCashPayment] Cliente confirmando pago para rideId: ${rideId}`);

      // Marcar que el cliente confirmó
      const clientUpdatePayload: any = {
        confirmedByClient: true,
        clientConfirmedAt: admin.database.ServerValue.TIMESTAMP,
        lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
      };

      if (authMethod === 'biometric') {
        clientUpdatePayload.authentication_method = 'biometric';
        clientUpdatePayload.biometric_authenticated = true;
        if (bioType) {
          clientUpdatePayload.biometric_type = bioType;
        }
      }

      await db.ref(`paymentStatus/${rideId}`).update(clientUpdatePayload);

      // Actualizar estado del viaje a 'completed' en activeRides
      console.log(`🔄 [confirmCashPayment] Actualizando estado del viaje a 'completed'`);
      const currentRide = await db.ref(`activeRides/${rideId}`).once('value');
      const rideData = currentRide.val() || {};

      await db.ref(`activeRides/${rideId}`).update({
        status: 'completed',
        finalFare: rideData.finalFare ?? paymentData.amount ?? rideData.estimatedPrice ?? 0,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      console.log(`✅ [confirmCashPayment] Pago confirmado por cliente`);
      
      // ✅ ACTUALIZADO: Si el conductor ya confirmó, completar el pago automáticamente
      const driverAlreadyConfirmed = paymentData.confirmedByDriver === true;
      if (driverAlreadyConfirmed) {
        console.log(`✅ [confirmCashPayment] Conductor ya había confirmado, completando pago automáticamente...`);
        
        // Completar pago en Supabase
        try {
          const { PaymentService } = await import('../sequelize/services/PaymentService');
          const paymentService = new PaymentService();
          await paymentService.completeCashPayment(rideId);
        } catch (err: any) {
          console.warn(`⚠️ [confirmCashPayment] Error completando pago en Supabase:`, err.message);
        }
        
        // ✅ ACTUALIZADO: Cambiar a 'payment_completed' (no 'completed')
        // El viaje solo pasa a 'completed' después del rating
        await db.ref(`paymentStatus/${rideId}`).update({
          status: 'payment_completed',
          confirmedAt: admin.database.ServerValue.TIMESTAMP,
          lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        
        // ✅ ACTUALIZADO: Cambiar estado del viaje a 'pending_rating'
        // NO eliminar de activeRides aún
        await db.ref(`activeRides/${rideId}`).update({
          status: 'pending_rating',
          finalFare: rideData.finalFare ?? paymentData.amount ?? rideData.estimatedPrice ?? 0,
          paymentCompletedAt: admin.database.ServerValue.TIMESTAMP,
          updatedAt: admin.database.ServerValue.TIMESTAMP,
        });
        
        console.log(`✅ [confirmCashPayment] Pago completado, viaje en estado pending_rating`);
      }

      return {
        success: true,
        message: "Pago confirmado por cliente",
        status: "pending_rating",
        bothConfirmed: driverAlreadyConfirmed,
        paymentCompleted: driverAlreadyConfirmed,
      };
    }
  } catch (error: any) {
    console.error("❌ [confirmCashPayment] Error confirmando pago:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

/**
 * Completar pago en efectivo (conductor confirma que recibió el dinero)
 */
export const completeCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  // Enforce single-session (deny)
  await ensureActiveSession(context, data);

  try {
    const { rideId } = data;

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }

    console.log(`💵 [completeCashPayment] Procesando pago para rideId: ${rideId}`);

    const admin = require('firebase-admin');
    const paymentSnapshot = await admin.database().ref(`paymentStatus/${rideId}`).once('value');
    const paymentData = paymentSnapshot.val();

    if (!paymentData) {
      throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
    }

    // VALIDACIÓN: Verificar que AMBOS (cliente Y conductor) hayan confirmado
    const clientConfirmed = paymentData.confirmedByClient === true;
    const driverConfirmed = paymentData.confirmedByDriver === true;

    console.log(`🔍 [completeCashPayment] Validando confirmaciones - Cliente: ${clientConfirmed}, Conductor: ${driverConfirmed}`);

    if (!clientConfirmed || !driverConfirmed) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Ambos deben confirmar. Cliente: ${clientConfirmed}, Conductor: ${driverConfirmed}`
      );
    }

    console.log(`✅ [completeCashPayment] Ambos confirmaron el pago`);

    // Completar pago en Sequelize
    const payment = await paymentService.completeCashPayment(rideId);

    // Actualizar paymentStatus a 'completed' en Firebase
    console.log(`🔄 [completeCashPayment] Actualizando paymentStatus.status a 'completed'...`);
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'completed',
      finalAmount: Number(payment.amount || 0),
      amount: Number(payment.amount || 0),
      confirmedAt: admin.database.ServerValue.TIMESTAMP,
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Actualizar activeRides con finalFare consolidado
    const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
    const rideData = rideSnapshot.val() || {};

    await admin.database().ref(`activeRides/${rideId}`).update({
      finalFare: payment.amount ?? rideData.finalFare ?? rideData.estimatedPrice ?? 0,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    console.log(`✅ [completeCashPayment] paymentStatus actualizado a 'completed'`);

    return {
      success: true,
      bothConfirmed: true,
      message: "Pago completado exitosamente.",
      status: "pending_rating",
      payment: {
        id: payment.id,
        amount: payment.amount,
        status: payment.status,
      },
    };
  } catch (error: any) {
    console.error("❌ [completeCashPayment] Error completando pago:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
/**
 * Cancelar pago en efectivo (conductor reporta problema)
 */
export const cancelCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  // Enforce single-session (deny)
  await ensureActiveSession(context, data);

  try {
    const { rideId, reason } = data;

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }

    console.log(`❌ [cancelCashPayment] Cancelando pago para viaje ${rideId}: ${reason}`);

    // Obtener datos del viaje
    const admin = require('firebase-admin');
    const rideSnapshot = await admin.database().ref(`activeRides/${rideId}`).once('value');
    let ride = rideSnapshot.val();

    if (!ride) {
      console.warn(`⚠️ [cancelCashPayment] Viaje ${rideId} no encontrado en activeRides`);
      const completedSnapshot = await admin.database().ref(`completedRides/${rideId}`).once('value');
      const completedRide = completedSnapshot.val();

      if (!completedRide) {
        throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
      }

      ride = completedRide;
    }

    // Cancelar pago en Sequelize
    await paymentService.cancelPayment(rideId, reason);

    // Actualizar Realtime DB
    console.log(`📝 [cancelCashPayment] Actualizando paymentStatus en Realtime DB`);
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'canceled',
      cancelReason: reason,
      canceledAt: admin.database.ServerValue.TIMESTAMP,
      canceledBy: 'driver',
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // ✅ NUEVO: Si el conductor había confirmado, crear penalización por comisión
    try {
      const paymentSnapshot = await admin.database().ref(`paymentStatus/${rideId}`).once('value');
      const paymentData = paymentSnapshot.val();
      const driverConfirmed = paymentData?.confirmedByDriver === true;
      if (driverConfirmed) {
        const rideData = ride || (await admin.database().ref(`completedRides/${rideId}`).once('value')).val() || {};
        const driverId = rideData?.driverId || rideData?.driver_id || null;
        if (driverId) {
          // Obtener pago existente para conocer comisión calculada
          const existingPayment = await paymentService.getPaymentByRide(rideId);
          const commission = Number(existingPayment?.commission || 0);
          if (commission > 0) {
            const penaltyRepo = new DriverPenaltyRepository();
            const existingPenalty = await penaltyRepo.findByRideId(rideId);
            if (!existingPenalty) {
              await penaltyRepo.create({
                driver_id: driverId,
                ride_id: rideId,
                penalty_type: 'commission_cash_ride',
                amount: commission,
                reason: reason || 'Comisión por viaje cancelado sin confirmación de cliente',
                status: 'pending',
                created_at: new Date(),
              } as any);
            }
            // Actualizar resumen en Realtime DB (salteable por flag de migración)
            if (MIGRATION_FLAGS.MIRROR_PENALTIES_TO_RTDB) {
              try {
                const all = await penaltyRepo.findByDriverId(driverId);
                const pendingOnly = (all || []).filter((p: any) => String(p.status).toLowerCase() === 'pending');
                const pendingCount = pendingOnly.length;
                const pendingAmount = pendingOnly.reduce((sum: number, p: any) => sum + parseFloat(String(p.amount || 0)), 0);
                await admin.database().ref(`driverPenalties/${driverId}/summary`).update({
                  pendingCount,
                  pendingAmount: Number(pendingAmount.toFixed(2)),
                  lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
                });
              } catch (sumErr) {
                console.warn('⚠️ [cancelCashPayment] Error actualizando summary de penalizaciones:', sumErr);
              }
            }
          }
        }
      }
    } catch (penErr) {
      console.warn('⚠️ [cancelCashPayment] Error creando penalización por cancelación:', penErr);
    }

    return {
      success: true,
      message: 'Pago cancelado exitosamente',
      rideId,
      reason,
    };
  } catch (error: any) {
    console.error("❌ [cancelCashPayment] Error cancelando pago:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
