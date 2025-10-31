/**
 * DriverService Model - Servicios de conductores
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DriverService extends Model {
  declare id: string;
  declare driver_id: string;
  declare service_id: string;
  declare status: string;
  declare approved_at: Date | null;
  declare created_at: Date;
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
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'driver_services',
    timestamps: false,
  }
);

export default DriverService;
