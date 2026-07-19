/**
 * DriverService Model - Servicios de conductores
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DriverService extends Model {
  declare id: string;
  declare driver_id: string;
  declare service_id: string;
  declare custom_commission_rate: number | null;
  declare is_active: boolean;
  declare is_approved: boolean;
  declare approved_by: string | null;
  declare approved_at: Date | null;
  declare assigned_at: Date;
  declare expires_at: Date | null;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DriverService.init(
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
    service_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    custom_commission_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true,
    },
    is_approved: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    approved_by: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    assigned_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'driver_services',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default DriverService;
