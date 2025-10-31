/**
 * Payment Validator - Validación Zod para Sequelize
 */

import { z } from 'zod';

export const RegisterCashPaymentSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
  amount: z.number().positive('Monto debe ser positivo'),
  tip: z.number().nonnegative('Propina no puede ser negativa').optional(),
  paymentMethod: z.enum(['cash', 'card']).optional(),
  driverId: z.string().optional(),
});

export const CompleteCashPaymentSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
  finalFare: z.number().positive('Tarifa final debe ser positiva'),
  tip: z.number().nonnegative('Propina no puede ser negativa').optional(),
  driverId: z.string().optional(),
});

export const CancelCashPaymentSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
  reason: z.string().optional(),
});

export const GetPaymentSchema = z.object({
  paymentId: z.string().uuid('ID de pago inválido'),
});

export const GetRidePaymentSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
});

export type RegisterCashPayment = z.infer<typeof RegisterCashPaymentSchema>;
export type CompleteCashPayment = z.infer<typeof CompleteCashPaymentSchema>;
export type CancelCashPayment = z.infer<typeof CancelCashPaymentSchema>;
export type GetPayment = z.infer<typeof GetPaymentSchema>;
export type GetRidePayment = z.infer<typeof GetRidePaymentSchema>;
