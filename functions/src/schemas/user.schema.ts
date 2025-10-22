/**
 * Zod Schemas para validación de Users
 */

import { z } from 'zod';

// ============================================
// USER ROLE ENUM
// ============================================
export const UserRoleSchema = z.enum([
  'client',
  'driver',
  'admin',
]);

export type UserRole = z.infer<typeof UserRoleSchema>;

// ============================================
// CREATE USER INPUT
// ============================================
export const CreateUserInputSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  phoneNumber: z.string().regex(/^\+\d{10,15}$/), // Formato internacional
  role: UserRoleSchema,
  photoURL: z.string().url().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

// ============================================
// UPDATE USER INPUT
// ============================================
export const UpdateUserInputSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  phoneNumber: z.string().regex(/^\+\d{10,15}$/).optional(),
  photoURL: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;

// ============================================
// USER FULL SCHEMA (Response)
// ============================================
export const UserSchema = z.object({
  id: z.string().uuid(),
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  phoneNumber: z.string(),
  role: UserRoleSchema,
  photoURL: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
