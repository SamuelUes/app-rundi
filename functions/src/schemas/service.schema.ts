/**
 * Zod Schemas para validación de Services
 */

import { z } from 'zod';

// ============================================
// SERVICE CODE ENUM
// ============================================
export const ServiceCodeSchema = z.enum([
  'normal',
  'designated_driver',
  'motorcycle',
  'night',
  'airport',
  'shared',
  'delivery',
  'moving',
]);

export type ServiceCode = z.infer<typeof ServiceCodeSchema>;

// ============================================
// CREATE SERVICE INPUT
// ============================================
export const CreateServiceInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  code: ServiceCodeSchema,
  commissionRate: z.number().min(0).max(1), // 0.10 = 10%
  basePrice: z.number().min(0),
  pricePerKm: z.number().min(0),
  pricePerMinute: z.number().min(0),
  minimumFare: z.number().min(0),
  vehicleTypes: z.array(z.string()).optional(),
  requiresSpecialLicense: z.boolean().default(false),
  maxDistanceKm: z.number().positive().optional(),
  availableHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(), // Hex color
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export type CreateServiceInput = z.infer<typeof CreateServiceInputSchema>;

// ============================================
// UPDATE SERVICE INPUT
// ============================================
export const UpdateServiceInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  basePrice: z.number().min(0).optional(),
  pricePerKm: z.number().min(0).optional(),
  pricePerMinute: z.number().min(0).optional(),
  minimumFare: z.number().min(0).optional(),
  vehicleTypes: z.array(z.string()).optional(),
  requiresSpecialLicense: z.boolean().optional(),
  maxDistanceKm: z.number().positive().optional(),
  availableHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export type UpdateServiceInput = z.infer<typeof UpdateServiceInputSchema>;

// ============================================
// ASSIGN SERVICE TO DRIVER INPUT
// ============================================
export const AssignServiceToDriverInputSchema = z.object({
  driverId: z.string().uuid(),
  serviceId: z.string().uuid(),
  customCommissionRate: z.number().min(0).max(1).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

export type AssignServiceToDriverInput = z.infer<typeof AssignServiceToDriverInputSchema>;

// ============================================
// APPROVE DRIVER SERVICE INPUT
// ============================================
export const ApproveDriverServiceInputSchema = z.object({
  driverServiceId: z.string().uuid(),
  approved: z.boolean(),
  notes: z.string().max(500).optional(),
});

export type ApproveDriverServiceInput = z.infer<typeof ApproveDriverServiceInputSchema>;

// ============================================
// GET COMMISSION FOR RIDE INPUT
// ============================================
export const GetCommissionForRideInputSchema = z.object({
  driverId: z.string().uuid(),
  serviceCode: ServiceCodeSchema,
});

export type GetCommissionForRideInput = z.infer<typeof GetCommissionForRideInputSchema>;

// ============================================
// SERVICE FULL SCHEMA (Response)
// ============================================
export const ServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  code: ServiceCodeSchema,
  commissionRate: z.number(),
  basePrice: z.number(),
  pricePerKm: z.number(),
  pricePerMinute: z.number(),
  minimumFare: z.number(),
  vehicleTypes: z.array(z.string()).optional(),
  requiresSpecialLicense: z.boolean(),
  maxDistanceKm: z.number().optional(),
  availableHours: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  displayOrder: z.number(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Service = z.infer<typeof ServiceSchema>;

// ============================================
// DRIVER SERVICE SCHEMA (Response)
// ============================================
export const DriverServiceSchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid(),
  serviceId: z.string().uuid(),
  customCommissionRate: z.number().optional(),
  isActive: z.boolean(),
  isApproved: z.boolean(),
  approvedBy: z.string().optional(),
  approvedAt: z.date().optional(),
  assignedAt: z.date(),
  expiresAt: z.date().optional(),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DriverService = z.infer<typeof DriverServiceSchema>;
