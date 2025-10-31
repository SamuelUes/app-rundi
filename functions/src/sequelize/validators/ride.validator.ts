/**
 * Ride Validator - Validación Zod para Sequelize
 */

import { z } from 'zod';

export const CreateRideSchema = z.object({
  firebaseRideId: z.string().min(1, 'Firebase Ride ID requerido'),
  clientId: z.string().min(1, 'ID de cliente requerido'),
  driverId: z.string().min(1, 'ID de conductor requerido'),
  originLat: z.number().optional(),
  originLng: z.number().optional(),
  destinationLat: z.number().optional(),
  destinationLng: z.number().optional(),
  estimatedPrice: z.number().positive('Precio estimado debe ser positivo').optional(),
  distance: z.number().optional(),
  duration: z.number().optional(),
  rideType: z.string().optional(),
  vehicleType: z.string().optional(),
  passengers: z.number().optional(),
});

export const AcceptRideSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
});

export const StartRideSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
});

export const CompleteRideSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
  finalFare: z.number().positive('Tarifa final debe ser positiva'),
  driverId: z.string().optional(),
});

export const CancelRideSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
  reason: z.string().optional(),
});

export const GetRideDetailsSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
});

export type CreateRide = z.infer<typeof CreateRideSchema>;
export type AcceptRide = z.infer<typeof AcceptRideSchema>;
export type StartRide = z.infer<typeof StartRideSchema>;
export type CompleteRide = z.infer<typeof CompleteRideSchema>;
export type CancelRide = z.infer<typeof CancelRideSchema>;
export type GetRideDetails = z.infer<typeof GetRideDetailsSchema>;
