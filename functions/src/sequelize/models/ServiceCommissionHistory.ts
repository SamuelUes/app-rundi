/**
 * ServiceCommissionHistory Model - Historial de comisiones
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class ServiceCommissionHistory extends Model {
  declare id: string;
  declare service_id: string;
  declare old_commission_rate: number;
  declare new_commission_rate: number;
  declare changed_at: Date;
}

ServiceCommissionHistory.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    service_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    old_commission_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
    },
    new_commission_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
    },
    changed_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'service_commission_history',
    timestamps: false,
  }
);

export default ServiceCommissionHistory;
