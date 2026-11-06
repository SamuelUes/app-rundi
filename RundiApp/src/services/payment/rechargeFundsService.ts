
import { getRechargeSummary, requestDriverRecharge } from '../../api/drivers';

export type DriverRechargeHistoryItem = {
  id: string;
  driverId: string;
  rideId: string | null;
  rechargeType: string;
  source: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  externalReference: string | null;
  externalTransactionId: string | null;
  status: string;
  metadata?: Record<string, any> | null;
  createdAt?: string | null;
};

export type DriverRechargeFundsSummary = {
  success: boolean;
  driverId: string;
  availableBalance: number;
  blocked: boolean;
  totals: {
    totalRecharged: number;
    totalDeducted: number;
    rechargeCount: number;
    deductionCount: number;
  };
  history: DriverRechargeHistoryItem[];
};

type CreateRechargeParams = {
  amount: number;
  method?: 'bank_transfer' | 'card' | 'manual';
  cardId?: string;
  reference?: string;
  externalTransactionId?: string;
};

const toNumber = (value: unknown) => {
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

  if (typeof value === 'object' && value) {
    const maybeToDate = (value as any).toDate;
    if (typeof maybeToDate === 'function') {
      const dateFromFn = maybeToDate.call(value);
      if (dateFromFn instanceof Date && !Number.isNaN(dateFromFn.getTime())) {
        return dateFromFn.toISOString();
      }
    }

    const secondsCandidate = Number((value as any).seconds ?? (value as any)._seconds);
    const nanosCandidate = Number((value as any).nanoseconds ?? (value as any)._nanoseconds ?? 0);
    if (Number.isFinite(secondsCandidate)) {
      const ms = secondsCandidate * 1000 + (Number.isFinite(nanosCandidate) ? nanosCandidate / 1e6 : 0);
      const parsedFromSeconds = new Date(ms);
      if (!Number.isNaN(parsedFromSeconds.getTime())) {
        return parsedFromSeconds.toISOString();
      }
    }
  }

  const normalized = toSafeString(value, '');
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toISOString();
};

class RechargeFundsService {
  async getSummary(limit: number = 30): Promise<DriverRechargeFundsSummary> {
    const { balance, recharges } = await getRechargeSummary(limit);
    const history: DriverRechargeHistoryItem[] = recharges.map((item) => ({
      id: String(item?.id || ''),
      driverId: '',
      rideId: null,
      rechargeType: String(item?.type || ''),
      source: String(item?.source || ''),
      amount: toNumber(item?.amount),
      balanceBefore: 0,
      balanceAfter: 0,
      externalReference: toNullableSafeString(item?.externalReference),
      externalTransactionId: null,
      status: toSafeString(item?.status, 'confirmed'),
      metadata: null,
      createdAt: toSafeDateString(item?.createdAt),
    }));

    const recharged = history.filter((h) => h.amount > 0);
    const deducted = history.filter((h) => h.amount < 0);

    return {
      success: true,
      driverId: '',
      availableBalance: toNumber(balance),
      blocked: toNumber(balance) <= 0,
      totals: {
        totalRecharged: recharged.reduce((a, h) => a + h.amount, 0),
        totalDeducted: Math.abs(deducted.reduce((a, h) => a + h.amount, 0)),
        rechargeCount: recharged.length,
        deductionCount: deducted.length,
      },
      history,
    };
  }

  /**
   * Solicitud de recarga del conductor (createDriverRechargeManual v1): queda
   * status='pending' hasta que operaciones la confirme contra el estado de
   * cuenta (POST /v1/admin/recharges/{id}/confirm acredita el saldo).
   */
  async createRecharge(params: CreateRechargeParams): Promise<{
    success: boolean;
    driverId?: string;
    movementId?: string;
    availableBalance?: number;
    summary?: DriverRechargeFundsSummary;
    alreadyProcessed?: boolean;
    pending?: boolean;
    status?: string;
  }> {
    const res = await requestDriverRecharge({
      amount: params.amount,
      reference: params.reference,
      externalTransactionId: params.externalTransactionId,
      method: params.method,
    });
    return {
      success: true,
      driverId: res.recharge?.driverId,
      movementId: res.recharge?.id,
      availableBalance: res.availableBalance,
      alreadyProcessed: res.alreadyProcessed,
      pending: res.pending ?? res.status === 'pending',
      status: res.status ?? res.recharge?.status,
    };
  }
}

export default new RechargeFundsService();
