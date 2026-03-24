/**
 * DriverRecharge Model - Recargas y débitos de fondos de conductores
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DriverRecharge extends Model {
  declare id: string;
  declare driver_id: string;
  declare ride_id: string | null;
  declare recharge_type: string;
  declare source: string;
  declare amount: number;
  declare balance_before: number;
  declare balance_after: number;
  declare external_reference: string | null;
  declare external_transaction_id: string | null;
  declare metadata: Record<string, any> | null;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

DriverRecharge.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    driver_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    recharge_type: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'recharge',
    },
    source: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'manual',
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    balance_before: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    balance_after: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    external_reference: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    external_transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'confirmed',
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
    tableName: 'drivers_recharges',
    timestamps: false,
  },
);

export default DriverRecharge;
