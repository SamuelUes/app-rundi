/**
 * VehicleInsurancePolicy Model - Pólizas de seguro por cobertura
 * RC obligatoria (Ley 431 Art. 63, vigencia 1 año Art. 68) +
 * pasajeros (Art. 69.II) + coberturas optativas (Art. 71).
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import { documentColumns } from './docColumns';

class VehicleInsurancePolicy extends Model {
  declare id: string;
  declare vehicle_id: string;
  declare policy_number: string | null;
  declare insurer_code: string | null;
  declare insurer_name: string | null;
  declare coverage_type: string;
  declare effective_from: string | null;
  declare effective_until: string | null;
  declare insured_plate: string | null;
  declare insured_vin: string | null;
  declare insured_motor: string | null;
  declare insured_chasis: string | null;
  declare policyholder_name: string | null;
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

VehicleInsurancePolicy.init(
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
    policy_number: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    insurer_code: {
      type: DataTypes.STRING(60),
      allowNull: true,
      comment: 'FK lógica a insurers(code)',
    },
    insurer_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    coverage_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'rc_obligatorio',
      comment: 'rc_obligatorio|pasajeros|danios_propios|licencia_conductor|otro',
    },
    effective_from: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    effective_until: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Vigencia legal: 1 año desde emisión (Art. 68)',
    },
    insured_plate: { type: DataTypes.STRING(20), allowNull: true },
    insured_vin: { type: DataTypes.STRING(50), allowNull: true },
    insured_motor: { type: DataTypes.STRING(50), allowNull: true },
    insured_chasis: { type: DataTypes.STRING(50), allowNull: true },
    policyholder_name: { type: DataTypes.STRING(200), allowNull: true },
    ...documentColumns(false),
  },
  {
    sequelize,
    tableName: 'vehicle_insurance_policies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default VehicleInsurancePolicy;
