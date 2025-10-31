/**
 * Zod Schemas para validación de Vehicles
 */

import { z } from 'zod';

// ============================================
// VEHICLE TYPE ENUM
// ============================================
export const VehicleTypeSchema = z.enum([
  'sedan',
  'suv',
  'van',
  'pickup',
  'motorcycle',
  'car',
]);

export type VehicleType = z.infer<typeof VehicleTypeSchema>;

// ============================================
// FUEL TYPE ENUM
// ============================================
export const FuelTypeSchema = z.enum([
  'gasoline',
  'diesel',
  'electric',
  'hybrid',
]);

export type FuelType = z.infer<typeof FuelTypeSchema>;

// ============================================
// VEHICLE CLASS ENUM (Nicaragua)
// ============================================
export const VehicleClassSchema = z.enum([
  'particular',
  'publico',
  'oficial',
  'diplomatico',
]);

export type VehicleClass = z.infer<typeof VehicleClassSchema>;

// ============================================
// CREATE VEHICLE INPUT
// ============================================
export const CreateVehicleInputSchema = z.object({
  driverId: z.string().uuid(),
  brand: z.string().min(1).max(50),
  model: z.string().min(1).max(50),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  color: z.string().min(1).max(50),
  plate: z.string().min(1).max(20),
  type: VehicleTypeSchema,
  is_4x4: z.boolean().default(false),
  
  // Campos oficiales de Nicaragua
  motor: z.string().max(50).optional(),
  chasis: z.string().max(50).optional(),
  vin: z.string().max(50).optional(),
  cylinders: z.number().int().positive().optional(),
  passengers: z.number().int().positive().optional(),
  fuelType: FuelTypeSchema.optional(),
  tonnage: z.number().positive().optional(),
  vehicleClass: VehicleClassSchema.optional(),
  serviceType: z.string().max(50).optional(),
  lien: z.string().max(100).optional(),
  emissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  
  // Documentos
  registrationDocument: z.string().url().optional(),
  insuranceDocument: z.string().url().optional(),
  insuranceStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  insuranceExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  technicalInspection: z.string().url().optional(),
  technicalInspectionExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateVehicleInput = z.infer<typeof CreateVehicleInputSchema>;

// ============================================
// UPDATE VEHICLE INPUT
// ============================================
export const UpdateVehicleInputSchema = z.object({
  brand: z.string().min(1).max(50).optional(),
  model: z.string().min(1).max(50).optional(),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
  color: z.string().min(1).max(50).optional(),
  plate: z.string().min(1).max(20).optional(),
  type: VehicleTypeSchema.optional(),
  is_4x4: z.boolean().optional(),
  
  motor: z.string().max(50).optional(),
  chasis: z.string().max(50).optional(),
  vin: z.string().max(50).optional(),
  cylinders: z.number().int().positive().optional(),
  passengers: z.number().int().positive().optional(),
  fuelType: FuelTypeSchema.optional(),
  tonnage: z.number().positive().optional(),
  vehicleClass: VehicleClassSchema.optional(),
  serviceType: z.string().max(50).optional(),
  lien: z.string().max(100).optional(),
  emissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  
  registrationDocument: z.string().url().optional(),
  insuranceDocument: z.string().url().optional(),
  insuranceStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  insuranceExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  technicalInspection: z.string().url().optional(),
  technicalInspectionExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateVehicleInput = z.infer<typeof UpdateVehicleInputSchema>;

// ============================================
// VEHICLE FULL SCHEMA (Response)
// ============================================
export const VehicleSchema = z.object({
  id: z.string().uuid(),
  driverId: z.string().uuid(),
  brand: z.string(),
  model: z.string(),
  year: z.number(),
  color: z.string(),
  plate: z.string(),
  type: VehicleTypeSchema,
  is_4x4: z.boolean(),
  
  motor: z.string().optional(),
  chasis: z.string().optional(),
  vin: z.string().optional(),
  cylinders: z.number().optional(),
  passengers: z.number().optional(),
  fuelType: FuelTypeSchema.optional(),
  tonnage: z.number().optional(),
  vehicleClass: VehicleClassSchema.optional(),
  serviceType: z.string().optional(),
  lien: z.string().optional(),
  emissionDate: z.date().optional(),
  
  registrationDocument: z.string().optional(),
  insuranceDocument: z.string().optional(),
  insuranceStartDate: z.date().optional(),
  insuranceExpiryDate: z.date().optional(),
  technicalInspection: z.string().optional(),
  technicalInspectionExpiry: z.date().optional(),
  
  isApproved: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Vehicle = z.infer<typeof VehicleSchema>;
