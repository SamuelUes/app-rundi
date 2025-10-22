/**
 * Zod Schemas para validación de Payments
 */

import { z } from 'zod';

// ============================================
// PAYMENT STATUS ENUM
// ============================================
export const PaymentStatusSchema = z.enum([
  'pending',
  'pending_confirmation',
  'completed',
  'canceled',
  'failed',
  'refunded',
  'partial_charged',
]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ============================================
// PAYMENT METHOD ENUM
// ============================================
export const PaymentMethodSchema = z.enum([
  'cash',
  'stripe',
  'bac',
  'banpro',
  'lafise',
  'ficohsa',
  'avanz',
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ============================================
// PAYMENT PROVIDER ENUM
// ============================================
export const PaymentProviderSchema = z.enum([
  'cash',
  'stripe',
  'local',
]);

export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

// ============================================
// CREATE PAYMENT INPUT
// ============================================
export const CreatePaymentInputSchema = z.object({
  rideId: z.string().uuid(),
  amount: z.number().positive(),
  tip: z.number().min(0).default(0),
  commission: z.number().min(0),
  paymentMethod: PaymentMethodSchema,
  paymentProvider: PaymentProviderSchema,
  stripePaymentIntentId: z.string().optional(),
  stripeChargeId: z.string().optional(),
  localTransactionId: z.string().optional(),
  localAuthorizationCode: z.string().optional(),
  localBank: z.enum(['bac', 'banpro', 'lafise', 'ficohsa', 'avanz']).optional(),
  notes: z.string().max(1000).optional(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentInputSchema>;

// ============================================
// CONFIRM CASH PAYMENT INPUT
// ============================================
export const ConfirmCashPaymentInputSchema = z.object({
  rideId: z.string().min(1),
  amount: z.number().positive(),
  tip: z.number().min(0).default(0),
  confirmedBy: z.enum(['client', 'driver']),
  userId: z.string().min(1),
});

export type ConfirmCashPaymentInput = z.infer<typeof ConfirmCashPaymentInputSchema>;

// ============================================
// CANCEL PAYMENT INPUT
// ============================================
export const CancelPaymentInputSchema = z.object({
  paymentId: z.string().uuid(),
  cancelReason: z.string().min(1).max(500),
  canceledBy: z.string().min(1),
});

export type CancelPaymentInput = z.infer<typeof CancelPaymentInputSchema>;

// ============================================
// STRIPE PAYMENT INTENT INPUT
// ============================================
export const CreateStripePaymentIntentInputSchema = z.object({
  rideId: z.string().min(1),
  amount: z.number().positive(),
  tip: z.number().min(0).default(0),
  currency: z.string().default('usd'),
  customerId: z.string().optional(),
  paymentMethodId: z.string().optional(),
});

export type CreateStripePaymentIntentInput = z.infer<typeof CreateStripePaymentIntentInputSchema>;

// ============================================
// LOCAL BANK PAYMENT INPUT
// ============================================
export const LocalBankPaymentInputSchema = z.object({
  rideId: z.string().uuid(),
  amount: z.number().positive(),
  tip: z.number().min(0).default(0),
  bank: z.enum(['bac', 'banpro', 'lafise', 'ficohsa', 'avanz']),
  transactionId: z.string().min(1),
  authorizationCode: z.string().min(1),
});

export type LocalBankPaymentInput = z.infer<typeof LocalBankPaymentInputSchema>;

// ============================================
// PAYMENT FULL SCHEMA (Response)
// ============================================
export const PaymentSchema = z.object({
  id: z.string().uuid(),
  rideId: z.string().uuid(),
  amount: z.number(),
  tip: z.number(),
  total: z.number(),
  commission: z.number(),
  paymentMethod: PaymentMethodSchema,
  paymentProvider: PaymentProviderSchema,
  status: PaymentStatusSchema,
  stripePaymentIntentId: z.string().optional(),
  stripeChargeId: z.string().optional(),
  localTransactionId: z.string().optional(),
  localAuthorizationCode: z.string().optional(),
  localBank: z.string().optional(),
  notes: z.string().optional(),
  cancelReason: z.string().optional(),
  syncedToFirebase: z.boolean().default(false),
  firebaseSyncedAt: z.date().optional(),
  paidAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Payment = z.infer<typeof PaymentSchema>;
