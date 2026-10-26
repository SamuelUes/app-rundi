/**
 * LicenseCategoryRule Model - Matriz categoría de licencia ↔ vehículo ↔ servicio
 * confirmed_by_source=false jamás produce BLOCKING automático
 * (LEGAL_REQUIREMENTS.md §3).
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class LicenseCategoryRule extends Model {
  declare id: string;
  declare vehicle_type: string;
  declare service_code: string;
  declare required_categories: string[];
  declare severity: string;
  declare confirmed_by_source: boolean;
  declare legal_source: string | null;
  declare notes: string | null;
  declare is_active: boolean;
}

LicenseCategoryRule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vehicle_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    service_code: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '*',
    },
    required_categories: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'BLOCKING',
    },
    confirmed_by_source: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    legal_source: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
  },
  {
    sequelize,
    tableName: 'license_category_rules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default LicenseCategoryRule;
