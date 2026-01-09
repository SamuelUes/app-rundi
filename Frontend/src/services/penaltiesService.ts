/**
 * penaltiesService - Servicio para penalizaciones de conductores
 */
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../config/firebase';

export type PendingCommissionDetail = {
  id: string;
  rideId: string | null;
  driverId: string | null;
  commission: number;
  amount: number;
  tip: number;
  total: number;
  paymentMethod: string;
  commissionRate?: number | null;
  paidAt?: string | null;
  commissionPaidAt?: string | null;
  commissionStatus: 'pending' | 'paid';
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type DriverPenaltySummary = {
  success: boolean;
  driverId: string;
  pendingCount: number;
  pendingAmount: number;
  penalties: {
    count: number;
    amount: number;
  };
  payments: {
    count: number;
    amount: number;
  };
  paymentDetails: PendingCommissionDetail[];
};

type PayPenaltiesOptions = {
  reference?: string;
  method?: 'bank_transfer' | 'card';
  cardId?: string;
};

export type PayAllPenaltiesResult = {
  success: boolean;
  driverId: string;
  changed: number;
  totalPaid: number;
  breakdown?: {
    penaltiesPaid: number;
    penaltiesAmount: number;
    paymentCommissionsPaid: number;
    paymentCommissionsAmount: number;
  };
};

class PenaltiesService {
  async getDriverPenaltySummary(): Promise<DriverPenaltySummary> {
    const functions = await getFirebaseFunctions();
    const fn = httpsCallable(functions, 'getDriverPenaltySummary');
    const result = await fn({});
    const data = result.data as any;

    return {
      success: Boolean(data?.success),
      driverId: String(data?.driverId || ''),
      pendingCount: Number(data?.pendingCount || 0),
      pendingAmount: Number(data?.pendingAmount || 0),
      penalties: {
        count: Number(data?.penalties?.count || 0),
        amount: Number(data?.penalties?.amount || 0),
      },
      payments: {
        count: Number(data?.payments?.count || 0),
        amount: Number(data?.payments?.amount || 0),
      },
      paymentDetails: Array.isArray(data?.paymentDetails)
        ? data.paymentDetails.map((item: any) => ({
            id: String(item?.id || ''),
            rideId: item?.rideId ?? null,
            driverId: item?.driverId ?? null,
            commission: Number(item?.commission || 0),
            amount: Number(item?.amount || 0),
            tip: Number(item?.tip || 0),
            total: Number(item?.total || 0),
            paymentMethod: String(item?.paymentMethod || ''),
            commissionRate: typeof item?.commissionRate === 'number' ? item.commissionRate : item?.commissionRate ?? null,
            paidAt: item?.paidAt ?? null,
            commissionPaidAt: item?.commissionPaidAt ?? null,
            commissionStatus: item?.commissionStatus === 'paid' ? 'paid' : 'pending',
            status: String(item?.status || ''),
            createdAt: item?.createdAt ?? null,
            updatedAt: item?.updatedAt ?? null,
          }))
        : [],
    };
  }

  async getDriverPenalties(): Promise<any> {
    const functions = await getFirebaseFunctions();
    const fn = httpsCallable(functions, 'getDriverPenalties');
    const result = await fn({ driverId: undefined });
    return result.data;
  }

  async payAllPenalties(reference?: string): Promise<PayAllPenaltiesResult>;
  async payAllPenalties(options: PayPenaltiesOptions): Promise<PayAllPenaltiesResult>;
  async payAllPenalties(
    params?: string | PayPenaltiesOptions
  ): Promise<PayAllPenaltiesResult> {
    const functions = await getFirebaseFunctions();
    const fn = httpsCallable(functions, 'payAllPenalties');

    const payload = typeof params === 'string'
      ? { reference: params }
      : {
          reference: params?.reference,
          method: params?.method ?? 'bank_transfer',
          cardId: params?.cardId,
        };

    const result = await fn(payload);
    const data = result.data as PayAllPenaltiesResult;
    return {
      success: Boolean(data?.success),
      driverId: String(data?.driverId || ''),
      changed: Number(data?.changed || 0),
      totalPaid: Number(data?.totalPaid || 0),
      breakdown: data?.breakdown
        ? {
            penaltiesPaid: Number(data.breakdown.penaltiesPaid || 0),
            penaltiesAmount: Number(data.breakdown.penaltiesAmount || 0),
            paymentCommissionsPaid: Number(data.breakdown.paymentCommissionsPaid || 0),
            paymentCommissionsAmount: Number(data.breakdown.paymentCommissionsAmount || 0),
          }
        : undefined,
    };
  }
}

export default new PenaltiesService();
