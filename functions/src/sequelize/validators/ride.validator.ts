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
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().optional(),
  }),
  destination: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
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
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().optional(),
  })).max(10).optional(),
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
  deviceId: z.string().optional(),
  pickupCode: z.string().optional(),
  vehicleInspection: z.object({
    inspected: z.boolean().optional(),
    inspection_id: z.string().optional(),
    timestamp: z.number().optional(),
    photos: z.record(z.string()).optional(),
  }).passthrough().optional(),
});

export const CompleteRideSchema = z.object({
  rideId: z.string().min(1, 'ID de viaje requerido'),
  // La tarifa enviada por el cliente es solo de referencia: el callable usa la
  // tarifa autoritativa del viaje (getNegotiatedFare) cuando existe.
  finalFare: z.number().positive('Tarifa final debe ser positiva').max(500000, 'Tarifa fuera de rango'),
  driverId: z.string().optional(),
  // Métricas reales del viaje reportadas por la app (advisory, validadas y capadas)
  actualDistance: z.number().nonnegative().max(500000).optional(), // metros, cap 500 km
  actualDuration: z.number().nonnegative().max(86400000).optional(), // ms, cap 24 h
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
