/**
 * Ride Validator - Validación Zod para Sequelize
 */

import { z } from 'zod';

export const CreateRideSchema = z.object({
  firebaseRideId: z.string().min(1, 'Firebase Ride ID requerido'),
  clientId: z.string().min(1, 'ID de cliente requerido'),
  driverId: z.string().optional(),
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

/**
 * Schema para la API createRide (datos recibidos del Frontend).
 * Valida la estructura del payload antes de procesar.
 */
export const CreateRideRequestSchema = z.object({
  origin: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }),
  destination: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }),
  estimatedDistance: z.number().optional(),
  estimatedDuration: z.number().optional(),
  estimatedPrice: z.number().optional(),
  rideType: z.string().optional(),
  vehicleType: z.string().optional(),
  designatedDriverVehicle: z.any().optional(),
  passengers: z.number().optional(),
  clientVehiclePhoto: z.string().optional(),
  extraDestinations: z.array(z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  })).optional(),
  clientComment: z.string().optional(),
  comment: z.string().optional(),
  notes: z.string().optional(),
  serviceCodeOverride: z.string().optional(),
  driverId: z.string().optional(),
  isProgrammed: z.boolean().optional(),
  scheduledAt: z.number().optional(),
}).passthrough(); // Permite campos adicionales por compatibilidad

export const AcceptRideSchema = z.object({
  rideId: z.string().min(1, 'ID de viaje requerido'),
  vehicleId: z.string().optional(),
  deviceId: z.string().optional(),
});

export const StartRideSchema = z.object({
  rideId: z.string().min(1, 'ID de viaje requerido'),
});

export const CompleteRideSchema = z.object({
  rideId: z.string().min(1, 'ID de viaje requerido'),
  finalFare: z.number().positive('Tarifa final debe ser positiva'),
  driverId: z.string().optional(),
});

export const CancelRideSchema = z.object({
  rideId: z.string().min(1, 'ID de viaje requerido'),
  reason: z.string().optional(),
  canceledBy: z.string().optional(),
  deviceId: z.string().optional(),
});

export const GetRideDetailsSchema = z.object({
  rideId: z.string().min(1, 'ID de viaje requerido'),
});

export type CreateRide = z.infer<typeof CreateRideSchema>;
export type CreateRideRequest = z.infer<typeof CreateRideRequestSchema>;
export type AcceptRide = z.infer<typeof AcceptRideSchema>;
export type StartRide = z.infer<typeof StartRideSchema>;
export type CompleteRide = z.infer<typeof CompleteRideSchema>;
export type CancelRide = z.infer<typeof CancelRideSchema>;
export type GetRideDetails = z.infer<typeof GetRideDetailsSchema>;
