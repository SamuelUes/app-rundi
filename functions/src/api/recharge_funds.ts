import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { regionConfig } from '../config/functions-config';
import { DriverRechargeRepository } from '../sequelize/repositories/DriverRechargeRepository';
import { PaymentService } from '../sequelize/services/PaymentService';
import { RideRepository } from '../sequelize/repositories/RideRepository';

const rechargeRepo = new DriverRechargeRepository();
const paymentService = new PaymentService();
const rideRepo = new RideRepository();

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const round2 = (value: number) => Number(value.toFixed(2));

async function syncRealtimeWallet(driverId: string, balance: number, extra: Record<string, any> = {}) {
  try {
    const normalizedBalance = round2(balance);
    await admin.database().ref(`drivers/${driverId}/wallet`).update({
      availableBalance: normalizedBalance,
      currentRechargeBalance: normalizedBalance,
      blocked: normalizedBalance <= 0,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      ...extra,
    });
  } catch (error) {
    console.warn('⚠️ [recharge_funds] No se pudo sincronizar wallet en Realtime DB:', error);
  }
}

export async function deductCommissionFromDriverFundsByRide(params: {
  rideId: string;
  commissionAmount: number;
  paymentId?: string | null;
  fallbackDriverId?: string | null;
}) {
  const rideId = normalizeString(params.rideId);
  if (!rideId) {
    return null;
  }

  const commissionAmount = round2(Math.abs(toNumber(params.commissionAmount)));
  if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) {
    return null;
  }

  const paymentId = normalizeString(params.paymentId);
  const externalTransactionId = paymentId ? `deduction-${paymentId}` : '';

  if (externalTransactionId) {
    const existing = await rechargeRepo.findByExternalTransactionId(externalTransactionId);
    if (existing) {
      return {
        driverId: String((existing as any).driver_id || ''),
        alreadyProcessed: true,
        movementId: String((existing as any).id || ''),
        balanceAfter: round2(toNumber((existing as any).balance_after)),
      };
    }
  }

  let driverId = normalizeString(params.fallbackDriverId);
  if (!driverId) {
    try {
      const ride = await rideRepo.findById(rideId);
      driverId = normalizeString((ride as any)?.driver_id);
    } catch (rideError) {
      console.warn('⚠️ [recharge_funds] No se pudo resolver driver_id desde ride:', rideError);
    }
  }

  if (!driverId) {
    console.warn('⚠️ [recharge_funds] No se pudo deducir comisión: driverId vacío', {
      rideId,
      paymentId,
    });
    return null;
  }

  const applied = await rechargeRepo.applyFundsDelta({
    driverId,
    deltaAmount: -commissionAmount,
    rechargeType: 'commission_deduction',
    source: 'ride_payment_completion',
    rideId,
    externalReference: paymentId ? `payment:${paymentId}` : `ride:${rideId}`,
    externalTransactionId: externalTransactionId || null,
    metadata: {
      rideId,
      paymentId: paymentId || null,
      reason: 'commission_deduction_after_trip_completion',
    },
  });

  if (paymentId) {
    try {
      await paymentService.markDriverCommissionPaymentsAsPaid([paymentId]);
    } catch (paymentMarkError) {
      console.warn('⚠️ [recharge_funds] No se pudo marcar comisión como pagada:', paymentMarkError);
    }
  }

  await syncRealtimeWallet(driverId, applied.balanceAfter, {
    lastMovementType: 'commission_deduction',
    lastMovementAmount: -commissionAmount,
  });

  return {
    driverId,
    movementId: String((applied.movement as any)?.id || ''),
    balanceAfter: round2(applied.balanceAfter),
    deductedAmount: commissionAmount,
    alreadyProcessed: false,
  };
}

export const getDriverRechargeFundsSummary = functions
  .runWith(regionConfig)
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const authUid = normalizeString(context.auth.uid);
    const requestedDriverId = normalizeString(data?.driverId);
    const driverId = requestedDriverId || authUid;

    if (driverId !== authUid) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes consultar fondos de otro conductor');
    }

    const limit = Math.max(1, Math.min(100, Number(data?.limit ?? 20)));
    const summary = await rechargeRepo.getDriverFundsSummary(driverId, limit);
    await syncRealtimeWallet(driverId, summary.availableBalance);

    return {
      success: true,
      ...summary,
    };
  });

export const createDriverRechargeManual = functions
  .runWith(regionConfig)
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Usuario no autenticado');
    }

    const authUid = normalizeString(context.auth.uid);
    const requestedDriverId = normalizeString(data?.driverId);
    const driverId = requestedDriverId || authUid;

    if (driverId !== authUid) {
      throw new functions.https.HttpsError('permission-denied', 'No puedes recargar fondos de otro conductor');
    }

    const amount = round2(toNumber(data?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amount debe ser mayor que 0');
    }

    const externalTransactionId = normalizeString(data?.externalTransactionId || data?.transactionId).slice(0, 255);
    const externalReference = normalizeString(data?.reference).slice(0, 255);
    if (externalTransactionId) {
      const existing = await rechargeRepo.findByExternalTransactionId(externalTransactionId);
      if (existing) {
        const existingStatus = normalizeString((existing as any)?.status) || 'confirmed';
        return {
          success: true,
          alreadyProcessed: true,
          pending: existingStatus === 'pending',
          status: existingStatus,
          movementId: String((existing as any)?.id || ''),
          driverId,
        };
      }
    }

    // La recarga queda pendiente de validación en el panel CMS: no se
    // acredita saldo ni se toca drivers/{uid}/wallet hasta que un
    // admin/operador la confirme contra el estado de cuenta bancario.
    const { movement, currentBalance } = await rechargeRepo.createPendingRecharge({
      driverId,
      amount,
      source: 'manual',
      externalReference: externalReference || null,
      externalTransactionId: externalTransactionId || null,
      metadata: {
        method: normalizeString(data?.method) || 'manual',
        cardId: normalizeString(data?.cardId) || null,
      },
    });

    return {
      success: true,
      pending: true,
      status: 'pending',
      driverId,
      movementId: String((movement as any)?.id || ''),
      availableBalance: currentBalance,
    };
  });

export const puntoExpressRechargeWebhookHttp = functions
  .runWith(regionConfig)
  .https.onRequest(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'method-not-allowed' });
      return;
    }

    try {
      const expectedToken = normalizeString(process.env.PUNTOEXPRESS_WEBHOOK_TOKEN);
      const providedToken = normalizeString(req.header('x-puntoexpress-token') || req.header('authorization') || '');
      if (expectedToken && providedToken !== expectedToken && providedToken !== `Bearer ${expectedToken}`) {
        res.status(401).json({ success: false, error: 'invalid-webhook-token' });
        return;
      }

      const body = req.body || {};
      const driverId = normalizeString(body.driverId || body.userId || body.uid);
      const amount = round2(toNumber(body.amount));
      const externalReference = normalizeString(body.reference || body.externalReference);
      const externalTransactionId = normalizeString(body.transactionId || body.externalTransactionId);

      if (!driverId) {
        res.status(400).json({ success: false, error: 'driverId-required' });
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, error: 'invalid-amount' });
        return;
      }

      if (externalTransactionId) {
        const existing = await rechargeRepo.findByExternalTransactionId(externalTransactionId);
        if (existing) {
          res.status(200).json({
            success: true,
            alreadyProcessed: true,
            movementId: String((existing as any)?.id || ''),
            driverId,
          });
          return;
        }
      }

      const movement = await rechargeRepo.applyFundsDelta({
        driverId,
        deltaAmount: amount,
        rechargeType: 'recharge',
        source: 'puntoexpress_webhook',
        externalReference: externalReference || null,
        externalTransactionId: externalTransactionId || null,
        metadata: body,
      });

      const summary = await rechargeRepo.getDriverFundsSummary(driverId, 20);
      await syncRealtimeWallet(driverId, summary.availableBalance, {
        lastMovementType: 'recharge',
        lastMovementAmount: amount,
      });

      res.status(200).json({
        success: true,
        driverId,
        movementId: String((movement.movement as any)?.id || ''),
        availableBalance: summary.availableBalance,
      });
    } catch (error: any) {
      console.error('❌ [puntoExpressRechargeWebhookHttp] Error:', error);
      res.status(500).json({
        success: false,
        error: error?.message || 'internal-error',
      });
    }
  });
