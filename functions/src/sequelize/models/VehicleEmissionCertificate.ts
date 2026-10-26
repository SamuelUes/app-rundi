/**
 * VehicleEmissionCertificate Model - Certificado de control de emisiones
 * Vigencia legal: 1 año (Ley 431 Art. 62); talleres autorizados MTI+MARENA.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import { documentColumns } from './docColumns';

class VehicleEmissionCertificate extends Model {
  declare id: string;
  declare vehicle_id: string;
  declare tested_at: string | null;
  declare result: string | null;
  declare certificate_number: string | null;
  declare valid_until: string | null;
  declare issuer: string | null;
  declare document_path: string | null;
  declare status: string;
  declare verified_at: Date | null;
  declare verified_by: string | null;
  declare verification_method: string;
  declare rejection_reason: string | null;
  declare review_notes: string | null;
  declare extracted_data: Record<string, any> | null;
  declare extraction_confidence: number | null;
  declare extracted_at: Date | null;
  declare supersedes_id: string | null;
  declare is_current: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

VehicleEmissionCertificate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vehicle_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    tested_at: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'approved|rejected|conditional',
    },
    certificate_number: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    valid_until: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Vigencia legal: 1 año (Art. 62)',
    },
    issuer: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    ...documentColumns(false),
  },
  {
    sequelize,
    tableName: 'vehicle_emission_certificates',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default VehicleEmissionCertificate;
