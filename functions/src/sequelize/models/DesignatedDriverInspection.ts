/**
 * DesignatedDriverInspection Model - Inspecciones de conductor designado
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class DesignatedDriverInspection extends Model {
  declare id: string;
  declare ride_id: string;
  declare driver_id: string;
  declare inspection_photo: string | null;
  declare status: string;
  declare created_at: Date;
}

DesignatedDriverInspection.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ride_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    driver_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    inspection_photo: {
      type: DataTypes.STRING(500),
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
    tableName: 'designated_driver_inspections',
    timestamps: false,
  }
);

export default DesignatedDriverInspection;
