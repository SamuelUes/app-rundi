/**
 * DriverPenalty Model - Penalizaciones de conductores
 * @deprecated Legacy: reemplazado por drivers_recharges y current_recharge_balance.
 * Mantener solo para rollback/manual troubleshooting.
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DriverPenalty extends Model {
  declare id: string;
  declare driver_id: string;
  declare ride_id: string | null;
  declare penalty_type: string;
  declare amount: number;
  declare reason: string | null;
  declare status: string;
  declare created_at: Date;
}

DriverPenalty.init(
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
    penalty_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'driver_penalties',
    timestamps: false,
  }
);

export default DriverPenalty;
