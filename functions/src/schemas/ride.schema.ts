/**
 * Zod Schemas para validación de Rides
 * Reemplaza la necesidad de Sequelize para validación
 */

import { z } from 'zod';

// ============================================
// LOCATION SCHEMA
// ============================================
export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).max(500),
});

export type Location = z.infer<typeof LocationSchema>;

// ============================================
// RIDE STATUS ENUM
// ============================================
export const RideStatusSchema = z.enum([
  'requested',
  'pending_confirm',
  'accepted',
  'driver_assigned',
  'in_progress',
  'completed',
  'canceled',
  'pending_payment',
]);

export type RideStatus = z.infer<typeof RideStatusSchema>;

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
// VEHICLE TYPE ENUM
// ============================================
export const VehicleTypeSchema = z.enum([
  'car',
  'motorcycle',
  'sedan',
  'suv',
  'van',
]);

export type VehicleType = z.infer<typeof VehicleTypeSchema>;

// ============================================
// CREATE RIDE INPUT
// ============================================
export const CreateRideInputSchema = z.object({
  clientId: z.string().min(1),
  origin: LocationSchema,
  destination: LocationSchema,
  estimatedDistance: z.number().positive(),
  estimatedDuration: z.number().positive(),
  estimatedPrice: z.number().positive(),
  paymentMethod: PaymentMethodSchema,
  clientSuggestedPrice: z.number().positive().optional(),
  isDesignatedDriver: z.boolean().default(false),
  vehicleType: VehicleTypeSchema.optional(),
  stops: z.array(LocationSchema).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateRideInput = z.infer<typeof CreateRideInputSchema>;

// ============================================
// UPDATE RIDE INPUT
// ============================================
export const UpdateRideInputSchema = z.object({
  status: RideStatusSchema.optional(),
  driverId: z.string().optional(),
  actualDistance: z.number().positive().optional(),
  actualDuration: z.number().positive().optional(),
  finalFare: z.number().positive().optional(),
  cancelReason: z.string().max(500).optional(),
  driverOfferedPrice: z.number().positive().optional(),
});

export type UpdateRideInput = z.infer<typeof UpdateRideInputSchema>;

// ============================================
// ACCEPT RIDE INPUT (Driver)
// ============================================
export const AcceptRideInputSchema = z.object({
  rideId: z.string().min(1),
  driverId: z.string().min(1),
  offeredPrice: z.number().positive(),
  estimatedArrival: z.number().positive().optional(),
});

export type AcceptRideInput = z.infer<typeof AcceptRideInputSchema>;

// ============================================
// CONFIRM DRIVER INPUT (Client)
// ============================================
export const ConfirmDriverInputSchema = z.object({
  rideId: z.string().min(1),
  driverId: z.string().min(1),
  agreedPrice: z.number().positive(),
});

export type ConfirmDriverInput = z.infer<typeof ConfirmDriverInputSchema>;

// ============================================
// START RIDE INPUT
// ============================================
export const StartRideInputSchema = z.object({
  rideId: z.string().min(1),
  driverId: z.string().min(1),
  startLocation: LocationSchema.optional(),
});

export type StartRideInput = z.infer<typeof StartRideInputSchema>;

// ============================================
// COMPLETE RIDE INPUT
// ============================================
export const CompleteRideInputSchema = z.object({
  rideId: z.string().min(1),
  driverId: z.string().min(1),
  actualDistance: z.number().positive(),
  actualDuration: z.number().positive(),
  finalFare: z.number().positive(),
  endLocation: LocationSchema.optional(),
  route: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
  })).optional(),
});

export type CompleteRideInput = z.infer<typeof CompleteRideInputSchema>;

// ============================================
// CANCEL RIDE INPUT
// ============================================
export const CancelRideInputSchema = z.object({
  rideId: z.string().min(1),
  canceledBy: z.enum(['client', 'driver', 'system']),
  cancelReason: z.string().min(1).max(500),
  userId: z.string().min(1),
});

export type CancelRideInput = z.infer<typeof CancelRideInputSchema>;

// ============================================
// GET AVAILABLE RIDES INPUT
// ============================================
export const GetAvailableRidesInputSchema = z.object({
  driverLat: z.number().min(-90).max(90),
  driverLng: z.number().min(-180).max(180),
  radius: z.number().positive().default(12), // 12 km por defecto
  isDesignatedDriver: z.boolean().default(false),
});

export type GetAvailableRidesInput = z.infer<typeof GetAvailableRidesInputSchema>;

// ============================================
// RIDE FULL SCHEMA (Response)
// ============================================
export const RideSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  driverId: z.string().optional(),
  origin: LocationSchema,
  destination: LocationSchema,
  estimatedDistance: z.number(),
  estimatedDuration: z.number(),
  estimatedPrice: z.number(),
  actualDistance: z.number().optional(),
  actualDuration: z.number().optional(),
  finalFare: z.number().optional(),
  status: RideStatusSchema,
  paymentMethod: PaymentMethodSchema,
  clientSuggestedPrice: z.number().optional(),
  driverOfferedPrice: z.number().optional(),
  isDesignatedDriver: z.boolean(),
  vehicleType: VehicleTypeSchema.optional(),
  stops: z.array(LocationSchema).optional(),
  notes: z.string().optional(),
  cancelReason: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
  canceledAt: z.number().optional(),
});

export type Ride = z.infer<typeof RideSchema>;
