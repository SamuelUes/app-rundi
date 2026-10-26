/**
 * Columnas comunes a todas las tablas de documentos de compliance
 * (status, verificación, evidencia, OCR-ready, renovación, soft delete).
 * Ver database/COMPLIANCE_ARCHITECTURE.md §B.
 */

import { DataTypes } from 'sequelize';

export const documentStatusValues = [
  'pending',
  'in_review',
  'verified',
  'rejected',
  'requires_review',
  'expired',
] as const;

export type DocumentStatus = (typeof documentStatusValues)[number];

export const verificationMethodValues = [
  'manual',
  'ocr',
  'api',
  'migrated',
  'self_declared',
] as const;

export type VerificationMethod = (typeof verificationMethodValues)[number];

export interface DocumentAttributes {
  id: string;
  status: DocumentStatus;
  verified_at: Date | null;
  verified_by: string | null;
  verification_method: VerificationMethod;
  rejection_reason: string | null;
  review_notes: string | null;
  document_path: string | null;
  document_path_back?: string | null;
  extracted_data: Record<string, any> | null;
  extraction_confidence: number | null;
  extracted_at: Date | null;
  supersedes_id: string | null;
  is_current: boolean;
  created_at: Date;
  updated_at: Date;
}

export function documentColumns(backPhoto: boolean = true) {
  const columns: Record<string, any> = {
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: `Estado del documento: ${documentStatusValues.join('|')}`,
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verified_by: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Firebase UID del admin/operador que verificó',
    },
    verification_method: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'self_declared',
      comment: `Método: ${verificationMethodValues.join('|')}`,
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    review_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    document_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Path en Supabase Storage (nunca binario en DB)',
    },
    extracted_data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Datos extraídos por OCR (futuro)',
    },
    extraction_confidence: {
      type: DataTypes.DECIMAL(4, 3),
      allowNull: true,
    },
    extracted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    supersedes_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Documento al que este reemplaza (renovación)',
    },
    is_current: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Marca el documento vigente por sujeto/tipo',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  };

  if (backPhoto) {
    columns.document_path_back = {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Path del reverso del documento',
    };
  }

  return columns;
}
