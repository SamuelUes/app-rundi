/**
 * PaymentsService — fachada v2 (/v1/payments).
 * Stripe createPaymentIntent no existe en v2: pagos cash (confirmación por
 * código) y card_local (webhook PuntoExpress) — sin intents de tarjeta.
 */

import {
  cancelCashPayment,
  changePaymentMethod,
  confirmCashPayment,
  generateCashCode,
  getPaymentDetails,
  getPendingPayments,
  registerCashPayment,
  type PendingDebt,
} from '../../api/payments';
import type { Payment } from '../../types/rideApi';
import i18n from '../../i18n';

export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: string;
  rideId: string;
}

export interface CreatePaymentIntentData {
  rideId: string;
  amount: number;
  currency?: string;
}

const tr = (path: string) => i18n.t(`services.paymentsService.${path}`) as string;

class PaymentsService {
  /** @deprecated Sin Stripe intents en v2 — usar registerCashPayment / changePaymentMethod. */
  async createPaymentIntent(_data: CreatePaymentIntentData): Promise<PaymentIntent> {
    throw new Error(tr('errors.createFailed'));
  }

  /** Historial de pagos → getPendingPayments (deuda) + detalle por rideId. */
  async getPaymentHistory(_userId: string): Promise<any[]> {
    const { payments } = await getPendingPayments();
    return payments;
  }

  // Fachada v2 (los consumidores pueden migrar a llamadas directas luego)
  registerCashPayment = (rideId: string, tip = 0): Promise<Payment> =>
    registerCashPayment(rideId, tip);
  confirmCashPayment = (rideId: string): Promise<Payment> => confirmCashPayment(rideId);
  generateCashCode = (rideId: string) => generateCashCode(rideId);
  cancelCashPayment = (rideId: string, reason?: string): Promise<Payment> =>
    cancelCashPayment(rideId, reason);
  getPendingPayments = (): Promise<{ payments: PendingDebt[]; totalDebt: number }> =>
    getPendingPayments();
  changePaymentMethod = (rideId: string, paymentMethod: 'cash' | 'card'): Promise<Payment> =>
    changePaymentMethod(rideId, paymentMethod);
  getPaymentDetails = (rideId: string): Promise<Payment> => getPaymentDetails(rideId);
}

export default new PaymentsService();
