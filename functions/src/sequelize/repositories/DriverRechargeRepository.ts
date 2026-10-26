/**
 * DriverRechargeRepository - Operaciones de recargas y débitos de fondos de conductores
 */

import { Transaction } from 'sequelize';
import sequelize from '../config/database';
import Driver from '../models/Driver';
import DriverRecharge from '../models/DriverRecharge';

type ApplyDriverFundsDeltaInput = {
  driverId: string;
  deltaAmount: number;
  rechargeType: 'recharge' | 'commission_deduction' | 'adjustment';
  source: 'manual' | 'puntoexpress_webhook' | 'ride_payment_completion' | 'system';
  rideId?: string | null;
  externalReference?: string | null;
  externalTransactionId?: string | null;
  metadata?: Record<string, any> | null;
  status?: 'confirmed' | 'pending' | 'failed';
};

type CreatePendingRechargeInput = {
  driverId: string;
  amount: number;
  source: 'manual' | 'puntoexpress_webhook' | 'ride_payment_completion' | 'system';
  externalReference?: string | null;
  externalTransactionId?: string | null;
  metadata?: Record<string, any> | null;
};

const round2 = (value: number) => Number(value.toFixed(2));

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toSafeString = (value: unknown, fallback: string = ''): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
};

const toNullableSafeString = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  const normalized = toSafeString(value, '');
  return normalized || null;
};

const toSafeMetadata = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, any>;
};

const toSafeDateString = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const asString = toSafeString(value, '');
  if (!asString) {
    return null;
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) {
    return asString;
  }

  return parsed.toISOString();
};

export class DriverRechargeRepository {
  async findByExternalTransactionId(externalTransactionId: string): Promise<DriverRecharge | null> {
    if (!externalTransactionId) return null;
    return await DriverRecharge.findOne({
      where: { external_transaction_id: externalTransactionId },
    });
  }

  async listByDriverId(driverId: string, limit: number = 30): Promise<DriverRecharge[]> {
    return await DriverRecharge.findAll({
      where: { driver_id: driverId },
      order: [['created_at', 'DESC']],
      limit: Math.max(1, Math.min(100, Number(limit) || 30)),
    });
  }

  async applyFundsDelta(input: ApplyDriverFundsDeltaInput) {
    const delta = round2(parseNumber(input.deltaAmount));
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error('deltaAmount inválido para aplicar movimiento de fondos');
    }

    return await sequelize.transaction(async (tx: Transaction) => {
      const driver = await Driver.findOne({
        where: { user_id: input.driverId },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });

      if (!driver) {
        throw new Error('Conductor no encontrado para aplicar fondos');
      }

      const balanceBefore = round2(parseNumber((driver as any).current_recharge_balance));
      const balanceAfter = round2(balanceBefore + delta);

      await driver.update(
        {
          current_recharge_balance: balanceAfter,
          updated_at: new Date(),
        },
        { transaction: tx },
      );

      const movement = await DriverRecharge.create(
        {
          driver_id: input.driverId,
          ride_id: input.rideId ?? null,
          recharge_type: input.rechargeType,
          source: input.source,
          amount: delta,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          external_reference: input.externalReference ?? null,
          external_transaction_id: input.externalTransactionId ?? null,
          metadata: input.metadata ?? null,
          status: input.status ?? 'confirmed',
          created_at: new Date(),
          updated_at: new Date(),
        },
        { transaction: tx },
      );

      return {
        movement,
        balanceBefore,
        balanceAfter,
      };
    });
  }

  /**
   * Registra una recarga reportada por el conductor sin acreditar saldo.
   * Queda en status='pending' hasta que el panel CMS la valide con el RPC
   * confirm_driver_recharge (que reescribe balance_before/after y acredita).
   */
  async createPendingRecharge(input: CreatePendingRechargeInput) {
    const amount = round2(parseNumber(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('amount inválido para registrar recarga pendiente');
    }

    const driver = await Driver.findOne({ where: { user_id: input.driverId } });
    if (!driver) {
      throw new Error('Conductor no encontrado para registrar recarga');
    }

    const currentBalance = round2(parseNumber((driver as any).current_recharge_balance));

    const movement = await DriverRecharge.create({
      driver_id: input.driverId,
      recharge_type: 'recharge',
      source: input.source,
      amount,
      balance_before: currentBalance,
      balance_after: currentBalance,
      external_reference: input.externalReference ?? null,
      external_transaction_id: input.externalTransactionId ?? null,
      metadata: input.metadata ?? null,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      movement,
      currentBalance,
    };
  }

  async getDriverFundsSummary(driverId: string, historyLimit: number = 20) {
    const driver = await Driver.findOne({ where: { user_id: driverId } });
    const availableBalance = round2(parseNumber((driver as any)?.current_recharge_balance));

    const history = await this.listByDriverId(driverId, historyLimit);

    const totals = history.reduce(
      (acc, entry: any) => {
        // Solo movimientos confirmados impactan el saldo; las recargas
        // pendientes/rechazadas se listan en el historial pero no suman.
        if (toSafeString(entry?.status, 'confirmed') !== 'confirmed') {
          return acc;
        }
        const amount = parseNumber(entry?.amount);
        if (amount > 0) {
          acc.totalRecharged += amount;
          acc.rechargeCount += 1;
        } else if (amount < 0) {
          acc.totalDeducted += Math.abs(amount);
          acc.deductionCount += 1;
        }
        return acc;
      },
      {
        totalRecharged: 0,
        totalDeducted: 0,
        rechargeCount: 0,
        deductionCount: 0,
      },
    );

    return {
      driverId,
      availableBalance,
      blocked: availableBalance <= 0,
      totals: {
        totalRecharged: round2(totals.totalRecharged),
        totalDeducted: round2(totals.totalDeducted),
        rechargeCount: totals.rechargeCount,
        deductionCount: totals.deductionCount,
      },
      history: history.map((entry: any) => ({
        id: toSafeString(entry?.id, ''),
        driverId: toSafeString(entry?.driver_id, driverId),
        rideId: toNullableSafeString(entry?.ride_id),
        rechargeType: toSafeString(entry?.recharge_type, ''),
        source: toSafeString(entry?.source, ''),
        amount: round2(parseNumber(entry?.amount)),
        balanceBefore: round2(parseNumber(entry?.balance_before)),
        balanceAfter: round2(parseNumber(entry?.balance_after)),
        externalReference: toNullableSafeString(entry?.external_reference),
        externalTransactionId: toNullableSafeString(entry?.external_transaction_id),
        status: toSafeString(entry?.status, 'confirmed'),
        metadata: toSafeMetadata(entry?.metadata),
        createdAt: toSafeDateString(entry?.created_at),
      })),
    };
  }
}
