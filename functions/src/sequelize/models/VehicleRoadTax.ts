/**
 * VehicleRoadTax Model - Impuesto municipal de rodamiento por año
 * Ley 431 Art. 11-12: pago durante el primer trimestre del año calendario;
 * exentos jubilados y personas con discapacidad.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';
import { documentColumns } from './docColumns';

class VehicleRoadTax extends Model {
  declare id: string;
  declare vehicle_id: string;
  declare tax_year: number;
  declare municipality: string | null;
  declare paid_at: string | null;
  declare receipt_number: string | null;
  declare exempt: boolean;
  declare exempt_reason: string | null;
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

VehicleRoadTax.init(
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
    tax_year: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    municipality: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    paid_at: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    receipt_number: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    exempt: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    exempt_reason: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    ...documentColumns(false),
  },
  {
    sequelize,
    tableName: 'vehicle_road_taxes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    paranoid: true,
    deletedAt: 'deleted_at',
  }
);

export default VehicleRoadTax;
