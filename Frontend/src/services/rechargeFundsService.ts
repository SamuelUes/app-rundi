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

class RechargeFundsService {
  async getSummary(limit: number = 30): Promise<DriverRechargeFundsSummary> {
    const functions = await getFirebaseFunctions();
    const fn = httpsCallable(functions, 'getDriverRechargeFundsSummary');
    const result = await fn({ limit });
    const data = result.data as any;

    return {
      success: Boolean(data?.success),
      driverId: String(data?.driverId || ''),
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
            id: String(item?.id || ''),
            driverId: String(item?.driverId || ''),
            rideId: item?.rideId ?? null,
            rechargeType: String(item?.rechargeType || ''),
            source: String(item?.source || ''),
            amount: toNumber(item?.amount),
            balanceBefore: toNumber(item?.balanceBefore),
            balanceAfter: toNumber(item?.balanceAfter),
            externalReference: item?.externalReference ?? null,
            externalTransactionId: item?.externalTransactionId ?? null,
            status: String(item?.status || 'confirmed'),
            metadata: item?.metadata ?? null,
            createdAt: item?.createdAt ?? null,
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
    };
  }
}

export default new RechargeFundsService();
