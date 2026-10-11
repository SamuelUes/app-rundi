/**
 * Payments API - Versión Sequelize
 * Solo pagos en efectivo y con bancos locales
 * 
 * Funciones:
 * - registerCashPayment: Registrar pago en efectivo
 * - completeCashPayment: Completar pago en efectivo
 * - cancelCashPayment: Cancelar pago en efectivo
 */
import * as functions from 'firebase-functions/v1';
import { PaymentService } from '../sequelize/services/PaymentService';
import { BiometricAuthenticationRepository } from '../sequelize/repositories/BiometricAuthenticationRepository';
import admin from 'firebase-admin';
import { randomInt } from 'crypto';
import { deductCommissionFromDriverFundsByRide } from './recharge_funds';
import { ensureActiveSession } from '../utils/sessionUtils';

const paymentService = new PaymentService();
const biometricAuthRepo = new BiometricAuthenticationRepository();

// Estados terminales del pago — un solo nombre canónico ('completed');
// 'payment_completed' se acepta por compatibilidad con nodos legacy.
const TERMINAL_PAYMENT_STATUSES = new Set(['completed', 'payment_completed']);
const NON_CONFIRMABLE_STATUSES = new Set(['completed', 'payment_completed', 'canceled', 'failed']);
const FINALIZE_CLAIM_STALE_MS = 2 * 60_000;
const MAX_TIP_AMOUNT = 10_000;
const MAX_CANCEL_REASON_LEN = 200;

type RideParticipantRole = 'client' | 'driver';

interface PaymentContext {
  paymentData: any | null;
  rideData: any | null;
  clientId: string | null;
  driverId: string | null;
}

const pickId = (...values: any[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
};

/**
 * Lee paymentStatus + activeRides en paralelo y resuelve los participantes
 * reales del viaje. El rol del llamador siempre se deriva de estos ids —
 * nunca de un campo del payload (bypasseable).
 */
const resolvePaymentContext = async (rideId: string): Promise<PaymentContext> => {
  const db = admin.database();
  const [paymentSnap, rideSnap] = await Promise.all([
    db.ref(`paymentStatus/${rideId}`).once('value'),
    db.ref(`activeRides/${rideId}`).once('value'),
  ]);
  const paymentData = paymentSnap.val();
  const rideData = rideSnap.val();

  return {
    paymentData,
    rideData,
    clientId: pickId(
      rideData?.clientId, rideData?.client_id, rideData?.userId, rideData?.user_id,
      rideData?.client?.id, rideData?.client?.uid,
      paymentData?.clientId, paymentData?.client_id,
    ),
    driverId: pickId(
      rideData?.driverId, rideData?.driver_id,
      rideData?.driver?.id, rideData?.driver?.uid,
      paymentData?.driverId, paymentData?.driver_id,
    ),
  };
};

const roleOf = (uid: string, ctx: PaymentContext): RideParticipantRole | null =>
  ctx.clientId === uid ? 'client' : ctx.driverId === uid ? 'driver' : null;

const pickNumber = (...values: any[]): number | null => {
  for (const value of values) {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const rethrowOrInternal = (error: any, logPrefix: string): never => {
  if (error instanceof functions.https.HttpsError) throw error;
  console.error(`${logPrefix}`, error);
  throw new functions.https.HttpsError('internal', 'Error interno del servidor');
};

/**
 * Finalización única del pago en efectivo cuando AMBAS partes confirmaron.
 * Idempotente: SQL early-returns si ya completó y la comisión se deduplica
 * por paymentId (externalTransactionId).
 * Escribe el único estado terminal canónico 'completed' → dispara
 * onPaymentCompleted (archivado) igual en ambos órdenes de confirmación.
 */
const finalizeCashPayment = async (
  rideId: string,
  paymentData: any,
  rideData: any,
): Promise<void> => {
  let completedPayment: any = null;
  try {
    completedPayment = await paymentService.completeCashPayment(rideId);
    await applyCommissionDeductionForCompletedPayment(
      rideId,
      completedPayment,
      paymentData?.driverId || paymentData?.driver_id || rideData?.driverId || null,
    );
  } catch (err: any) {
    // El trigger de archivado re-sincroniza el pago en Supabase — un fallo
    // aquí no debe impedir marcar el estado terminal en RTDB.
    console.warn(`⚠️ [payments] Error completando pago en Supabase:`, err?.message || err);
  }

  const finalAmount = pickNumber(completedPayment?.amount, paymentData?.amount, rideData?.finalFare) ?? 0;
  const db = admin.database();

  await db.ref(`paymentStatus/${rideId}`).update({
    status: 'completed',
    finalAmount,
    amount: finalAmount || paymentData?.amount || 0,
    confirmedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    lastUpdatedBy: 'backend',
  });

  // El viaje queda a la espera del rating; el trigger de archivado lo
  // consolidará a 'completed' y limpiará el nodo. Si el nodo ya no
  // existe no lo recreamos parcialmente.
  if (rideData) {
    await db.ref(`activeRides/${rideId}`).update({
      status: 'pending_rating',
      finalFare: pickNumber(rideData?.finalFare, finalAmount, rideData?.estimatedPrice) ?? 0,
      paymentCompletedAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
    });
  }
};

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const applyCommissionDeductionForCompletedPayment = async (
  rideId: string,
  payment: any,
  fallbackDriverId?: string | null,
) => {
  const paymentId = normalizeString(payment?.id);
  const commissionAmount = parseNumber(payment?.commission);

  if (!paymentId || commissionAmount <= 0) {
    return;
  }

  if (String(payment?.commission_status || '').toLowerCase() === 'paid') {
    return;
  }

  try {
    await deductCommissionFromDriverFundsByRide({
      rideId,
      paymentId,
      commissionAmount,
      fallbackDriverId: normalizeString(fallbackDriverId || '') || null,
    });
  } catch (error) {
    console.error('❌ [payments_sequelize] Error descontando comisión desde RechargeFunds:', error);
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
    const rideId = normalizeString(data?.rideId);
    const tip = Number(data?.tip ?? 0);

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }
    if (!Number.isFinite(tip) || tip < 0 || tip > MAX_TIP_AMOUNT) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `tip debe ser un número entre 0 y ${MAX_TIP_AMOUNT}`,
      );
    }

    // Solo un participante real del viaje puede registrar su pago.
    const ctx = await resolvePaymentContext(rideId);
    if (!roleOf(context.auth.uid, ctx)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No eres parte de este viaje",
      );
    }
    const status = String(ctx.paymentData?.status || '');
    if (TERMINAL_PAYMENT_STATUSES.has(status) || status === 'canceled') {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El pago ya está en estado ${status}`,
      );
    }

    const payment = await paymentService.registerCashPayment(rideId, tip);

    const db = admin.database();

    await db.ref(`paymentStatus/${rideId}`).update({
      rideId,
      status: 'pending_confirmation',
      method: 'cash',
      provider: 'cash',
      amount: Number(payment.amount || 0),
      tip,
      total: Number(payment.amount || 0) + tip,
      driverId: ctx.driverId,
      clientId: ctx.clientId,
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
    return rethrowOrInternal(error, "❌ Error registrando pago en efectivo:");
  }
});

/**
 * Generar código de confirmación para pago en efectivo (flujo "code")
 * Solo el conductor asignado al viaje puede generar el código.
 */
export const generateCashCode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
  }

  await ensureActiveSession(context, data);

  try {
    const rideId = normalizeString(data?.rideId);

    if (!rideId) {
      throw new functions.https.HttpsError('invalid-argument', 'rideId es requerido');
    }

    const ctx = await resolvePaymentContext(rideId);
    if (!ctx.paymentData) {
      throw new functions.https.HttpsError('not-found', 'Estado de pago no encontrado');
    }
    // Solo el conductor asignado genera códigos para este viaje.
    if (roleOf(context.auth.uid, ctx) !== 'driver') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Solo el conductor asignado puede generar el código',
      );
    }
    const status = String(ctx.paymentData.status || '');
    if (NON_CONFIRMABLE_STATUSES.has(status)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `El pago ya está en estado ${status}`,
      );
    }

    const db = admin.database();

    // Generar código de 4 dígitos (0000–9999) siempre como string de 4 caracteres
    const raw = randomInt(0, 10000);
    const code = raw.toString().padStart(4, '0');

    const now = admin.database.ServerValue.TIMESTAMP;

    await db.ref(`paymentStatus/${rideId}`).update({
      code,
      codeGeneratedAt: now,
      codeGeneratedBy: 'driver',
      codeGeneratedById: context.auth.uid,
      // Registrar que este pago se está autenticando por código
      // (NO se pisa `method`: el método de pago sigue siendo 'cash').
      authentication_method: 'code',
      biometric_type: 'NOT_SUPPORTED',
      biometric_authenticated: false,
      lastUpdatedAt: now,
      lastUpdatedBy: 'backend',
    });

    return {
      success: true,
      code,
    };
  } catch (error: any) {
    return rethrowOrInternal(error, '❌ [generateCashCode] Error generando código:');
  }
});

/**
 * Confirmar pago en efectivo — protocolo de doble confirmación.
 *
 * Seguridad:
 * - El rol (client/driver) se deriva de los ids reales del viaje, no del
 *   payload — un usuario no puede confirmar por la otra parte ni por ambas.
 * - La escritura del flag es una transacción RTDB: elimina la raza
 *   check-then-act donde ambos confirmaban simultáneamente y nadie finalizaba.
 * - La finalización la ejecuta solo quien reclama `finalizationClaim`
 *   (con expiración de 2 min para recuperar un claim huérfano).
 * - Estado terminal único 'completed' → el trigger archiva siempre, en
 *   cualquier orden de confirmación.
 */
export const confirmCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  // Enforce single-session (deny)
  await ensureActiveSession(context, data);

  try {
    const {
      rideId: rawRideId,
      confirmedBy,
      authenticationMethod,
      biometricType,
      biometricAuthenticated,
    } = data;

    const rideId = normalizeString(rawRideId);
    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }

    const uid = context.auth.uid;
    const db = admin.database();

    const authMethod = typeof authenticationMethod === 'string' ? String(authenticationMethod) : undefined;
    const bioType = typeof biometricType === 'string' ? String(biometricType) : undefined;

    const ctx = await resolvePaymentContext(rideId);
    if (!ctx.paymentData) {
      throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
    }

    const role = roleOf(uid, ctx);
    if (!role) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No eres parte de este viaje",
      );
    }
    if (confirmedBy && confirmedBy !== role) {
      console.warn(
        `⚠️ [confirmCashPayment] confirmedBy='${confirmedBy}' no coincide con el rol real '${role}' (uid=${uid}, rideId=${rideId}) — se usa el rol real`,
      );
    }

    const currentStatus = String(ctx.paymentData.status || '');
    if (TERMINAL_PAYMENT_STATUSES.has(currentStatus)) {
      // Idempotente: re-confirmar sobre un pago terminal no es error.
      return {
        success: true,
        message: "Pago ya completado",
        status: "pending_rating",
        bothConfirmed: true,
        paymentCompleted: true,
      };
    }
    if (NON_CONFIRMABLE_STATUSES.has(currentStatus)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El pago no es confirmable (estado: ${currentStatus})`,
      );
    }

    const myFlag = role === 'client' ? 'confirmedByClient' : 'confirmedByDriver';
    const bothAlready = ctx.paymentData.confirmedByClient === true && ctx.paymentData.confirmedByDriver === true;

    // Shortcut idempotente: ya confirmé y la otra parte aún no — no hay
    // nada que escribir ni que reclamar.
    if (ctx.paymentData[myFlag] === true && !bothAlready) {
      return {
        success: true,
        message: role === 'client' ? "Pago confirmado por cliente" : "Pago confirmado por conductor",
        status: "pending_confirmation",
        bothConfirmed: false,
        paymentCompleted: false,
      };
    }

    const paymentRef = db.ref(`paymentStatus/${rideId}`);
    const txResult = await paymentRef.transaction((current: any) => {
      if (!current) {
        return; // abort — se rechequea fuera
      }
      const s = String(current.status || '');
      if (NON_CONFIRMABLE_STATUSES.has(s)) {
        return; // abort — se rechequea fuera
      }

      current[myFlag] = true;
      current[role === 'client' ? 'clientConfirmedAt' : 'driverConfirmedAt'] =
        admin.database.ServerValue.TIMESTAMP;
      current.lastUpdatedAt = admin.database.ServerValue.TIMESTAMP;
      current.lastUpdatedBy = role;
      if (authMethod) {
        current.authentication_method = authMethod;
      }
      if (typeof biometricAuthenticated === 'boolean') {
        current.biometric_authenticated = biometricAuthenticated;
      }
      if (bioType) {
        current.biometric_type = bioType;
      }

      // Claim de finalización: solo quien observe ambas flags primero
      // finaliza. La marca expira para recuperar claims huérfanos.
      if (current.confirmedByClient === true && current.confirmedByDriver === true) {
        const claim = current.finalizationClaim;
        if (!claim || typeof claim.at !== 'number' || Date.now() - claim.at > FINALIZE_CLAIM_STALE_MS) {
          current.finalizationClaim = { by: role, at: Date.now() };
        }
      }
      return current;
    });

    if (!txResult.committed) {
      // La transacción abortó: el nodo desapareció o cambió a un estado
      // no confirmable mientras tanto — reclasificar con una lectura fresca.
      const fresh = (await paymentRef.once('value')).val();
      if (!fresh) {
        throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
      }
      const freshStatus = String(fresh.status || '');
      if (TERMINAL_PAYMENT_STATUSES.has(freshStatus)) {
        return {
          success: true,
          message: "Pago ya completado",
          status: "pending_rating",
          bothConfirmed: true,
          paymentCompleted: true,
        };
      }
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El pago no es confirmable (estado: ${freshStatus || 'desconocido'})`,
      );
    }

    const after = txResult.snapshot.val();
    const bothConfirmed = after?.confirmedByClient === true && after?.confirmedByDriver === true;
    const shouldFinalize = bothConfirmed && after?.finalizationClaim?.by === role;

    console.log(
      `✅ [confirmCashPayment] ${role} confirmó (rideId=${rideId}, bothConfirmed=${bothConfirmed}, finalize=${shouldFinalize})`,
    );

    if (role === 'client' && authMethod === 'biometric') {
      try {
        await biometricAuthRepo.create({
          ride_id: rideId,
          user_id: uid,
          user_type: 'client',
          biometric_type: bioType || 'biometric',
          context: 'cash_payment_confirmation',
          success: true,
          attempt_number: 1,
        });
      } catch (bioErr) {
        console.warn('⚠️ [confirmCashPayment] Error registrando autenticación biométrica:', bioErr);
      }
    }

    if (shouldFinalize) {
      await finalizeCashPayment(rideId, after, ctx.rideData);
      console.log(`✅ [confirmCashPayment] Pago completado, viaje en estado pending_rating`);
    }

    return {
      success: true,
      message: role === 'client' ? "Pago confirmado por cliente" : "Pago confirmado por conductor",
      status: bothConfirmed ? "pending_rating" : "pending_confirmation",
      bothConfirmed,
      paymentCompleted: shouldFinalize,
    };
  } catch (error: any) {
    return rethrowOrInternal(error, "❌ [confirmCashPayment] Error confirmando pago:");
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
    const rideId = normalizeString(data?.rideId);

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }

    console.log(`💵 [completeCashPayment] Procesando pago para rideId: ${rideId}`);

    const ctx = await resolvePaymentContext(rideId);
    const paymentData = ctx.paymentData;

    if (!paymentData) {
      throw new functions.https.HttpsError("not-found", "Estado de pago no encontrado");
    }
    if (!roleOf(context.auth.uid, ctx)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No eres parte de este viaje",
      );
    }

    const currentStatus = String(paymentData.status || '');
    if (TERMINAL_PAYMENT_STATUSES.has(currentStatus)) {
      // Idempotente: ya completado (por la doble confirmación u otro caller).
      const existing = await paymentService.getPaymentByRide(rideId);
      return {
        success: true,
        bothConfirmed: true,
        message: "El pago ya estaba completado",
        status: "pending_rating",
        payment: existing
          ? { id: existing.id, amount: existing.amount, status: existing.status }
          : null,
      };
    }
    if (currentStatus === 'canceled' || currentStatus === 'failed') {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `El pago no es completable (estado: ${currentStatus})`,
      );
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

    await finalizeCashPayment(rideId, paymentData, ctx.rideData);
    const payment = await paymentService.getPaymentByRide(rideId);

    console.log(`✅ [completeCashPayment] paymentStatus actualizado a 'completed'`);

    return {
      success: true,
      bothConfirmed: true,
      message: "Pago completado exitosamente.",
      status: "pending_rating",
      payment: payment
        ? { id: payment.id, amount: payment.amount, status: payment.status }
        : null,
    };
  } catch (error: any) {
    return rethrowOrInternal(error, "❌ [completeCashPayment] Error completando pago:");
  }
});
/**
 * Cancelar pago en efectivo — solo un participante del viaje puede
 * reportar el problema. canceledBy refleja el rol real del llamador.
 */
export const cancelCashPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  // Enforce single-session (deny)
  await ensureActiveSession(context, data);

  try {
    const rideId = normalizeString(data?.rideId);
    const reason = normalizeString(data?.reason).substring(0, MAX_CANCEL_REASON_LEN) || 'Sin razón especificada';

    if (!rideId) {
      throw new functions.https.HttpsError("invalid-argument", "rideId es requerido");
    }

    console.log(`❌ [cancelCashPayment] Cancelando pago para viaje ${rideId}: ${reason}`);

    const ctx = await resolvePaymentContext(rideId);
    let rideData = ctx.rideData;
    let clientId = ctx.clientId;
    let driverId = ctx.driverId;

    // Fallback: el viaje pudo moverse de activeRides
    if (!rideData) {
      console.warn(`⚠️ [cancelCashPayment] Viaje ${rideId} no encontrado en activeRides`);
      const completedSnapshot = await admin.database().ref(`completedRides/${rideId}`).once('value');
      const completedRide = completedSnapshot.val();

      if (!completedRide && !ctx.paymentData) {
        throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
      }

      rideData = completedRide;
      clientId = clientId || pickId(rideData?.clientId, rideData?.client_id);
      driverId = driverId || pickId(rideData?.driverId, rideData?.driver_id);
    }

    const role =
      clientId === context.auth.uid ? 'client'
      : driverId === context.auth.uid ? 'driver'
      : null;
    if (!role) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No eres parte de este viaje",
      );
    }

    const currentStatus = String(ctx.paymentData?.status || '');
    if (currentStatus === 'canceled') {
      // Idempotente: cancelar un pago ya cancelado no es error.
      return {
        success: true,
        message: 'El pago ya estaba cancelado',
        rideId,
        reason: ctx.paymentData?.cancelReason || reason,
      };
    }
    if (TERMINAL_PAYMENT_STATUSES.has(currentStatus)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "El pago ya fue completado y no puede cancelarse",
      );
    }

    // Cancelar pago en Sequelize
    await paymentService.cancelPayment(rideId, reason);

    // Actualizar Realtime DB
    console.log(`📝 [cancelCashPayment] Actualizando paymentStatus en Realtime DB`);
    await admin.database().ref(`paymentStatus/${rideId}`).update({
      status: 'canceled',
      cancelReason: reason,
      canceledAt: admin.database.ServerValue.TIMESTAMP,
      canceledBy: role,
      canceledById: context.auth.uid,
      lastUpdatedBy: 'backend',
      lastUpdatedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // ⚠️ Deprecated: ya no se generan penalizaciones por comisión en cancelaciones.

    return {
      success: true,
      message: 'Pago cancelado exitosamente',
      rideId,
      reason,
    };
  } catch (error: any) {
    return rethrowOrInternal(error, "❌ [cancelCashPayment] Error cancelando pago:");
  }
});
