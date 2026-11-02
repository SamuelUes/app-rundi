/**
 * API v2 — payments. Confirmación de efectivo por el conductor
 * (reemplaza confirmCashPayment de v1). trip completed ≠ payment settled.
 */

import client from './client';
import type { Payment } from '../types/rideApi';

/** Driver confirma pago en efectivo del viaje; 409 si no hay pago pendiente. */
export async function confirmCashPayment(rideId: string): Promise<Payment> {
  const { data } = await client.post<{ payment: Payment; event: string }>(
    '/payments/confirm-cash',
    { rideId },
  );
  return data.payment;
}

/** Participante declara pago en efectivo (pending_confirmation + tip). */
export async function registerCashPayment(rideId: string, tip = 0): Promise<Payment> {
  const { data } = await client.post<{ payment: Payment }>(
    '/payments/register-cash',
    { rideId, tip },
  );
  return data.payment;
}

/** Driver genera el código de confirmación de 4 dígitos (flujo 'code'). */
export async function generateCashCode(rideId: string): Promise<{ code: string }> {
  const { data } = await client.post<{ code: string }>(
    '/payments/generate-cash-code',
    { rideId },
  );
  return data;
}

/** Participante cancela el pago pendiente. */
export async function cancelCashPayment(rideId: string, reason?: string): Promise<Payment> {
  const { data } = await client.post<{ payment: Payment }>(
    '/payments/cancel-cash',
    { rideId, reason },
  );
  return data.payment;
}

export interface PendingDebt {
  rideId: string;
  paymentId: string;
  amount: number;
  tip: number;
  total: number;
  status: string;
  createdAt: string;
}

/** Deudas pendientes del cliente (getPendingPayments v1). */
export async function getPendingPayments(): Promise<{ payments: PendingDebt[]; totalDebt: number }> {
  const { data } = await client.get<{ payments: PendingDebt[]; totalDebt: number }>(
    '/payments/pending',
  );
  return { payments: data.payments ?? [], totalDebt: data.totalDebt ?? 0 };
}

/** POST /v1/payments/change-method — cliente cambia cash↔card en pago pendiente. */
export async function changePaymentMethod(rideId: string, paymentMethod: 'cash' | 'card'): Promise<Payment> {
  const { data } = await client.post<{ payment: Payment }>('/payments/change-method', {
    rideId,
    paymentMethod,
  });
  return data.payment;
}

/** GET /v1/payments/ride/{rideId} — getPaymentDetails v1 (último pago del viaje). */
export async function getPaymentDetails(rideId: string): Promise<Payment> {
  const { data } = await client.get<{ payment: Payment }>(`/payments/ride/${rideId}`);
  return data.payment;
}
