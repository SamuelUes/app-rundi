/**
 * Rating Validator - Validación Zod para Sequelize
 */

import { z } from 'zod';

export const SubmitRatingSchema = z.object({
  rideId: z.string().uuid('ID de viaje inválido'),
  fromUserId: z.string().min(1, 'ID de usuario requerido'),
  toUserId: z.string().min(1, 'ID de usuario destino requerido'),
  rating: z.number().min(1, 'Calificación mínima es 1').max(5, 'Calificación máxima es 5'),
  comment: z.string().optional(),
  punctuality: z.number().min(1).max(5).optional(),
  cleanliness: z.number().min(1).max(5).optional(),
  communication: z.number().min(1).max(5).optional(),
  driving: z.number().min(1).max(5).optional(),
  safety: z.number().min(1).max(5).optional(),
  friendliness: z.number().min(1).max(5).optional(),
});

export const GetDriverRatingsSchema = z.object({
  driverId: z.string().min(1, 'ID de conductor requerido'),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const GetAverageRatingSchema = z.object({
  driverId: z.string().min(1, 'ID de conductor requerido'),
});

export const GetCategoryAveragesSchema = z.object({
  driverId: z.string().min(1, 'ID de conductor requerido'),
});

export const GetRecentRatingsSchema = z.object({
  driverId: z.string().min(1, 'ID de conductor requerido'),
  days: z.number().optional(),
  limit: z.number().optional(),
});

export type SubmitRating = z.infer<typeof SubmitRatingSchema>;
export type GetDriverRatings = z.infer<typeof GetDriverRatingsSchema>;
export type GetAverageRating = z.infer<typeof GetAverageRatingSchema>;
export type GetCategoryAverages = z.infer<typeof GetCategoryAveragesSchema>;
export type GetRecentRatings = z.infer<typeof GetRecentRatingsSchema>;
