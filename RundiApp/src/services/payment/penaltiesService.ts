/**
 * penaltiesService - Servicio para penalizaciones de conductores
 */
import { getPendingPayments } from '../../api/payments';
import { getFirebaseAuth } from '../../config/firebase';

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
  /**
   * Resumen de deuda pendiente del conductor. En v2 las comisiones de viajes
   * cash viven en /payments/pending (PendingDebt); no hay entidad "penalty"
   * separada en el backend actual.
   */
  async getDriverPenaltySummary(): Promise<DriverPenaltySummary> {
    const auth = await getFirebaseAuth();
    const { payments, totalDebt } = await getPendingPayments();
    const uid = auth.currentUser?.uid ?? '';

    const paymentDetails: PendingCommissionDetail[] = payments.map((p) => ({
      id: p.paymentId,
      rideId: p.rideId,
      driverId: uid || null,
      commission: 0,
      amount: p.amount,
      tip: p.tip,
      total: p.total,
      paymentMethod: 'cash',
      commissionStatus: 'pending',
      status: p.status,
      createdAt: p.createdAt ?? null,
      updatedAt: null,
    }));

    return {
      success: true,
      driverId: uid,
      pendingCount: payments.length,
      pendingAmount: totalDebt,
      penalties: { count: 0, amount: 0 },
      payments: { count: payments.length, amount: totalDebt },
      paymentDetails,
    };
  }

  async getDriverPenalties(): Promise<any> {
    return { success: true, penalties: [] };
  }

  async payAllPenalties(reference?: string): Promise<PayAllPenaltiesResult>;
  async payAllPenalties(options: PayPenaltiesOptions): Promise<PayAllPenaltiesResult>;
  async payAllPenalties(
    _params?: string | PayPenaltiesOptions
  ): Promise<PayAllPenaltiesResult> {
    // Sin endpoint v2 — el saldo se liquida por operación/backoffice.
    return { success: false, driverId: '', changed: 0, totalPaid: 0 };
  }
}

export default new PenaltiesService();
