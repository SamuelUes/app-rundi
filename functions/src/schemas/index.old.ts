/**
 * Central export for all Zod schemas
 * Importar desde aquí para mantener consistencia
 */

// Ride schemas
export * from './ride.schema.old';

// Payment schemas
export {
  PaymentStatusSchema,
  PaymentProviderSchema,
  CreatePaymentInputSchema,
  ConfirmCashPaymentInputSchema,
  CancelPaymentInputSchema,
  CreateCardPaymentIntentInputSchema,
  LocalBankPaymentInputSchema,
  PaymentSchema,
  type PaymentStatus,
  type PaymentProvider,
  type CreatePaymentInput,
  type ConfirmCashPaymentInput,
  type CancelPaymentInput,
  type CreateCardPaymentIntentInput,
  type LocalBankPaymentInput,
  type Payment,
} from './payment.schema.old';

// Driver schemas
export * from './driver.schema.old';

// Service schemas
export * from './service.schema.old';
