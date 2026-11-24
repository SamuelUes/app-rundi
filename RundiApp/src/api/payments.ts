/**
 * API v2 — payments. Confirmación de efectivo por el conductor
 * (reemplaza confirmCashPayment de v1). trip completed ≠ payment settled.
 */

import client from './client';
import type { Payment } from '../types/rideApi';

/** Driver confirma pago en efectivo del viaje; 409 si no hay pago pendiente.
 * `code` = código de 4 dígitos que el cliente lee de payments_live/private/cash. */
export async function confirmCashPayment(rideId: string, code?: string): Promise<Payment> {
  const { data } = await client.post<{ payment: Payment; event: string }>(
    '/payments/confirm-cash',
    { rideId, code },
  );
  return data.payment;
}

/** Evidencia de autenticación del cobro (paridad v1: se archiva en payments). */
export interface CashPaymentAuth {
  authenticationMethod?: 'biometric' | 'sms' | 'manual' | 'code';
  biometricType?: string;
  biometricAuthenticated?: boolean;
}

/** Participante declara pago en efectivo (pending_confirmation + tip + auth). */
export async function registerCashPayment(rideId: string, tip = 0, auth?: CashPaymentAuth): Promise<Payment> {
  const { data } = await client.post<{ payment: Payment }>(
    '/payments/register-cash',
    { rideId, tip, ...auth },
  );
  return data.payment;
}

/** Driver (re)genera el código de confirmación. No lo devuelve: se proyecta a
 * payments_live/{liveId}/private/cash, legible solo por el cliente. */
export async function generateCashCode(rideId: string): Promise<{ sent: boolean }> {
  const { data } = await client.post<{ sent: boolean }>(
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
  driverId: string;
  driverName?: string;
  driverPhoto?: string;
  paymentMethod: 'cash' | 'card';
  amount: number;
  tip: number;
  total: number;
  origin?: string;
  destination?: string;
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
