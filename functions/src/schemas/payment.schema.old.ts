/**
 * Zod Schemas para validación de Payments
 * ✅ ACTUALIZADO: Sin Stripe - Solo bancos locales y efectivo
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
]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// ============================================
// PAYMENT METHOD ENUM
// ============================================
// cash: Efectivo
// card: Tarjeta (bancos locales: BAC, Banpro, Lafise, Ficohsa, Avanz)
export const PaymentMethodSchema = z.enum([
  'cash',
  'card',
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ============================================
// PAYMENT PROVIDER ENUM
// ============================================
// cash: Pago en efectivo
// local: Bancos nacionales (BAC, Banpro, Lafise, Ficohsa, Avanz)
export const PaymentProviderSchema = z.enum([
  'cash',
  'local',
]);

export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

// ============================================
// CREATE PAYMENT INPUT
// ============================================
export const CreatePaymentInputSchema = z.object({
  rideId: z.string().min(1), // Acepta Firebase IDs y UUIDs
  amount: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('amount debe ser positivo');
      return num;
    }),
  ]),
  tip: z.union([
    z.number().min(0),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error('tip debe ser >= 0');
      return num;
    }),
  ]).default(0),
  commission: z.number().min(0).default(0),
  paymentMethod: PaymentMethodSchema.optional().default('cash'),
  paymentProvider: PaymentProviderSchema.optional().default('cash'),
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
  amount: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('amount debe ser positivo');
      return num;
    }),
  ]),
  tip: z.union([
    z.number().min(0),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error('tip debe ser >= 0');
      return num;
    }),
  ]).default(0),
  confirmedBy: z.enum(['client', 'driver']),
  userId: z.string().min(1),
});

export type ConfirmCashPaymentInput = z.infer<typeof ConfirmCashPaymentInputSchema>;

// ============================================
// CANCEL PAYMENT INPUT
// ============================================
export const CancelPaymentInputSchema = z.object({
  paymentId: z.string().min(1), // Acepta Firebase IDs y UUIDs
  cancelReason: z.string().min(1).max(500),
  canceledBy: z.string().min(1),
});

export type CancelPaymentInput = z.infer<typeof CancelPaymentInputSchema>;

// ============================================
// CARD PAYMENT INTENT INPUT (Bancos Nacionales)
// ============================================
export const CreateCardPaymentIntentInputSchema = z.object({
  rideId: z.string().min(1),
  amount: z.number().positive(),
  tip: z.number().min(0).default(0),
  bank: z.enum(['bac', 'banpro', 'lafise', 'ficohsa', 'avanz']),
  transactionId: z.string().optional(),
  authorizationCode: z.string().optional(),
});

export type CreateCardPaymentIntentInput = z.infer<typeof CreateCardPaymentIntentInputSchema>;

// ============================================
// LOCAL BANK PAYMENT INPUT
// ============================================
export const LocalBankPaymentInputSchema = z.object({
  rideId: z.string().min(1), // Acepta Firebase IDs y UUIDs
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
  id: z.string().min(1), // Acepta Firebase IDs y UUIDs
  rideId: z.string().min(1), // Acepta Firebase IDs y UUIDs
  amount: z.number(),
  tip: z.number(),
  total: z.number(),
  commission: z.number(),
  paymentMethod: PaymentMethodSchema,
  paymentProvider: PaymentProviderSchema,
  status: PaymentStatusSchema,
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
