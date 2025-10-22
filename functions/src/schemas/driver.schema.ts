/**
 * Zod Schemas para validación de Drivers
 */

import { z } from 'zod';

// ============================================
// DRIVER STATUS ENUM
// ============================================
export const DriverStatusSchema = z.enum([
  'available',
  'busy',
  'offline',
  'in_ride',
]);

export type DriverStatus = z.infer<typeof DriverStatusSchema>;

// ============================================
// DESIGNATED DRIVER STATUS ENUM
// ============================================
export const DesignatedDriverStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
]);

export type DesignatedDriverStatus = z.infer<typeof DesignatedDriverStatusSchema>;

// ============================================
// DESIGNATED DRIVER ROLE ENUM
// ============================================
export const DesignatedDriverRoleSchema = z.enum([
  'designated_driver',
]);

export type DesignatedDriverRole = z.infer<typeof DesignatedDriverRoleSchema>;

// ============================================
// CREATE DRIVER INPUT
// ============================================
export const CreateDriverInputSchema = z.object({
  userId: z.string().min(1),
  licenseNumber: z.string().min(1).max(50),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  department: z.string().max(100).optional(),
  municipality: z.string().max(100).optional(),
  profilePhoto: z.string().url().optional(),
  licenseFront: z.string().url().optional(),
  licenseBack: z.string().url().optional(),
  backgroundCheck: z.string().url().optional(),
});

export type CreateDriverInput = z.infer<typeof CreateDriverInputSchema>;

// ============================================
// UPDATE DRIVER INPUT
// ============================================
export const UpdateDriverInputSchema = z.object({
  licenseNumber: z.string().min(1).max(50).optional(),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  department: z.string().max(100).optional(),
  municipality: z.string().max(100).optional(),
  profilePhoto: z.string().url().optional(),
  licenseFront: z.string().url().optional(),
  licenseBack: z.string().url().optional(),
  backgroundCheck: z.string().url().optional(),
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateDriverInput = z.infer<typeof UpdateDriverInputSchema>;

// ============================================
// UPDATE DRIVER LOCATION INPUT
// ============================================
export const UpdateDriverLocationInputSchema = z.object({
  driverId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  accuracy: z.number().positive().optional(),
});

export type UpdateDriverLocationInput = z.infer<typeof UpdateDriverLocationInputSchema>;

// ============================================
// UPDATE DRIVER STATUS INPUT
// ============================================
export const UpdateDriverStatusInputSchema = z.object({
  driverId: z.string().min(1),
  status: DriverStatusSchema,
  isDesignatedDriverMode: z.boolean().optional(),
});

export type UpdateDriverStatusInput = z.infer<typeof UpdateDriverStatusInputSchema>;

// ============================================
// REQUEST DESIGNATED DRIVER INPUT
// ============================================
export const RequestDesignatedDriverInputSchema = z.object({
  driverId: z.string().min(1),
  reason: z.string().min(10).max(500).optional(),
});

export type RequestDesignatedDriverInput = z.infer<typeof RequestDesignatedDriverInputSchema>;

// ============================================
// APPROVE/REJECT DESIGNATED DRIVER INPUT
// ============================================
export const ApproveDesignatedDriverInputSchema = z.object({
  driverId: z.string().min(1),
  approved: z.boolean(),
  notes: z.string().max(500).optional(),
});

export type ApproveDesignatedDriverInput = z.infer<typeof ApproveDesignatedDriverInputSchema>;

// ============================================
// DRIVER FULL SCHEMA (Response)
// ============================================
export const DriverSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  licenseNumber: z.string(),
  licenseExpiry: z.date(),
  department: z.string().optional(),
  municipality: z.string().optional(),
  profilePhoto: z.string().optional(),
  licenseFront: z.string().optional(),
  licenseBack: z.string().optional(),
  backgroundCheck: z.string().optional(),
  isApproved: z.boolean(),
  isActive: z.boolean(),
  averageRating: z.number().min(0).max(5).optional(),
  totalRides: z.number().min(0).default(0),
  designatedDriverRequestStatus: DesignatedDriverStatusSchema.optional(),
  designatedDriverRole: DesignatedDriverRoleSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Driver = z.infer<typeof DriverSchema>;

// ============================================
// DRIVER INFO (Firebase Realtime DB)
// ============================================
export const DriverInfoSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  photoURL: z.string().url().optional(),
  averageRating: z.string().optional(),
  status: DriverStatusSchema,
  lat: z.number(),
  lng: z.number(),
  lastUpdate: z.number(),
  vehicle: z.object({
    id: z.string(),
    brand: z.string(),
    model: z.string(),
    year: z.number(),
    color: z.string(),
    plate: z.string(),
    type: z.string(),
    is_4x4: z.boolean().optional(),
  }).optional(),
});

export type DriverInfo = z.infer<typeof DriverInfoSchema>;
