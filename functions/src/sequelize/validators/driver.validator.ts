/**
 * Driver Validator - Validación Zod para Sequelize
 */

import { z } from 'zod';

export const CreateDriverProfileSchema = z.object({
  licenseNumber: z.string().min(1, 'Número de licencia requerido'),
  licenseExpiry: z.string().or(z.date()),
  profilePhoto: z.string().optional(),
  licenseFront: z.string().optional(),
  licenseBack: z.string().optional(),
  department: z.string().optional(),
  municipality: z.string().optional(),
});

export const UpdateDriverProfileSchema = z.object({
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().or(z.date()).optional(),
  profilePhoto: z.string().optional(),
  licenseFront: z.string().optional(),
  licenseBack: z.string().optional(),
  department: z.string().optional(),
  municipality: z.string().optional(),
});

export const ChangeDriverStatusSchema = z.object({
  driverId: z.string().uuid('ID de conductor inválido'),
  status: z.enum(['pending', 'active', 'suspended', 'rejected']),
  reason: z.string().optional(),
});

export const VerifyDriverSchema = z.object({
  driverId: z.string().uuid('ID de conductor inválido'),
  verificationNotes: z.string().optional(),
});

export type CreateDriverProfile = z.infer<typeof CreateDriverProfileSchema>;
export type UpdateDriverProfile = z.infer<typeof UpdateDriverProfileSchema>;
export type ChangeDriverStatus = z.infer<typeof ChangeDriverStatusSchema>;
export type VerifyDriver = z.infer<typeof VerifyDriverSchema>;
