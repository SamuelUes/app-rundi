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
  // ✅ 'designated_driver' eliminado - ahora es un servicio en driver_services
]);

export type UserRole = z.infer<typeof UserRoleSchema>;

// ============================================
// CREATE USER INPUT (para registro)
// ============================================
export const CreateUserInputSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(2).max(100),
  phone: z.string().regex(/^\+505\d{8}$/), // Formato Nicaragua: +505 XXXX XXXX
  role: UserRoleSchema,
  driverData: z.object({
    licenseNumber: z.string().min(5),
    licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    licensePhoto: z.string().optional(),
    licensePhotoFront: z.string().optional(),
    licensePhotoBack: z.string().optional(),
    profilePhoto: z.string().optional(),
    department: z.string().optional(),
    municipality: z.string().optional(),
  }).optional(),
  vehicleData: z.object({
    plate: z.string().min(4),
    brand: z.string().min(2),
    model: z.string().min(2),
    year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
    color: z.string().min(2),
    type: z.enum(['sedan', 'suv', 'van', 'moto']),
    motor: z.string().optional(),
    chasis: z.string().optional(),
    vin: z.string().optional(),
    cylinders: z.number().optional(),
    passengers: z.number().optional(),
    fuelType: z.string().optional(),
    tonnage: z.string().optional(),
    vehicleClass: z.string().optional(),
    serviceType: z.string().optional(),
    lien: z.string().optional(),
    emissionDate: z.string().optional(),
    registrationNumber: z.string().optional(),
    registrationPhotoFront: z.string().optional(),
    registrationPhotoBack: z.string().optional(),
    insuranceNumber: z.string().optional(),
    insuranceCompany: z.string().optional(),
    insuranceStartDate: z.string().optional(),
    insuranceExpiry: z.string().optional(),
    insurancePhoto: z.string().optional(),
  }).optional(),
  authProvider: z.enum(['email/password', 'google']).optional(),
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
