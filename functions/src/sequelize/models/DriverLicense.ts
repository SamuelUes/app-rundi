/**
 * DriverLicense Model - Historial de licencias de conducir (Ley 431 Art. 140)
 * is_current marca la licencia vigente; supersedes_id encadena renovaciones.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import { documentColumns } from './docColumns';

class DriverLicense extends Model {
  declare id: string;
  declare driver_id: string;
  declare license_number: string | null;
  declare license_type: string;
  declare categories: string[];
  declare issue_date: string | null;
  declare expiry_date: string | null;
  declare reported_status: string | null;
  declare document_path: string | null;
  declare document_path_back: string | null;
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

DriverLicense.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    driver_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    license_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    license_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ordinaria',
      comment: 'ordinaria|profesional|menor_de_edad|especial|permiso (Ley 431 Art. 140/147)',
    },
    categories: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      comment: 'Categorías: 1,2,3,4a,4b,5a,5b,6a,6b,7,8',
    },
    issue_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Vigencia legal 5 años (permiso: 90 días)',
    },
    reported_status: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Estado administrativo reportado: valid|suspended|canceled',
    },
    ...documentColumns(true),
  },
  {
    sequelize,
    tableName: 'driver_licenses',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default DriverLicense;
