/**
 * Compliance Validator - Validación Zod para documentos y verificación
 */

import { z } from 'zod';

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD')
  .or(z.date())
  .optional();

export const SubmitDriverLicenseSchema = z.object({
  licenseNumber: z.string().min(1, 'Número de licencia requerido').max(50),
  licenseType: z
    .enum(['ordinaria', 'profesional', 'menor_de_edad', 'especial', 'permiso'])
    .default('ordinaria'),
  categories: z.array(z.string().max(4)).default([]),
  issueDate: DateOnlySchema,
  expiryDate: DateOnlySchema,
  photoFront: z.string().max(500).optional(),
  photoBack: z.string().max(500).optional(),
});

export const SubmitVehicleDocumentSchema = z.object({
  vehicleId: z.string().uuid('ID de vehículo inválido'),
  documentType: z.enum([
    'circulation_card',
    'insurance',
    'inspection',
    'emissions',
    'road_tax',
    'revisado',
  ]),
  documentPath: z.string().max(500).optional(),
  documentPathBack: z.string().max(500).optional(),

  // circulation_card
  cardNumber: z.string().max(60).optional(),
  issuedAt: DateOnlySchema,
  declaredValidUntil: DateOnlySchema,

  // insurance
  policyNumber: z.string().max(60).optional(),
  insurerCode: z.string().max(60).optional(),
  insurerName: z.string().max(100).optional(),
  coverageType: z
    .enum(['rc_obligatorio', 'pasajeros', 'danios_propios', 'licencia_conductor', 'otro'])
    .default('rc_obligatorio'),
  effectiveFrom: DateOnlySchema,
  effectiveUntil: DateOnlySchema,
  insuredPlate: z.string().max(20).optional(),
  insuredVin: z.string().max(50).optional(),
  insuredMotor: z.string().max(50).optional(),
  insuredChasis: z.string().max(50).optional(),
  policyholderName: z.string().max(200).optional(),

  // inspection / emissions
  inspectedAt: DateOnlySchema,
  testedAt: DateOnlySchema,
  result: z.enum(['approved', 'rejected', 'conditional']).optional(),
  certificateNumber: z.string().max(60).optional(),
  validUntil: DateOnlySchema,
  issuer: z.string().max(200).optional(),

  // road_tax
  taxYear: z.number().int().min(2000).max(2100).optional(),
  municipality: z.string().max(100).optional(),
  paidAt: DateOnlySchema,
  receiptNumber: z.string().max(60).optional(),
  exempt: z.boolean().optional(),
  exemptReason: z.string().max(200).optional(),

  // revisado
  stickerYear: z.number().int().min(2000).max(2100).optional(),
});

export const CanOperateVehicleSchema = z.object({
  vehicleId: z.string().uuid('ID de vehículo inválido'),
  serviceCode: z.string().max(30).optional(),
});

export const ReviewDocumentSchema = z.object({
  documentTable: z.enum([
    'driver_licenses',
    'vehicle_circulation_cards',
    'vehicle_insurance_policies',
    'vehicle_inspections',
    'vehicle_emission_certificates',
    'vehicle_road_taxes',
    'vehicle_revisado_stickers',
  ]),
  documentId: z.string().uuid('ID de documento inválido'),
  action: z.enum(['approve', 'reject', 'request_review']),
  rejectionReason: z.string().max(500).optional(),
  reviewNotes: z.string().max(1000).optional(),
});

export const ListDocumentsForReviewSchema = z.object({
  status: z
    .enum(['pending', 'in_review', 'requires_review', 'rejected', 'verified'])
    .optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const AcknowledgeAlertSchema = z.object({
  alertId: z.string().uuid('ID de alerta inválido'),
});

export type SubmitDriverLicense = z.infer<typeof SubmitDriverLicenseSchema>;
export type SubmitVehicleDocument = z.infer<typeof SubmitVehicleDocumentSchema>;
export type CanOperateVehicle = z.infer<typeof CanOperateVehicleSchema>;
export type ReviewDocument = z.infer<typeof ReviewDocumentSchema>;
export type ListDocumentsForReview = z.infer<typeof ListDocumentsForReviewSchema>;
export type AcknowledgeAlert = z.infer<typeof AcknowledgeAlertSchema>;
