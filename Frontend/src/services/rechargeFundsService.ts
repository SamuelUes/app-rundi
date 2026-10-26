import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

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
    const functions = await getFirebaseFunctions();
    const fn = httpsCallable(functions, 'getDriverRechargeFundsSummary');
    const result = await fn({ limit });
    const data = result.data as any;

    return {
      success: Boolean(data?.success),
      driverId: toSafeString(data?.driverId, ''),
      availableBalance: toNumber(data?.availableBalance),
      blocked: Boolean(data?.blocked),
      totals: {
        totalRecharged: toNumber(data?.totals?.totalRecharged),
        totalDeducted: toNumber(data?.totals?.totalDeducted),
        rechargeCount: toNumber(data?.totals?.rechargeCount),
        deductionCount: toNumber(data?.totals?.deductionCount),
      },
      history: Array.isArray(data?.history)
        ? data.history.map((item: any) => ({
            id: toSafeString(item?.id, ''),
            driverId: toSafeString(item?.driverId, ''),
            rideId: toNullableSafeString(item?.rideId),
            rechargeType: toSafeString(item?.rechargeType, ''),
            source: toSafeString(item?.source, ''),
            amount: toNumber(item?.amount),
            balanceBefore: toNumber(item?.balanceBefore),
            balanceAfter: toNumber(item?.balanceAfter),
            externalReference: toNullableSafeString(item?.externalReference),
            externalTransactionId: toNullableSafeString(item?.externalTransactionId),
            status: toSafeString(item?.status, 'confirmed'),
            metadata: toSafeMetadata(item?.metadata),
            createdAt: toSafeDateString(item?.createdAt ?? item?.created_at),
          }))
        : [],
    };
  }

  async createRecharge(params: CreateRechargeParams) {
    const functions = await getFirebaseFunctions();
    const fn = httpsCallable(functions, 'createDriverRechargeManual');
    const result = await fn({
      amount: toNumber(params.amount),
      method: params.method || 'manual',
      cardId: params.cardId,
      reference: params.reference,
      externalTransactionId: params.externalTransactionId,
    });

    return result.data as {
      success: boolean;
      driverId: string;
      movementId: string;
      availableBalance: number;
      summary?: DriverRechargeFundsSummary;
      alreadyProcessed?: boolean;
      pending?: boolean;
      status?: string;
    };
  }
}

export default new RechargeFundsService();
