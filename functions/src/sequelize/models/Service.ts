/**
 * Service Model - Servicios disponibles
 */

import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Service extends Model {
  declare id: string;
  declare name: string;
  declare description: string | null;
  declare commission_rate: number;
  declare status: string;
  declare created_at: Date;
}

Service.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    commission_rate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'services',
    timestamps: false,
  }
);

export default Service;
