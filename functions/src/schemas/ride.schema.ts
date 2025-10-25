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
  'card',
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ============================================
// VEHICLE TYPE ENUM
// ============================================
export const VehicleTypeSchema = z.enum([
  'auto',
  'moto',
  'car',
  'motorcycle',
  'sedan',
  'suv',
  'van',
  'designated_driver',
]);

export type VehicleType = z.infer<typeof VehicleTypeSchema>;

// ============================================
// CREATE RIDE INPUT
// ============================================
export const CreateRideInputSchema = z.object({
  clientId: z.string().min(1),
  origin: LocationSchema,
  destination: LocationSchema,
  // ✅ NUEVO: Código del servicio (normal, designated_driver, night, motorcycle, etc)
  serviceCode: z.string().min(1).default('normal'),
  estimatedDistance: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('estimatedDistance debe ser positivo');
      return num;
    }),
  ]),
  estimatedDuration: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('estimatedDuration debe ser positivo');
      return num;
    }),
  ]),
  estimatedPrice: z.number().min(30).max(500), // Rango realista de precios
  paymentMethod: PaymentMethodSchema.optional().default('cash'),
  clientSuggestedPrice: z.number().min(30).max(500).optional(), // Rango realista
  rideType: z.enum(['normal', 'designated_driver']).optional().default('normal'),
  isDesignatedDriver: z.boolean().default(false),
  vehicleType: VehicleTypeSchema.optional(),
  clientVehiclePhoto: z.string().optional(), // Para conductor designado
  passengers: z.number().int().min(1).max(6).optional(),
  extraDestinations: z.array(LocationSchema).optional(),
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
  offeredPrice: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('offeredPrice debe ser positivo');
      return num;
    }),
  ]),
  estimatedArrival: z.number().positive().optional(),
  vehicleId: z.string().optional(),
  currentLocation: LocationSchema,
  driverProposedPrice: z.number().positive().optional(),
});

export type AcceptRideInput = z.infer<typeof AcceptRideInputSchema>;

// ============================================
// CONFIRM DRIVER INPUT (Client)
// ============================================
export const ConfirmDriverInputSchema = z.object({
  rideId: z.string().min(1),
  driverId: z.string().min(1),
  agreedPrice: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('agreedPrice debe ser positivo');
      return num;
    }),
  ]),
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
  driverId: z.string().min(1).optional(), // Opcional porque el backend obtiene del context
  actualDistance: z.union([
    z.number().min(0), // Permitir 0
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error('actualDistance debe ser >= 0');
      return num;
    }),
  ]).optional(),
  actualDuration: z.union([
    z.number().min(0), // Permitir 0
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) throw new Error('actualDuration debe ser >= 0');
      return num;
    }),
  ]).optional(),
  finalFare: z.union([
    z.number().positive(),
    z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) throw new Error('finalFare debe ser un número positivo');
      return num;
    }),
  ]).optional(),
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
  canceledBy: z.enum(['client', 'driver', 'system']).optional(), // Opcional porque el backend obtiene del context
  cancelReason: z.string().min(1).max(500).optional(), // Opcional
  reason: z.string().min(1).max(500).optional(), // Alias para cancelReason
  userId: z.string().min(1).optional(), // Opcional porque el backend obtiene del context
}).transform((data) => ({
  ...data,
  cancelReason: data.cancelReason || data.reason || 'Sin razón especificada',
}));

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
